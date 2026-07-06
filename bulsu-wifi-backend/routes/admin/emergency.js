const router = require('express').Router();
const db = require('../../db');

// GET /api/admin/emergency
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const [priorities] = await db.query(
      'SELECT * FROM emergency_priority ORDER BY activated_at DESC LIMIT ? OFFSET ?',
      [Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM emergency_priority');
    res.json({ priorities, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch emergency priorities.' });
  }
});

// POST /api/admin/emergency
router.post('/', async (req, res) => {
  try {
    const { user_id, reason } = req.body;
    if (!user_id || !reason)
      return res.status(400).json({ message: 'user_id and reason are required.' });
    const [result] = await db.query(
      'INSERT INTO emergency_priority (user_id, reason, activated_by, activated_at, status) VALUES (?,?,?,NOW(),"active")',
      [user_id, reason, req.user.id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create emergency priority.' });
  }
});

// PATCH /api/admin/emergency/:id/deactivate
router.patch('/:id/deactivate', async (req, res) => {
  try {
    await db.query(
      'UPDATE emergency_priority SET status="ended", deactivated_at=NOW() WHERE id=?',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to deactivate emergency priority.' });
  }
});

module.exports = router;
