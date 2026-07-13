const router = require('express').Router();
const db = require('../../db');
const { logAudit, ACTIONS } = require('../../utils/auditLog');
const { parseIds } = require('../../utils/parseIds');

// GET /api/admin/feedback
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, rating, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE feedback.deleted_at IS NULL';
    const params = [];
    if (rating)    { where += ' AND rating = ?'; params.push(Number(rating)); }
    if (date_from) { where += ' AND submitted_at >= ?'; params.push(date_from); }
    if (date_to)   { where += ' AND submitted_at <= ?'; params.push(date_to + ' 23:59:59'); }
    const [feedback] = await db.query(
      `SELECT feedback.*, users.full_name AS user_full_name FROM feedback
       LEFT JOIN users ON feedback.user_id = users.id
       ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM feedback ${where}`, params);
    res.json({ feedback, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch feedback.' });
  }
});

// GET /api/admin/feedback/trash
router.get('/trash', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const where = 'WHERE feedback.deleted_at IS NOT NULL';
    const [feedback] = await db.query(
      `SELECT feedback.*, users.full_name AS user_full_name FROM feedback
       LEFT JOIN users ON feedback.user_id = users.id
       ${where} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
      [Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM feedback ${where}`);
    res.json({ feedback, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch feedback trash.' });
  }
});

// POST /api/admin/feedback/bulk-delete — soft delete (move to trash)
router.post('/bulk-delete', async (req, res) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ message: 'ids array is required.' });
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await db.query(
      `UPDATE feedback SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids
    );
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'feedback',
      target_name: `${result.affectedRows} feedback entr${result.affectedRows === 1 ? 'y' : 'ies'}`,
      description: `Moved ${result.affectedRows} feedback entr${result.affectedRows === 1 ? 'y' : 'ies'} to trash`,
      metadata: { count: result.affectedRows, ids },
    });
    res.json({ moved: result.affectedRows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to move feedback to trash.' });
  }
});

// POST /api/admin/feedback/bulk-restore
router.post('/bulk-restore', async (req, res) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ message: 'ids array is required.' });
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await db.query(
      `UPDATE feedback SET deleted_at = NULL WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
      ids
    );
    await logAudit(req, {
      action: ACTIONS.RESTORE,
      target_type: 'feedback',
      target_name: `${result.affectedRows} feedback entr${result.affectedRows === 1 ? 'y' : 'ies'}`,
      description: `Restored ${result.affectedRows} feedback entr${result.affectedRows === 1 ? 'y' : 'ies'} from trash`,
      metadata: { count: result.affectedRows, ids },
    });
    res.json({ restored: result.affectedRows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to restore feedback.' });
  }
});

// GET /api/admin/feedback/aggregate
router.get('/aggregate', async (req, res) => {
  try {
    const [[{ average, total }]] = await db.query(
      "SELECT AVG(rating) AS average, COUNT(*) AS total FROM feedback WHERE deleted_at IS NULL"
    );
    const [dist] = await db.query(
      "SELECT rating, COUNT(*) AS count FROM feedback WHERE deleted_at IS NULL GROUP BY rating"
    );
    const distribution = {};
    dist.forEach((r) => { distribution[r.rating] = r.count; });

    const [byRoleRows] = await db.query(
      `SELECT COALESCE(role, 'unknown') AS role, AVG(rating) AS average, COUNT(*) AS count
       FROM feedback WHERE deleted_at IS NULL GROUP BY role`
    );
    const byRole = byRoleRows.map((r) => ({ role: r.role, average: parseFloat(r.average) || 0, count: r.count }));

    const [byDateRows] = await db.query(
      `SELECT DATE(submitted_at) AS date, AVG(rating) AS average, COUNT(*) AS count
       FROM feedback WHERE deleted_at IS NULL AND submitted_at >= NOW() - INTERVAL 30 DAY
       GROUP BY DATE(submitted_at) ORDER BY date`
    );
    const byDate = byDateRows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      average: parseFloat(r.average) || 0,
      count: r.count,
    }));

    res.json({ average: parseFloat(average) || 0, total, distribution, byRole, byDate });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch feedback aggregate.' });
  }
});

module.exports = router;
