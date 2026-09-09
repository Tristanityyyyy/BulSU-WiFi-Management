const db = require("../db");
const { getSettings, getRoleSessionMinutesMap } = require("../utils/settings");
const { CAPPED_ROLES } = require("../utils/constants");
const { getActivePriorities, emergencyDataCapGb } = require("../utils/emergency");

const MB = 1024 * 1024;

// Warn a user before they run out, rather than only telling them afterwards by
// disconnecting them.
//
// This lives on the server on purpose. The only warning that existed before was
// a browser Notification fired from the dashboard, which needed the tab open,
// the Notification API, and granted permission — on iOS Safari that combination
// means home-screen-installed pages only, so on the phones this portal actually
// serves it essentially never fired. The time warning was never written at all.
// A row in `notifications` reaches the user wherever they next look.
const DEFAULT_LOW_DATA_MB = 200;
const DEFAULT_LOW_TIME_MIN = 15;

async function getNoticeThresholds() {
  const stored = await getSettings(["notify_low_data_mb", "notify_low_time_min"]);
  const read = (key, fallback) => {
    const value = Number(stored[key]);
    // Negative is meaningless; 0 is a deliberate "don't warn about this".
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    lowDataMB: read("notify_low_data_mb", DEFAULT_LOW_DATA_MB),
    lowTimeMin: read("notify_low_time_min", DEFAULT_LOW_TIME_MIN),
  };
}

const roundMB = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

async function sweepSessionNotices() {
  const { lowDataMB, lowTimeMin } = await getNoticeThresholds();
  if (lowDataMB <= 0 && lowTimeMin <= 0) return { sent: 0 };

  // One pass over every live session, carrying today's usage with it, so the
  // sweep costs a fixed handful of queries rather than a few per session.
  const [rows] = await db.query(
    `SELECT s.id AS session_id, s.user_id, s.login_time, u.role,
            COALESCE(du.bytes_used, 0) AS bytes_used
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN data_usage du ON du.user_id = u.id AND du.usage_date = CURDATE()
      WHERE s.status = 'active'`
  );
  if (!rows.length) return { sent: 0 };

  const windows = await getRoleSessionMinutesMap([...new Set(rows.map((r) => r.role))]);
  const caps = await getSettings(CAPPED_ROLES.map((role) => `data_cap_gb_${role}`));
  // Emergency grants, so the warning below measures against the cutoff actually
  // in force. An account whose cap has been waived outright has nothing to run
  // out of and is not warned; one holding a measured grant still has a real
  // cutoff, just a higher one, and is warned against that.
  const priorities = await getActivePriorities();

  // Already-warned lookups, in bulk. A session-length warning is once per
  // session; a data warning is once per account per day, because the allowance
  // is the account's and a second device shouldn't repeat the same message.
  const [warnedSessions] = await db.query(
    `SELECT DISTINCT session_id FROM notifications
      WHERE type = 'session_warning' AND session_id IN (?)`,
    [rows.map((r) => r.session_id)]
  );
  const [warnedUsers] = await db.query(
    `SELECT DISTINCT user_id FROM notifications
      WHERE type = 'data_limit' AND created_at >= CURDATE() AND user_id IN (?)`,
    [rows.map((r) => r.user_id)]
  );
  const sessionWarned = new Set(warnedSessions.map((r) => r.session_id));
  const userWarned = new Set(warnedUsers.map((r) => r.user_id));

  const pending = [];
  for (const row of rows) {
    if (lowTimeMin > 0 && !sessionWarned.has(row.session_id)) {
      const minutesLeft =
        windows[row.role] - (Date.now() - new Date(row.login_time).getTime()) / 60000;
      // Past zero the sweeper is already ending the session, and a warning
      // about time that has run out isn't a warning.
      if (minutesLeft > 0 && minutesLeft <= lowTimeMin) {
        sessionWarned.add(row.session_id);
        pending.push([
          row.user_id,
          row.session_id,
          "session_warning",
          `Your Wi-Fi session ends in about ${Math.max(1, Math.round(minutesLeft))} minute(s). Log in again to keep browsing.`,
        ]);
      }
    }

    if (lowDataMB > 0 && !userWarned.has(row.user_id)) {
      // Warn against the cutoff actually in force, which for a prioritised
      // account is its role cap plus whatever was granted. This used to skip
      // anyone holding a priority outright — correct while every priority waived
      // the cap, but a measured grant leaves a real cutoff in place, and those
      // users were being disconnected at it with no warning at all. `null` still
      // means there is genuinely nothing to run out of, and nothing to warn about.
      const roleCapGb = Number(caps[`data_cap_gb_${row.role}`]);
      const capGb = priorities.users.has(row.user_id)
        ? emergencyDataCapGb(roleCapGb, priorities.users.get(row.user_id))
        : roleCapGb;
      if (capGb > 0) {
        const remainingMB = (capGb * 1024 * MB - Number(row.bytes_used)) / MB;
        if (remainingMB > 0 && remainingMB <= lowDataMB) {
          userWarned.add(row.user_id);
          pending.push([
            row.user_id,
            row.session_id,
            "data_limit",
            `You have about ${roundMB(remainingMB)} of today's data allowance left. It resets at midnight.`,
          ]);
        }
      }
    }
  }

  if (!pending.length) return { sent: 0 };
  await db.query(
    "INSERT INTO notifications (user_id, session_id, type, message, is_read, created_at) VALUES ?",
    [pending.map(([userId, sessionId, type, message]) => [userId, sessionId, type, message, 0, new Date()])]
  );
  return { sent: pending.length };
}

function startSessionNoticeSweeper(intervalMs = 60 * 1000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { sent } = await sweepSessionNotices();
      if (sent) console.log(`Session notices: sent ${sent} warning(s).`);
    } catch (err) {
      console.error("Session notice sweep failed:", err);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { sweepSessionNotices, getNoticeThresholds, startSessionNoticeSweeper };
