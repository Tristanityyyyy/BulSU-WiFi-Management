const express = require('express');
const router = express.Router();
const db = require('../../../db');
const bcrypt = require('bcrypt');
const { logAudit, ACTIONS } = require('../../../utils/auditLog');
const { verifyOwnPassword } = require('../../../utils/verifyOwnPassword');
const { derivePassword } = require('../../../utils/derivePassword');

const VALID_IMPORT_ROLES = ['student', 'faculty', 'staff'];

const normalizeId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// GET /api/admin/users
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', enrollment_status = '', role = '', course_id = '', section_id = '' } = req.query;
    const offset = (page - 1) * limit;
    const params = [`%${search}%`, `%${search}%`];
    let where = "WHERE (u.student_number LIKE ? OR u.full_name LIKE ?) AND u.role != 'admin' AND u.deleted_at IS NULL";
    if (status) { where += ' AND u.status = ?'; params.push(status); }
    if (enrollment_status) { where += ' AND u.enrollment_status = ?'; params.push(enrollment_status); }
    if (role) { where += ' AND u.role = ?'; params.push(role); }
    if (course_id) { where += ' AND u.course_id = ?'; params.push(course_id); }
    if (section_id) { where += ' AND u.section_id = ?'; params.push(section_id); }
    const [users] = await db.query(
      `SELECT u.id, u.student_number, u.full_name, u.course_id, u.section_id, u.enrollment_status, u.role, u.status
       FROM users u ${where} ORDER BY u.full_name LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// POST /api/admin/users
router.post('/', async (req, res) => {
  try {
    const { student_number, full_name, birthdate, course_id, section_id, enrollment_status, role, password } = req.body;
    if (!student_number || !full_name || !password)
      return res.status(400).json({ message: 'student_number, full_name, and password are required.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate || ''))
      return res.status(400).json({ message: 'A valid birth date (YYYY-MM-DD) is required.' });
    const finalRole = role || 'student';
    if (!VALID_IMPORT_ROLES.includes(finalRole))
      return res.status(400).json({ message: 'role must be one of: student, faculty, staff.' });
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (student_number, full_name, birth_date, course_id, section_id, enrollment_status, password_hash, role, status, must_change_password) VALUES (?,?,?,?,?,?,?,?,?,1)',
      [student_number, full_name, birthdate, finalRole === 'student' ? normalizeId(course_id) : null, finalRole === 'student' ? normalizeId(section_id) : null, enrollment_status, hashed, finalRole, 'active']
    );
    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: 'user',
      target_name: full_name,
      description: `Created ${finalRole} account for ${full_name} (${student_number})`,
    });
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Student number already exists.' });
    res.status(500).json({ message: 'Failed to create user.' });
  }
});

// PUT /api/admin/users/:id
router.put('/:id', async (req, res) => {
  try {
    const { full_name, course_id, section_id, enrollment_status, role } = req.body;
    // role is omitted entirely when editing the admin account (the form hides it), so only
    // touch the column when a role was actually sent, and never allow setting it outside the three import roles.
    if (role !== undefined && !VALID_IMPORT_ROLES.includes(role))
      return res.status(400).json({ message: 'role must be one of: student, faculty, staff.' });
    const courseSectionAllowed = role === undefined || role === 'student';
    const fields = ['full_name=?', 'course_id=?', 'section_id=?', 'enrollment_status=?'];
    const params = [
      full_name,
      courseSectionAllowed ? normalizeId(course_id) : null,
      courseSectionAllowed ? normalizeId(section_id) : null,
      enrollment_status,
    ];
    if (role !== undefined) {
      fields.push('role=?');
      params.push(role);
    }
    params.push(req.params.id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, params);
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'user',
      target_name: full_name,
      description: `Updated account for ${full_name}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user.' });
  }
});

// PATCH /api/admin/users/:id/reset-password — requires the ADMIN's own password
// (step-up auth), resets the target's password to the same default formula used
// at creation/import (LastName + birthdate), and forces them to change it on next login.
router.patch('/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password is required.' });

    if (!(await verifyOwnPassword(req, password))) return res.status(403).json({ message: 'Incorrect password.' });

    const [[target]] = await db.query(
      "SELECT full_name, student_number, birth_date FROM users WHERE id=? AND deleted_at IS NULL AND role != 'admin'",
      [req.params.id]
    );
    if (!target) return res.status(404).json({ message: 'User not found.' });

    const newPassword = derivePassword(target);
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?', [hashed, req.params.id]);

    await logAudit(req, {
      action: ACTIONS.RESET_PASSWORD,
      target_type: 'user',
      target_name: target.full_name,
      description: `Reset password for ${target.full_name} (${target.student_number})`,
    });
    res.json({ password: newPassword });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reset password.' });
  }
});

// PATCH /api/admin/users/:id/block
router.patch('/:id/block', async (req, res) => {
  try {
    const [[u]] = await db.query('SELECT full_name, student_number FROM users WHERE id=?', [req.params.id]);
    await db.query('UPDATE users SET status="blocked" WHERE id=?', [req.params.id]);
    await logAudit(req, {
      action: ACTIONS.BLOCKED,
      target_type: 'user',
      target_name: u?.full_name,
      description: `Blocked user ${u?.full_name} (${u?.student_number})`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to block user.' });
  }
});

// PATCH /api/admin/users/:id/unblock
router.patch('/:id/unblock', async (req, res) => {
  try {
    const [[u]] = await db.query('SELECT full_name, student_number FROM users WHERE id=?', [req.params.id]);
    await db.query('UPDATE users SET status="active" WHERE id=?', [req.params.id]);
    await logAudit(req, {
      action: ACTIONS.UNBLOCKED,
      target_type: 'user',
      target_name: u?.full_name,
      description: `Unblocked user ${u?.full_name} (${u?.student_number})`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unblock user.' });
  }
});

module.exports = router;
