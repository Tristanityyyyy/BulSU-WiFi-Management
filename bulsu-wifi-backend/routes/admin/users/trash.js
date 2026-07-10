const express = require('express');
const router = express.Router();
const db = require('../../../db');
const { logAudit, ACTIONS } = require('../../../utils/auditLog');
const { verifyOwnPassword } = require('../../../utils/verifyOwnPassword');
const { parseIds } = require('../../../utils/parseIds');
const { TRASH_RETENTION_DAYS } = require('../../../utils/constants');

// GET /api/admin/users/trash
router.get('/trash', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', course_id = '', section_id = '' } = req.query;
    const offset = (page - 1) * limit;
    const params = [`%${search}%`, `%${search}%`];
    let where = "WHERE u.deleted_at IS NOT NULL AND u.role != 'admin' AND (u.student_number LIKE ? OR u.full_name LIKE ?)";
    if (role) { where += ' AND u.role = ?'; params.push(role); }
    if (course_id) { where += ' AND u.course_id = ?'; params.push(course_id); }
    if (section_id) { where += ' AND u.section_id = ?'; params.push(section_id); }
    const [users] = await db.query(
      `SELECT u.id, u.student_number, u.full_name, u.role, u.course_id, u.section_id, u.deleted_at,
              GREATEST(DATEDIFF(u.deleted_at + INTERVAL ${TRASH_RETENTION_DAYS} DAY, NOW()), 0) AS days_remaining
       FROM users u ${where} ORDER BY u.deleted_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch trash.' });
  }
});

// POST /api/admin/users/bulk-restore
router.post('/bulk-restore', async (req, res) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ message: 'ids array is required.' });
    const placeholders = ids.map(() => '?').join(',');
    const [affected] = await db.query(
      `SELECT id, student_number, full_name FROM users WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
      ids
    );
    const [result] = await db.query(
      `UPDATE users SET deleted_at = NULL WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
      ids
    );
    await logAudit(req, {
      action: ACTIONS.RESTORE,
      target_type: 'user',
      target_name: `${result.affectedRows} user(s)`,
      description: `Restored ${result.affectedRows} user(s) from trash`,
      metadata: { count: result.affectedRows, ids, users: affected },
    });
    res.json({ restored: result.affectedRows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to restore users.' });
  }
});

// POST /api/admin/users/bulk-delete
router.post('/bulk-delete', async (req, res) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ message: 'ids array is required.' });
    const placeholders = ids.map(() => '?').join(',');
    const [affected] = await db.query(
      `SELECT id, student_number, full_name FROM users WHERE id IN (${placeholders}) AND role != 'admin' AND deleted_at IS NULL`,
      ids
    );
    const [result] = await db.query(
      `UPDATE users SET deleted_at = NOW() WHERE id IN (${placeholders}) AND role != 'admin' AND deleted_at IS NULL`,
      ids
    );
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'user',
      target_name: `${result.affectedRows} user(s)`,
      description: `Moved ${result.affectedRows} user(s) to trash`,
      metadata: { count: result.affectedRows, ids, users: affected },
    });
    res.json({ moved: result.affectedRows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to move users to trash.' });
  }
});

// PATCH /api/admin/users/:id/restore
router.patch('/:id/restore', async (req, res) => {
  try {
    const [[u]] = await db.query('SELECT full_name, student_number FROM users WHERE id=? AND deleted_at IS NOT NULL', [req.params.id]);
    if (!u) return res.status(404).json({ message: 'User is not in trash.' });
    await db.query('UPDATE users SET deleted_at = NULL WHERE id=? AND deleted_at IS NOT NULL', [req.params.id]);
    await logAudit(req, {
      action: ACTIONS.RESTORE,
      target_type: 'user',
      target_name: u.full_name,
      description: `Restored ${u.full_name} (${u.student_number}) from trash`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to restore user.' });
  }
});

// DELETE /api/admin/users/:id/permanent — requires the ADMIN's own password (step-up auth),
// and only ever operates on a user already sitting in trash.
router.delete('/:id/permanent', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password is required.' });

    if (!(await verifyOwnPassword(req, password))) return res.status(401).json({ message: 'Incorrect password.' });

    const [[target]] = await db.query(
      'SELECT full_name, student_number FROM users WHERE id=? AND deleted_at IS NOT NULL',
      [req.params.id]
    );
    if (!target) return res.status(404).json({ message: 'User must be in trash before it can be permanently deleted.' });

    await db.query('DELETE FROM users WHERE id=? AND deleted_at IS NOT NULL', [req.params.id]);
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'user',
      target_name: target.full_name,
      description: `Permanently deleted ${target.full_name} (${target.student_number})`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to permanently delete user.' });
  }
});

// POST /api/admin/users/bulk-permanent-delete — requires the ADMIN's own password (step-up auth),
// and only ever operates on users already sitting in trash.
router.post('/bulk-permanent-delete', async (req, res) => {
  try {
    const { password } = req.body;
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ message: 'ids array is required.' });
    if (!password) return res.status(400).json({ message: 'Password is required.' });

    if (!(await verifyOwnPassword(req, password))) return res.status(401).json({ message: 'Incorrect password.' });

    const placeholders = ids.map(() => '?').join(',');
    const [affected] = await db.query(
      `SELECT id, student_number, full_name FROM users WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
      ids
    );
    const [result] = await db.query(
      `DELETE FROM users WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
      ids
    );
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'user',
      target_name: `${result.affectedRows} user(s)`,
      description: `Permanently deleted ${result.affectedRows} user(s)`,
      metadata: { count: result.affectedRows, ids, users: affected },
    });
    res.json({ deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to permanently delete users.' });
  }
});

module.exports = router;
