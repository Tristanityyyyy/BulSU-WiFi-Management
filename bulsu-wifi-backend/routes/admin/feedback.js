const router = require('express').Router();
const db = require('../../db');

// GET /api/admin/feedback
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, rating, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (rating)    { where += ' AND rating = ?'; params.push(Number(rating)); }
    if (date_from) { where += ' AND submitted_at >= ?'; params.push(date_from); }
    if (date_to)   { where += ' AND submitted_at <= ?'; params.push(date_to + ' 23:59:59'); }
    const [feedback] = await db.query(
      `SELECT * FROM feedback ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM feedback ${where}`, params);
    res.json({ feedback, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch feedback.' });
  }
});

// GET /api/admin/feedback/aggregate
router.get('/aggregate', async (req, res) => {
  try {
    const [[{ average, total }]] = await db.query(
      'SELECT AVG(rating) AS average, COUNT(*) AS total FROM feedback'
    );
    const [dist] = await db.query('SELECT rating, COUNT(*) AS count FROM feedback GROUP BY rating');
    const distribution = {};
    dist.forEach((r) => { distribution[r.rating] = r.count; });
    res.json({ average: parseFloat(average) || 0, total, distribution });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch feedback aggregate.' });
  }
});

module.exports = router;
