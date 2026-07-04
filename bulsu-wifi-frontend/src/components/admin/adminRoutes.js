/**
 * BulSU Wi-Fi Admin — Express Routes
 * Mount with: app.use('/api/admin', adminRouter)
 * All routes require: verifyToken + requireAdmin middleware
 *
 * verifyToken: checks Authorization: Bearer <jwt>, attaches req.user
 * requireAdmin: checks req.user.role === 'admin', else 403
 */

const express = require('express');
const router = express.Router();
const db = require('../db');          // mysql2 pool or Sequelize models
const bcrypt = require('bcrypt');
const { RouterOSAPI } = require('node-routeros');

// ─── Middleware ────────────────────────────────────────────────────────────────
const { verifyToken, requireAdmin } = require('../middleware/auth');
router.use(verifyToken, requireAdmin);

// ─── Overview ─────────────────────────────────────────────────────────────────

// GET /api/admin/overview/stats
// Response: { totalUsers, activeSessions, activeGuests, bandwidthMbps }
router.get('/overview/stats', async (req, res) => {
  const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) AS totalUsers FROM users WHERE role = "student"');
  const [[{ activeSessions }]] = await db.query('SELECT COUNT(*) AS activeSessions FROM sessions WHERE status = "active"');
  const [[{ activeGuests }]] = await db.query('SELECT COUNT(*) AS activeGuests FROM guest_sessions WHERE status = "active"');
  // bandwidthMbps: pull from RouterOS or return 0 as placeholder
  res.json({ totalUsers, activeSessions, activeGuests, bandwidthMbps: 0 });
});

// GET /api/admin/overview/connected
// Response: [{ session_id, full_name, student_number, mac_address, ip_address, login_time }]
router.get('/overview/connected', async (req, res) => {
  const [rows] = await db.query(`
    SELECT s.id AS session_id, u.full_name, u.student_number, d.mac_address, s.ip_address, s.login_time
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    JOIN devices d ON s.device_id = d.id
    WHERE s.status = 'active'
    ORDER BY s.login_time DESC
  `);
  res.json(rows);
});

// GET /api/admin/overview/peak-hours
// Response: { labels: ['00:00',...], data: [12,...] }
router.get('/overview/peak-hours', async (req, res) => {
  const [rows] = await db.query(`
    SELECT HOUR(login_time) AS hour, COUNT(*) AS count
    FROM sessions
    WHERE login_time >= NOW() - INTERVAL 24 HOUR
    GROUP BY HOUR(login_time)
    ORDER BY hour
  `);
  const labels = rows.map((r) => `${String(r.hour).padStart(2, '0')}:00`);
  const data = rows.map((r) => r.count);
  res.json({ labels, data });
});

// ─── Users ────────────────────────────────────────────────────────────────────

// GET /api/admin/users?page&limit&search&status&enrollment_status
// Response: { users: [...], total }
router.get('/users', async (req, res) => {
  const { page = 1, limit = 20, search = '', status = '', enrollment_status = '' } = req.query;
  const offset = (page - 1) * limit;
  const params = [`%${search}%`, `%${search}%`];
  let where = 'WHERE (u.student_number LIKE ? OR u.full_name LIKE ?)';
  if (status) { where += ' AND u.status = ?'; params.push(status); }
  if (enrollment_status) { where += ' AND u.enrollment_status = ?'; params.push(enrollment_status); }
  const [users] = await db.query(`SELECT u.id, u.student_number, u.full_name, u.course_section, u.enrollment_status, u.status FROM users u ${where} ORDER BY u.full_name LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
  res.json({ users, total });
});

// POST /api/admin/users
// Body: { student_number, full_name, course_section, enrollment_status, password }
router.post('/users', async (req, res) => {
  const { student_number, full_name, course_section, enrollment_status, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    'INSERT INTO users (student_number, full_name, course_section, enrollment_status, password_hash, role, status) VALUES (?,?,?,?,?,"student","active")',
    [student_number, full_name, course_section, enrollment_status, hashed]
  );
  res.status(201).json({ id: result.insertId });
});

// PUT /api/admin/users/:id
// Body: { full_name, course_section, enrollment_status }
router.put('/users/:id', async (req, res) => {
  const { full_name, course_section, enrollment_status } = req.body;
  await db.query('UPDATE users SET full_name=?, course_section=?, enrollment_status=? WHERE id=?',
    [full_name, course_section, enrollment_status, req.params.id]);
  res.json({ ok: true });
});

// PATCH /api/admin/users/:id/block
router.patch('/users/:id/block', async (req, res) => {
  await db.query('UPDATE users SET status="blocked" WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// PATCH /api/admin/users/:id/unblock
router.patch('/users/:id/unblock', async (req, res) => {
  await db.query('UPDATE users SET status="active" WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/admin/users/:id/disconnect
router.post('/users/:id/disconnect', async (req, res) => {
  const [[session]] = await db.query('SELECT id FROM sessions WHERE user_id=? AND status="active" LIMIT 1', [req.params.id]);
  if (session) {
    await db.query('UPDATE sessions SET status="force-disconnected", logout_time=NOW(), logout_reason="force_disconnect" WHERE id=?', [session.id]);
    // TODO: call RouterOS to remove hotspot user
  }
  res.json({ ok: true });
});

// POST /api/admin/users/csv-import
// Body: { rows: [{ student_number, full_name, course_section, enrollment_status }] }
// Response: { success, failed, import_id }
router.post('/users/csv-import', async (req, res) => {
  const { rows } = req.body;
  let success = 0, failed = 0;
  for (const row of rows) {
    try {
      const tempPassword = await bcrypt.hash(row.student_number, 10);
      await db.query(
        'INSERT INTO users (student_number, full_name, course_section, enrollment_status, password_hash, role, status) VALUES (?,?,?,?,?,"student","active") ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), course_section=VALUES(course_section), enrollment_status=VALUES(enrollment_status)',
        [row.student_number, row.full_name, row.course_section, row.enrollment_status, tempPassword]
      );
      success++;
    } catch { failed++; }
  }
  const [result] = await db.query(
    'INSERT INTO csv_imports (imported_by, total_rows, success_rows, failed_rows, status, imported_at) VALUES (?,?,?,?,?,NOW())',
    [req.user.id, rows.length, success, failed, failed === 0 ? 'success' : 'partial']
  );
  res.json({ success, failed, import_id: result.insertId });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

// GET /api/admin/sessions?page&limit&date_from&date_to&status&logout_reason
// Response: { sessions: [...], total }
router.get('/sessions', async (req, res) => {
  const { page = 1, limit = 20, date_from, date_to, status = '', logout_reason = '' } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';
  if (date_from) { where += ' AND s.login_time >= ?'; params.push(date_from); }
  if (date_to) { where += ' AND s.login_time <= ?'; params.push(date_to + ' 23:59:59'); }
  if (status) { where += ' AND s.status = ?'; params.push(status); }
  if (logout_reason) { where += ' AND s.logout_reason = ?'; params.push(logout_reason); }
  const [sessions] = await db.query(`
    SELECT s.id, u.full_name, u.student_number, d.mac_address, s.ip_address,
           s.login_time, s.logout_time, s.status, s.logout_reason,
           TIMESTAMPDIFF(MINUTE, s.login_time, COALESCE(s.logout_time, NOW())) AS duration_minutes
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    JOIN devices d ON s.device_id = d.id
    ${where} ORDER BY s.login_time DESC LIMIT ? OFFSET ?
  `, [...params, Number(limit), Number(offset)]);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM sessions s ${where}`, params);
  res.json({ sessions, total });
});

// GET /api/admin/sessions/export — same filters, no pagination
router.get('/sessions/export', async (req, res) => {
  const { date_from, date_to, status = '', logout_reason = '' } = req.query;
  const params = [];
  let where = 'WHERE 1=1';
  if (date_from) { where += ' AND s.login_time >= ?'; params.push(date_from); }
  if (date_to) { where += ' AND s.login_time <= ?'; params.push(date_to + ' 23:59:59'); }
  if (status) { where += ' AND s.status = ?'; params.push(status); }
  if (logout_reason) { where += ' AND s.logout_reason = ?'; params.push(logout_reason); }
  const [rows] = await db.query(`
    SELECT u.student_number, u.full_name, d.mac_address, s.ip_address,
           s.login_time, s.logout_time, s.status, s.logout_reason,
           TIMESTAMPDIFF(MINUTE, s.login_time, COALESCE(s.logout_time, NOW())) AS duration_minutes
    FROM sessions s JOIN users u ON s.user_id=u.id JOIN devices d ON s.device_id=d.id
    ${where} ORDER BY s.login_time DESC
  `, params);
  res.json(rows);
});

// GET /api/admin/guest-sessions?page&limit&date_from&date_to&status
// Response: { sessions: [...], total }
router.get('/guest-sessions', async (req, res) => {
  const { page = 1, limit = 20, date_from, date_to, status = '' } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';
  if (date_from) { where += ' AND gs.login_time >= ?'; params.push(date_from); }
  if (date_to) { where += ' AND gs.login_time <= ?'; params.push(date_to + ' 23:59:59'); }
  if (status) { where += ' AND gs.status = ?'; params.push(status); }
  const [sessions] = await db.query(`
    SELECT gs.id, g.guest_name, gs.mac_address, gs.ip_address,
           gs.login_time, gs.logout_time, gs.status,
           TIMESTAMPDIFF(MINUTE, gs.login_time, COALESCE(gs.logout_time, NOW())) AS duration_minutes
    FROM guest_sessions gs JOIN guests g ON gs.guest_id = g.id
    ${where} ORDER BY gs.login_time DESC LIMIT ? OFFSET ?
  `, [...params, Number(limit), Number(offset)]);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM guest_sessions gs ${where}`, params);
  res.json({ sessions, total });
});

// GET /api/admin/guest-sessions/export
router.get('/guest-sessions/export', async (req, res) => {
  const { date_from, date_to, status = '' } = req.query;
  const params = [];
  let where = 'WHERE 1=1';
  if (date_from) { where += ' AND gs.login_time >= ?'; params.push(date_from); }
  if (date_to) { where += ' AND gs.login_time <= ?'; params.push(date_to + ' 23:59:59'); }
  if (status) { where += ' AND gs.status = ?'; params.push(status); }
  const [rows] = await db.query(`
    SELECT g.guest_name, gs.mac_address, gs.ip_address, gs.login_time, gs.logout_time, gs.status,
           TIMESTAMPDIFF(MINUTE, gs.login_time, COALESCE(gs.logout_time, NOW())) AS duration_minutes
    FROM guest_sessions gs JOIN guests g ON gs.guest_id=g.id
    ${where} ORDER BY gs.login_time DESC
  `, params);
  res.json(rows);
});

// ─── Guests ───────────────────────────────────────────────────────────────────

// GET /api/admin/guests?page&limit
// Response: { guests: [...], total }
router.get('/guests', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const [guests] = await db.query('SELECT * FROM guests ORDER BY created_at DESC LIMIT ? OFFSET ?', [Number(limit), Number(offset)]);
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM guests');
  res.json({ guests, total });
});

// POST /api/admin/guests
// Body: { guest_name, duration_minutes }
// Response: { id, guest_name, qr_code, expires_at, status }
router.post('/guests', async (req, res) => {
  const { guest_name, duration_minutes = 60 } = req.body;
  const crypto = require('crypto');
  const qr_code = crypto.randomBytes(24).toString('hex');
  const expires_at = new Date(Date.now() + duration_minutes * 60 * 1000);
  const [result] = await db.query(
    'INSERT INTO guests (guest_name, qr_code, expires_at, status, created_at) VALUES (?,?,?,"active",NOW())',
    [guest_name, qr_code, expires_at]
  );
  res.status(201).json({ id: result.insertId, guest_name, qr_code, expires_at, status: 'active' });
});

// PATCH /api/admin/guests/:id/revoke
router.patch('/guests/:id/revoke', async (req, res) => {
  await db.query('UPDATE guests SET status="expired" WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Emergency Priority ───────────────────────────────────────────────────────

// GET /api/admin/emergency?page&limit
// Response: { priorities: [...], total }
router.get('/emergency', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const [priorities] = await db.query('SELECT * FROM emergency_priority ORDER BY activated_at DESC LIMIT ? OFFSET ?', [Number(limit), Number(offset)]);
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM emergency_priority');
  res.json({ priorities, total });
});

// POST /api/admin/emergency
// Body: { user_id, reason }
router.post('/emergency', async (req, res) => {
  const { user_id, reason } = req.body;
  const [result] = await db.query(
    'INSERT INTO emergency_priority (user_id, reason, activated_by, activated_at, status) VALUES (?,?,?,NOW(),"active")',
    [user_id, reason, req.user.id]
  );
  res.status(201).json({ id: result.insertId });
});

// PATCH /api/admin/emergency/:id/deactivate
router.patch('/emergency/:id/deactivate', async (req, res) => {
  await db.query('UPDATE emergency_priority SET status="ended", deactivated_at=NOW() WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Feedback ─────────────────────────────────────────────────────────────────

// GET /api/admin/feedback?page&limit
// Response: { feedback: [...], total }
router.get('/feedback', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const [feedback] = await db.query('SELECT * FROM feedback ORDER BY submitted_at DESC LIMIT ? OFFSET ?', [Number(limit), Number(offset)]);
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM feedback');
  res.json({ feedback, total });
});

// GET /api/admin/feedback/aggregate
// Response: { average, total, distribution: { 1: n, 2: n, ... } }
router.get('/feedback/aggregate', async (req, res) => {
  const [[{ average, total }]] = await db.query('SELECT AVG(rating) AS average, COUNT(*) AS total FROM feedback');
  const [dist] = await db.query('SELECT rating, COUNT(*) AS count FROM feedback GROUP BY rating');
  const distribution = {};
  dist.forEach((r) => { distribution[r.rating] = r.count; });
  res.json({ average: parseFloat(average) || 0, total, distribution });
});

// ─── Notifications ────────────────────────────────────────────────────────────

// GET /api/admin/notifications?page&limit&type&is_read
// Response: { notifications: [...], total }
router.get('/notifications', async (req, res) => {
  const { page = 1, limit = 20, type = '', is_read = '' } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';
  if (type) { where += ' AND type = ?'; params.push(type); }
  if (is_read !== '') { where += ' AND is_read = ?'; params.push(Number(is_read)); }
  const [notifications] = await db.query(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM notifications ${where}`, params);
  res.json({ notifications, total });
});

// POST /api/admin/notifications/send
// Body: { target: 'user'|'section'|'all', user_id?, course_section?, message }
router.post('/notifications/send', async (req, res) => {
  const { target, user_id, course_section, message } = req.body;
  let userIds = [];
  if (target === 'user') {
    userIds = [user_id];
  } else if (target === 'section') {
    const [rows] = await db.query('SELECT id FROM users WHERE course_section = ?', [course_section]);
    userIds = rows.map((r) => r.id);
  } else {
    const [rows] = await db.query('SELECT id FROM users WHERE role = "student"');
    userIds = rows.map((r) => r.id);
  }
  const values = userIds.map((id) => [id, 'general', message, 0, new Date()]);
  if (values.length) {
    await db.query('INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES ?', [values]);
  }
  res.json({ sent: values.length });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

// GET /api/admin/settings
// Response: { session_timeout_minutes: 60, bandwidth_cap_mbps: 10, ... }
router.get('/settings', async (req, res) => {
  const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
  const result = {};
  rows.forEach((r) => { result[r.setting_key] = r.setting_value; });
  res.json(result);
});

// PUT /api/admin/settings
// Body: { session_timeout_minutes: 60, ... }
router.put('/settings', async (req, res) => {
  const entries = Object.entries(req.body);
  for (const [key, value] of entries) {
    await db.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
  }
  res.json({ ok: true });
});

module.exports = router;
