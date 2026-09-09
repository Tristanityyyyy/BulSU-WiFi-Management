const db = require('../db');
const { logAudit, ACTIONS } = require('./auditLog');
const { revokeAccess } = require('./routeros');

// Single source of truth for ending an active session — updates the row and
// revokes any MikroTik access grant tied to it (via active_queues). Callers
// that need audit logging (admin-triggered endings) do that themselves with
// the returned session; system-triggered endings (device-switch, hitting the
// daily data cap) just don't call logAudit, matching prior behavior.
async function endSession(sessionId, { reason, status = 'ended' } = {}) {
  const [[session]] = await db.query(
    `SELECT s.id, s.ip_address, u.full_name FROM sessions s LEFT JOIN users u ON s.user_id = u.id
     WHERE s.id=? AND s.status='active'`,
    [sessionId]
  );
  if (!session) return null;

  await db.query(
    `UPDATE sessions SET status=?, logout_time=NOW(), logout_reason=? WHERE id=?`,
    [status, reason, sessionId]
  );

  // The active_queues row is deleted only when the router actually let go of the
  // grant. Deleting it regardless left a live queue on the device with nothing
  // in the database still pointing at it — unreachable by the meter, by the next
  // logout, and by revokeAccess, so it sat there shaping traffic until the orphan
  // reaper happened to notice it.
  //
  // That is not merely untidy: RouterOS matches simple queues top-down, so a
  // stranded queue on an address still carrying the old role limits shadows the
  // fresh one created at the next login — including one built with an emergency
  // grant folded in. It is one of the ways a granted boost can be applied
  // correctly everywhere and still not reach anybody.
  //
  // Keeping the row simply stops the database claiming the queue is gone while it
  // is still up, which is the contract revokeAccess documents and the one the
  // guest path (endGuestSession, below) has always honoured. The orphan sweeper
  // removes the queue itself and then clears the row.
  const [[queue]] = await db.query('SELECT queue_id FROM active_queues WHERE session_id=?', [sessionId]);
  if (queue) {
    const revoked = await revokeAccess(session.ip_address, queue.queue_id);
    if (revoked) await db.query('DELETE FROM active_queues WHERE session_id=?', [sessionId]);
  }

  return session;
}

// Single source of truth for ending an active session — both the Users-table
// shortcut and the Sessions-page action call this instead of each running
// their own UPDATE/audit-log pair.
async function forceDisconnectSession(req, sessionId) {
  const session = await endSession(sessionId, { reason: 'force_disconnect', status: 'force-disconnected' });
  if (!session) return null;
  await logAudit(req, {
    action: ACTIONS.UPDATE,
    target_type: 'user',
    target_name: session.full_name,
    description: `Force-disconnected active session for ${session.full_name}`,
  });
  return session;
}

// Guest-side equivalent of endSession: ends an active guest_session and revokes
// its MikroTik grant (queue + ip-binding) via the queue_id stored on the row.
// guest_sessions has no logout_reason column — the reason is carried by `status`
// (e.g. 'timeout', 'data_limit', 'force-disconnected', 'ended').
//
// Returns null if the session isn't active, otherwise the session plus an
// `ended` flag. `ended: false` means the router was unreachable, so the row is
// deliberately left 'active' WITH its queue_id — clearing it would strand the
// live queue/ip-binding on the device with nothing left to revoke it by. The
// caller either retries (the guest expiry sweeper does, automatically) or tells
// the admin it didn't take.
async function endGuestSession(guestSessionId, { status = 'ended' } = {}) {
  const [[session]] = await db.query(
    `SELECT id, guest_name, ip_address, queue_id FROM guest_sessions WHERE id=? AND status='active'`,
    [guestSessionId]
  );
  if (!session) return null;

  if (session.queue_id) {
    const revoked = await revokeAccess(session.ip_address, session.queue_id);
    if (!revoked) return { ...session, ended: false };
  }

  await db.query(
    `UPDATE guest_sessions SET status=?, logout_time=NOW(), queue_id=NULL WHERE id=?`,
    [status, guestSessionId]
  );
  return { ...session, ended: true };
}

async function forceDisconnectGuestSession(req, guestSessionId) {
  const session = await endGuestSession(guestSessionId, { status: 'force-disconnected' });
  if (!session) return null;
  // Router unreachable — don't log an audit entry for a disconnect that didn't happen.
  if (!session.ended) return session;
  await logAudit(req, {
    action: ACTIONS.UPDATE,
    target_type: 'guest',
    target_name: session.guest_name,
    description: `Force-disconnected active session for guest ${session.guest_name}`,
  });
  return session;
}

module.exports = { endSession, endGuestSession, forceDisconnectSession, forceDisconnectGuestSession };
