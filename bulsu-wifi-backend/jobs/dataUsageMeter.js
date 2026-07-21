const db = require("../db");
const { getSettings } = require("../utils/settings");
const { readQueueBytes, grantAccess, ENABLED } = require("../utils/routeros");
const { endSession } = require("../utils/sessions");

const GB = 1024 * 1024 * 1024;
const CAPPED_ROLES = ["student", "faculty", "staff"];

// Phase 1: pull each active session's Simple Queue byte counter, accrue the
// delta since last poll into that account's usage for today.
async function meterActiveQueues() {
  const [rows] = await db.query(
    `SELECT aq.session_id, aq.user_id, aq.ip_address, aq.queue_id, aq.last_bytes
     FROM active_queues aq
     JOIN sessions s ON s.id = aq.session_id AND s.status = 'active'`
  );

  for (const row of rows) {
    const bytes = await readQueueBytes(row.queue_id);
    if (bytes === undefined) continue; // router unreachable this cycle — retry next tick

    if (bytes === null) {
      // Queue vanished (e.g. removed by hand in WinBox) — self-heal.
      const recreated = await grantAccess(row.ip_address, row.session_id);
      if (recreated) {
        await db.query(
          "UPDATE active_queues SET queue_id=?, last_bytes=0 WHERE session_id=?",
          [recreated.queueId, row.session_id]
        );
      }
      continue;
    }

    // A counter lower than what we last saw means the queue was recreated or
    // the router rebooted — treat the current value as the delta rather than
    // computing a bogus negative number.
    const delta = bytes >= row.last_bytes ? bytes - row.last_bytes : bytes;
    if (delta > 0) {
      await db.query(
        `INSERT INTO data_usage (user_id, usage_date, bytes_used) VALUES (?, CURDATE(), ?)
         ON DUPLICATE KEY UPDATE bytes_used = bytes_used + VALUES(bytes_used)`,
        [row.user_id, delta]
      );
    }
    await db.query("UPDATE active_queues SET last_bytes=? WHERE session_id=?", [bytes, row.session_id]);
  }
}

// Phase 2: account-wide cutoff — a role can have multiple simultaneous
// sessions/queues (max_devices > 1), so the cap check and cutoff must cover
// every active session on the account, not just whichever queue tripped it.
async function enforceDailyCaps() {
  const [overUsers] = await db.query(
    `SELECT du.user_id, du.bytes_used, u.role
     FROM data_usage du JOIN users u ON u.id = du.user_id
     WHERE du.usage_date = CURDATE() AND u.role IN (?, ?, ?)`,
    CAPPED_ROLES
  );
  if (!overUsers.length) return;

  const caps = await getSettings(CAPPED_ROLES.map((r) => `data_cap_gb_${r}`));
  for (const u of overUsers) {
    const capGb = Number(caps[`data_cap_gb_${u.role}`]);
    if (!capGb || capGb <= 0) continue; // 0 / unset = unlimited
    if (u.bytes_used < capGb * GB) continue;

    const [sessionsToEnd] = await db.query(
      "SELECT id FROM sessions WHERE user_id=? AND status='active'",
      [u.user_id]
    );
    for (const s of sessionsToEnd) {
      await endSession(s.id, { reason: "data_limit_exceeded" });
    }
  }
}

async function runDataUsageMeter() {
  if (!ENABLED) return;
  await meterActiveQueues();
  await enforceDailyCaps();
}

function startDataUsageMeter(intervalMs = 2 * 60 * 1000) {
  const run = () =>
    runDataUsageMeter().catch((err) => console.error("Data usage meter failed:", err));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { runDataUsageMeter, startDataUsageMeter };
