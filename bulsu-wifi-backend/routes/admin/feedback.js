const router = require('express').Router();
const db = require('../../db');

// GET /api/admin/feedback
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const [feedback] = await db.query(
      'SELECT * FROM feedback ORDER BY submitted_at DESC LIMIT ? OFFSET ?',
      [Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM feedback');
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
