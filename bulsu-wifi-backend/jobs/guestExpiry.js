const db = require("../db");
const { revokeAccess } = require("../utils/routeros");

// Ends every active guest_session whose voucher is no longer valid — either its
// window closed (expires_at passed) or an admin revoked it early (guests.status
// flipped to 'expired' while expires_at is still in the future). Pass a guestId
// to scope this to one voucher, which is what the admin Revoke endpoint does so the
// disconnect is immediate instead of waiting for the next sweep.
//
// Each session's MikroTik grant is revoked one at a time: a set-based UPDATE
// alone would leave the queue/ip-binding live on the router. When revokeAccess
// reports failure we deliberately leave the row 'active' with its queue_id
// intact — the next sweep re-selects it (the WHERE still matches) and retries.
// Nulling queue_id there would strand the grant on the device forever.
//
// Returns { ended, pending } so callers can tell the admin when the router
// couldn't be reached.
async function endLapsedGuestSessions(guestId) {
  const params = [];
  let scope = "";
  if (guestId !== undefined) {
    scope = " AND g.id = ?";
    params.push(guestId);
  }

  const [lapsed] = await db.query(
    `SELECT gs.id, gs.ip_address, gs.queue_id, g.expires_at, g.status AS guest_status
       FROM guest_sessions gs
       JOIN guests g ON g.id = gs.guest_id
      WHERE gs.status = 'active'
        AND (g.expires_at <= NOW() OR g.status = 'expired')${scope}`,
    params
  );

  let ended = 0;
  let pending = 0;
  for (const s of lapsed) {
    if (s.queue_id) {
      const revoked = await revokeAccess(s.ip_address, s.queue_id);
      if (!revoked) {
        pending++;
        continue; // router unreachable — leave the row alone so the next sweep retries
      }
    }

    // A code that lapsed on its own timed out at expires_at; one an admin cut
    // short ended just now, so don't back-date it to a future expires_at.
    const timedOut = new Date(s.expires_at) <= new Date();
    const status = timedOut ? "timeout" : "force-disconnected";
    const logoutTime = timedOut ? s.expires_at : new Date();

    // status='active' guard: this row was read before the revoke round-trip, and
    // the data-usage meter may have ended it as 'data_limit' in between — that's
    // the real reason and it shouldn't be overwritten.
    const [res] = await db.query(
      "UPDATE guest_sessions SET status=?, logout_time=?, queue_id=NULL WHERE id=? AND status='active'",
      [status, logoutTime, s.id]
    );
    if (res.affectedRows) ended++;
  }
  return { ended, pending };
}

// Auto-expire guest vouchers once their access window closes: flip the voucher
// itself to 'expired' so the DB matches what every read-time check already
// assumes, then end any session still running on a lapsed or revoked one.
async function sweepExpiredGuests() {
  await db.query(
    "UPDATE guests SET status='expired' WHERE status IN ('active','used') AND expires_at <= NOW()"
  );
  return endLapsedGuestSessions();
}

// Every 10 seconds, which is how long a guest can still be browsing after their
// voucher ran out. A minute was the old figure and it was chosen against a cost
// that is not really there: a sweep with nothing to do is one UPDATE and one
// SELECT that returns no rows, and the router is not contacted at all — the
// round-trips below happen per *lapsed* session, so they are paid only when
// somebody is actually being disconnected. Polling six times as often therefore
// costs six cheap queries a minute, not six times the router traffic.
function startGuestExpirySweeper(intervalMs = 10 * 1000) {
  // A sweep that does have work makes one router round-trip (8s timeout) per
  // expiring session, so it can far outlast the interval. Skip a tick rather
  // than run two sweeps — two would read the same rows and race on ending them.
  // The admin guest list triggers sweeps too.
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sweepExpiredGuests();
    } catch (err) {
      console.error("Guest expiry sweep failed:", err);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { sweepExpiredGuests, endLapsedGuestSessions, startGuestExpirySweeper };
