const db = require("../db");

// Auto-expire guest QR codes once their access window closes.
// 1. Flip the token itself to 'expired' so the DB matches what every
//    read-time check already assumes.
// 2. End any guest session still running past the token's expiry,
//    stamping logout_time with the moment the pass actually expired.
async function sweepExpiredGuests() {
  await db.query(
    "UPDATE guests SET status='expired' WHERE status IN ('active','used') AND expires_at <= NOW()"
  );
  await db.query(
    `UPDATE guest_sessions gs
       JOIN guests g ON g.id = gs.guest_id
        SET gs.status = 'timeout', gs.logout_time = g.expires_at
      WHERE gs.status = 'active' AND g.expires_at <= NOW()`
  );
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
