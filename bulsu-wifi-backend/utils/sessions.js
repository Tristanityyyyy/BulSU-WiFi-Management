const db = require('../db');
const { logAudit, ACTIONS } = require('./auditLog');

// Single source of truth for ending an active session — both the Users-table
// shortcut and the Sessions-page action call this instead of each running
// their own UPDATE/audit-log pair.
async function forceDisconnectSession(req, sessionId) {
  const [[session]] = await db.query(
    `SELECT s.id, u.full_name FROM sessions s LEFT JOIN users u ON s.user_id = u.id
     WHERE s.id=? AND s.status='active'`,
    [sessionId]
  );
  if (!session) return null;
  await db.query(
    `UPDATE sessions SET status='force-disconnected', logout_time=NOW(), logout_reason='force_disconnect' WHERE id=?`,
    [sessionId]
  );
  await logAudit(req, {
    action: ACTIONS.UPDATE,
    target_type: 'user',
    target_name: session.full_name,
    description: `Force-disconnected active session for ${session.full_name}`,
  });
  return session;
}

async function forceDisconnectGuestSession(req, guestSessionId) {
  const [[session]] = await db.query(
    `SELECT id, guest_name FROM guest_sessions WHERE id=? AND status='active'`,
    [guestSessionId]
  );
  if (!session) return null;
  // guest_sessions has no logout_reason column — only `sessions` does.
  await db.query(
    `UPDATE guest_sessions SET status='force-disconnected', logout_time=NOW() WHERE id=?`,
    [guestSessionId]
  );
  await logAudit(req, {
    action: ACTIONS.UPDATE,
    target_type: 'guest',
    target_name: session.guest_name,
    description: `Force-disconnected active session for guest ${session.guest_name}`,
  });
  return session;
}

module.exports = { forceDisconnectSession, forceDisconnectGuestSession };
