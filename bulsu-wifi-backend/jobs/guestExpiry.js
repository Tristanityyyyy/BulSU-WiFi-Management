const db = require("../db");
const { revokeAccess } = require("../utils/routeros");

// Auto-expire guest QR codes once their access window closes.
// 1. Flip the token itself to 'expired' so the DB matches what every
//    read-time check already assumes.
// 2. End any guest session still running past the token's expiry: revoke its
//    MikroTik grant (queue + ip-binding) and stamp logout_time with the moment
//    the pass actually expired.
async function sweepExpiredGuests() {
  await db.query(
    "UPDATE guests SET status='expired' WHERE status IN ('active','used') AND expires_at <= NOW()"
  );

  // Pull the expiring sessions first so we can revoke each one's router grant —
  // a set-based UPDATE alone would leave the ip-binding/queue live on the router.
  const [expiring] = await db.query(
    `SELECT gs.id, gs.ip_address, gs.queue_id, g.expires_at
       FROM guest_sessions gs
       JOIN guests g ON g.id = gs.guest_id
      WHERE gs.status = 'active' AND g.expires_at <= NOW()`
  );
  for (const s of expiring) {
    if (s.queue_id) await revokeAccess(s.ip_address, s.queue_id);
    await db.query(
      "UPDATE guest_sessions SET status='timeout', logout_time=?, queue_id=NULL WHERE id=?",
      [s.expires_at, s.id]
    );
  }
}

function startGuestExpirySweeper(intervalMs = 60 * 1000) {
  const run = () =>
    sweepExpiredGuests().catch((err) => console.error("Guest expiry sweep failed:", err));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { sweepExpiredGuests, startGuestExpirySweeper };
