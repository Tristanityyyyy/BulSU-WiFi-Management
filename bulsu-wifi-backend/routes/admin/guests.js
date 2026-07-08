const router = require('express').Router();
const db = require('../../db');
const crypto = require('crypto');
const { sweepExpiredGuests } = require('../../jobs/guestExpiry');

// GET /api/admin/guests
router.get('/', async (req, res) => {
  try {
    // Flip any newly lapsed codes before listing, so status is exact
    // even between sweeper ticks.
    await sweepExpiredGuests();
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const [guests] = await db.query(
      'SELECT * FROM guests ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM guests');
    res.json({ guests, total });
  } catch (err) {
    console.error('GET /admin/guests failed:', err);
    res.status(500).json({ message: 'Failed to fetch guests.' });
  }
});

// POST /api/admin/guests
router.post('/', async (req, res) => {
  try {
    const { starts_at, expires_at, data_limit_gb = 1 } = req.body;
    if (!starts_at || !expires_at)
      return res.status(400).json({ message: 'starts_at and expires_at are required.' });

    const start = new Date(starts_at);
    const end = new Date(expires_at);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ message: 'starts_at and expires_at must be valid dates.' });
    if (end <= start)
      return res.status(400).json({ message: 'End time must be after start time.' });

    const qr_code = crypto.randomBytes(24).toString('hex');
    const [result] = await db.query(
      'INSERT INTO guests (token, starts_at, expires_at, data_limit_gb, status, created_at, created_by) VALUES (?,?,?,?,"active",NOW(),?)',
      [qr_code, start, end, data_limit_gb, req.user.id]
    );
    res.status(201).json({ id: result.insertId, qr_code, starts_at: start, expires_at: end, data_limit_gb, status: 'active' });
  } catch (err) {
    console.error('POST /admin/guests failed:', err);
    res.status(500).json({ message: 'Failed to generate guest QR.' });
  }
});

// PATCH /api/admin/guests/:id/revoke
router.patch('/:id/revoke', async (req, res) => {
  try {
    await db.query('UPDATE guests SET status="expired" WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /admin/guests/:id/revoke failed:', err);
    res.status(500).json({ message: 'Failed to revoke guest.' });
  }
});

// PUT /api/admin/guests/:id — admin edits the start/expiration time
router.put('/:id', async (req, res) => {
  try {
    const { starts_at, expires_at } = req.body;
    if (!starts_at || !expires_at) return res.status(400).json({ message: 'starts_at and expires_at are required.' });
    const start = new Date(starts_at);
    const end = new Date(expires_at);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ message: 'starts_at and expires_at must be valid dates.' });
    if (end <= start)
      return res.status(400).json({ message: 'End time must be after start time.' });
    await db.query('UPDATE guests SET starts_at=?, expires_at=? WHERE id=?', [start, end, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/guests/:id failed:', err);
    res.status(500).json({ message: 'Failed to update guest.' });
  }
});

// DELETE /api/admin/guests/:id — only once the code is no longer valid
router.delete('/:id', async (req, res) => {
  try {
    const [[guest]] = await db.query('SELECT status, expires_at FROM guests WHERE id=?', [req.params.id]);
    if (!guest) return res.status(404).json({ message: 'Guest not found.' });
    const isExpired = guest.status === 'expired' || new Date(guest.expires_at) <= new Date();
    if (!isExpired) return res.status(400).json({ message: 'Only expired guest codes can be deleted.' });
    await db.query('DELETE FROM guests WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /admin/guests/:id failed:', err);
    res.status(500).json({ message: 'Failed to delete guest.' });
  }
});

module.exports = router;
