const db = require("../db");
const { getSettings, getRoleBandwidthMap } = require("../utils/settings");
const { readQueueState, setQueueLimit, grantAccess, maxLimitMatches, ENABLED } = require("../utils/routeros");
const { endSession, endGuestSession } = require("../utils/sessions");

const GB = 1024 * 1024 * 1024;
const CAPPED_ROLES = ["student", "faculty", "staff"];

// Phase 1: pull each active session's Simple Queue byte counter, accrue the
// delta since last poll into that account's usage for today.
async function meterActiveQueues(bandwidth) {
  const [rows] = await db.query(
    `SELECT aq.session_id, aq.user_id, aq.ip_address, aq.queue_id, aq.last_bytes, u.role
     FROM active_queues aq
     JOIN sessions s ON s.id = aq.session_id AND s.status = 'active'
     JOIN users u ON u.id = aq.user_id`
  );

  for (const row of rows) {
    const limits = bandwidth[row.role];
    const state = await readQueueState(row.queue_id);
    if (state === undefined) continue; // router unreachable this cycle — retry next tick

    if (state === null) {
      // Queue vanished (e.g. removed by hand in WinBox) — self-heal. Passing the
      // role's limits matters: recreating it uncapped would hand the account a
      // free pass on speed *and* silently stop the metering again.
      const recreated = await grantAccess(row.ip_address, row.session_id, "session", limits);
      if (recreated) {
        await db.query(
          "UPDATE active_queues SET queue_id=?, last_bytes=0 WHERE session_id=?",
          [recreated.queueId, row.session_id]
        );
      }
      continue;
    }

    // An admin can change Settings → Network mid-session; re-apply the ceiling
    // so it lands on live sessions within one tick instead of at next login.
    if (state.maxLimit && !maxLimitMatches(state.maxLimit, limits)) {
      await setQueueLimit(row.queue_id, limits);
    }

    const bytes = state.bytes;
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
    // Bytes moved => the device is demonstrably still here. Refreshing last_seen
    // from traffic as well as from the router's presence tables means an actively
    // used session can never be swept as "departed" by a presence read that missed it.
    if (delta > 0) await db.query("UPDATE sessions SET last_seen=NOW() WHERE id=?", [row.session_id]);
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

// Guests are metered on the same tick, but against a different model: usage
// accrues on the guest_session itself (not a per-day data_usage row) and the cap
// is the QR's own total `data_limit_gb`, not a per-role daily cap. Both accrual
// and cutoff happen together per session, since a guest has exactly one queue.
async function meterAndCapGuests(limits) {
  // No `queue_id IS NOT NULL` filter: a session whose grant failed at verify has
  // a NULL queue_id, and skipping those meant it was never metered, never capped
  // and never repaired — an unlimited pass showing 0 MB in the UI. It falls into
  // the same self-heal branch below as a queue that vanished.
  const [rows] = await db.query(
    `SELECT gs.id, gs.ip_address, gs.queue_id, gs.last_bytes, gs.bytes_used,
            g.data_limit_gb, g.expires_at
       FROM guest_sessions gs
       JOIN guests g ON g.id = gs.guest_id
      WHERE gs.status = 'active'`
  );

  for (const row of rows) {
    const state = row.queue_id ? await readQueueState(row.queue_id) : null;
    if (state === undefined) continue; // router unreachable this cycle — retry next tick

    if (state === null) {
      // No queue yet (grant failed at verify) or it vanished (e.g. removed by
      // hand in WinBox) — self-heal like students. Never for a pass that already
      // lapsed, though: grantAccess would recreate the bypassed ip-binding too and
      // hand back access the expiry sweeper just removed.
      if (new Date(row.expires_at) <= new Date()) continue;
      const recreated = await grantAccess(row.ip_address, row.id, "guest", limits);
      if (recreated) {
        await db.query(
          "UPDATE guest_sessions SET queue_id=?, last_bytes=0 WHERE id=?",
          [recreated.queueId, row.id]
        );
      }
      continue;
    }

    if (state.maxLimit && !maxLimitMatches(state.maxLimit, limits)) {
      await setQueueLimit(row.queue_id, limits);
    }

    const bytes = state.bytes;
    // Counter lower than last seen => queue recreated / router rebooted: treat
    // the current value as the delta rather than a bogus negative (matches meterActiveQueues).
    const delta = bytes >= row.last_bytes ? bytes - row.last_bytes : bytes;
    // Accrue in SQL, not in JS — a read-modify-write here would silently discard
    // usage if two ticks ever overlap, under-counting the exact number the cap is
    // checked against. Same reason the student path uses `bytes_used + VALUES(...)`.
    await db.query(
      "UPDATE guest_sessions SET bytes_used = bytes_used + ?, last_bytes = ? WHERE id = ?",
      [delta > 0 ? delta : 0, bytes, row.id]
    );
    if (delta > 0) await db.query("UPDATE guest_sessions SET last_seen=NOW() WHERE id=?", [row.id]);

    const capGb = Number(row.data_limit_gb);
    if (capGb > 0) {
      // Read the stored total back so the cutoff is based on what's committed
      // rather than the snapshot this tick started with.
      const [[fresh]] = await db.query("SELECT bytes_used FROM guest_sessions WHERE id=?", [row.id]);
      if (fresh && Number(fresh.bytes_used) >= capGb * GB) {
        await endGuestSession(row.id, { status: "data_limit" });
      }
    }
  }
}

async function runDataUsageMeter() {
  if (!ENABLED) return;
  // One settings read per tick covers every session below.
  const bandwidth = await getRoleBandwidthMap([...CAPPED_ROLES, "guest"]);
  await meterActiveQueues(bandwidth);
  await enforceDailyCaps();
  await meterAndCapGuests(bandwidth.guest);
}

function startDataUsageMeter(intervalMs = 2 * 60 * 1000) {
  // Every session costs a serial router round-trip (8s timeout), so a tick can
  // outlast the interval. Skip rather than overlap: concurrent ticks would read
  // the same queue counter twice and double-accrue the delta.
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runDataUsageMeter();
    } catch (err) {
      console.error("Data usage meter failed:", err);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { runDataUsageMeter, startDataUsageMeter };
