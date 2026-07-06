const router = require('express').Router();
const db = require('../../db');

function buildDateFilter(query, alias, userAlias = null) {
  const { date_from, date_to, status = '', logout_reason = '', role = '' } = query;
  const params = [];
  let where = 'WHERE 1=1';
  if (date_from)    { where += ` AND ${alias}.login_time >= ?`; params.push(date_from); }
  if (date_to)      { where += ` AND ${alias}.login_time <= ?`; params.push(date_to + ' 23:59:59'); }
  if (status)       { where += ` AND ${alias}.status = ?`; params.push(status); }
  if (logout_reason){ where += ` AND ${alias}.logout_reason = ?`; params.push(logout_reason); }
  if (role && userAlias) { where += ` AND ${userAlias}.role = ?`; params.push(role); }
  return { where, params };
}

// GET /api/admin/sessions
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { where, params } = buildDateFilter(req.query, 's', 'u');
    const [sessions] = await db.query(`
      SELECT s.id, u.full_name, u.student_number, u.role, d.mac_address, s.ip_address,
             s.login_time, s.logout_time, s.status, s.logout_reason,
             TIMESTAMPDIFF(MINUTE, s.login_time, COALESCE(s.logout_time, NOW())) AS duration_minutes
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      JOIN devices d ON s.device_id = d.id
      ${where} ORDER BY s.login_time DESC LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)]);
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM sessions s JOIN users u ON s.user_id = u.id ${where}`, params
    );
    res.json({ sessions, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch sessions.' });
  }
});

// GET /api/admin/sessions/export
router.get('/export', async (req, res) => {
  try {
    const { where, params } = buildDateFilter(req.query, 's', 'u');
    const [rows] = await db.query(`
      SELECT u.student_number, u.full_name, u.role, d.mac_address, s.ip_address,
             s.login_time, s.logout_time, s.status, s.logout_reason,
             TIMESTAMPDIFF(MINUTE, s.login_time, COALESCE(s.logout_time, NOW())) AS duration_minutes
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      JOIN devices d ON s.device_id = d.id
      ${where} ORDER BY s.login_time DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to export sessions.' });
  }
});

// GET /api/admin/sessions/guests
router.get('/guests', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { where, params } = buildDateFilter(req.query, 'gs');
    const [sessions] = await db.query(`
      SELECT gs.id, g.guest_name, gs.mac_address, gs.ip_address,
             gs.login_time, gs.logout_time, gs.status,
             TIMESTAMPDIFF(MINUTE, gs.login_time, COALESCE(gs.logout_time, NOW())) AS duration_minutes
      FROM guest_sessions gs
      JOIN guests g ON gs.guest_id = g.id
      ${where} ORDER BY gs.login_time DESC LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)]);
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM guest_sessions gs ${where}`, params);
    res.json({ sessions, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch guest sessions.' });
  }
});

// GET /api/admin/sessions/guests/export
router.get('/guests/export', async (req, res) => {
  try {
    const { where, params } = buildDateFilter(req.query, 'gs');
    const [rows] = await db.query(`
      SELECT g.guest_name, gs.mac_address, gs.ip_address,
             gs.login_time, gs.logout_time, gs.status,
             TIMESTAMPDIFF(MINUTE, gs.login_time, COALESCE(gs.logout_time, NOW())) AS duration_minutes
      FROM guest_sessions gs
      JOIN guests g ON gs.guest_id = g.id
      ${where} ORDER BY gs.login_time DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to export guest sessions.' });
  }
});

module.exports = router;
