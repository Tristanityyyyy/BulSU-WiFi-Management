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

  const [[queue]] = await db.query('SELECT queue_id FROM active_queues WHERE session_id=?', [sessionId]);
  if (queue) {
    await revokeAccess(session.ip_address, queue.queue_id);
    await db.query('DELETE FROM active_queues WHERE session_id=?', [sessionId]);
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
async function endGuestSession(guestSessionId, { status = 'ended' } = {}) {
  const [[session]] = await db.query(
    `SELECT id, guest_name, ip_address, queue_id FROM guest_sessions WHERE id=? AND status='active'`,
    [guestSessionId]
  );
  if (!session) return null;

  if (session.queue_id) await revokeAccess(session.ip_address, session.queue_id);

  await db.query(
    `UPDATE guest_sessions SET status=?, logout_time=NOW(), queue_id=NULL WHERE id=?`,
    [status, guestSessionId]
  );
  return session;
}

async function forceDisconnectGuestSession(req, guestSessionId) {
  const session = await endGuestSession(guestSessionId, { status: 'force-disconnected' });
  if (!session) return null;
  await logAudit(req, {
    action: ACTIONS.UPDATE,
    target_type: 'guest',
    target_name: session.guest_name,
    description: `Force-disconnected active session for guest ${session.guest_name}`,
  });
  return session;
}

module.exports = { endSession, endGuestSession, forceDisconnectSession, forceDisconnectGuestSession };
