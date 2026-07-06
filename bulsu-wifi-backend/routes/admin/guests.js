const router = require('express').Router();
const db = require('../../db');
const crypto = require('crypto');

// GET /api/admin/guests
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const [guests] = await db.query(
      'SELECT * FROM guests ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM guests');
    res.json({ guests, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch guests.' });
  }
});

// POST /api/admin/guests
router.post('/', async (req, res) => {
  try {
    const { duration_minutes = 60, data_limit_gb = 1 } = req.body;
    const qr_code = crypto.randomBytes(24).toString('hex');
    const expires_at = new Date(Date.now() + duration_minutes * 60 * 1000);
    const [result] = await db.query(
      'INSERT INTO guests (qr_code, expires_at, data_limit_gb, status, created_at) VALUES (?,?,?,"active",NOW())',
      [qr_code, expires_at, data_limit_gb]
    );
    res.status(201).json({ id: result.insertId, qr_code, expires_at, data_limit_gb, status: 'active' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate guest QR.' });
  }
});

// PATCH /api/admin/guests/:id/revoke
router.patch('/:id/revoke', async (req, res) => {
  try {
    await db.query('UPDATE guests SET status="expired" WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to revoke guest.' });
  }
});

module.exports = router;
