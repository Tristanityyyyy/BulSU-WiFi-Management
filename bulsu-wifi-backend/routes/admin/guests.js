const router = require('express').Router();
const db = require('../../db');
const { sweepExpiredGuests, endLapsedGuestSessions } = require('../../jobs/guestExpiry');
const { logAudit, ACTIONS } = require('../../utils/auditLog');
const { generateGuestCode } = require('../../utils/guestCode');

// An upper bound on seats, so a slipped keystroke cannot mint a pass that lets
// a whole campus on. Well above any real visiting group.
const MAX_SEATS = 200;

function parseSeats(raw) {
  if (raw === undefined || raw === null || raw === '') return 1;
  const seats = Number(raw);
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) return null;
  return seats;
}

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
    const { starts_at, expires_at, data_limit_gb = 1, max_uses } = req.body;
    if (!starts_at || !expires_at)
      return res.status(400).json({ message: 'starts_at and expires_at are required.' });

    // Seats default to 1 — the pass every desk hands to one visitor. The data
    // limit is per guest, not shared, so a 20-seat 1 GB pass is 20 GB of
    // allowance and the admin should see it that way.
    const seats = parseSeats(max_uses);
    if (seats === null)
      return res.status(400).json({ message: `Seats must be a whole number between 1 and ${MAX_SEATS}.` });

    const start = new Date(starts_at);
    const end = new Date(expires_at);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ message: 'starts_at and expires_at must be valid dates.' });
    if (end <= start)
      return res.status(400).json({ message: 'End time must be after start time.' });

    // The voucher code is the whole credential. The unique index is what
    // settles a collision, not a pre-check — a SELECT would let two concurrent
    // issues past — so retry on the duplicate instead. Ten rounds against
    // 8.5e11 combinations is a formality.
    let result;
    let code;
    for (let attempt = 0; ; attempt++) {
      code = generateGuestCode();
      try {
        [result] = await db.query(
          'INSERT INTO guests (code, starts_at, expires_at, data_limit_gb, max_uses, status, created_at, created_by) VALUES (?,?,?,?,?,"active",NOW(),?)',
          [code, start, end, data_limit_gb, seats, req.user.id]
        );
        break;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY' || attempt === 9) throw err;
      }
    }
    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: 'guest',
      target_name: `Guest code (expires ${end.toLocaleString()})`,
      description: `Generated guest voucher for ${seats} guest${seats === 1 ? '' : 's'} (expires ${end.toLocaleString()})`,
    });
    res.status(201).json({ id: result.insertId, code, starts_at: start, expires_at: end, data_limit_gb, max_uses: seats, uses: 0, status: 'active' });
  } catch (err) {
    console.error('POST /admin/guests failed:', err);
    res.status(500).json({ message: 'Failed to generate guest voucher.' });
  }
});

// PATCH /api/admin/guests/:id/revoke
router.patch('/:id/revoke', async (req, res) => {
  try {
    const [[g]] = await db.query('SELECT expires_at FROM guests WHERE id=?', [req.params.id]);
    await db.query('UPDATE guests SET status="expired" WHERE id=?', [req.params.id]);
    // Revoking the code has to actually kick the guest off — otherwise they keep
    // browsing until the original expiry. The sweeper is the retry net if the
    // router happens to be unreachable right now.
    const { pending } = await endLapsedGuestSessions(req.params.id);
    const label = g?.expires_at ? `Guest code (expires ${new Date(g.expires_at).toLocaleString()})` : 'Guest code';
    await logAudit(req, {
      action: ACTIONS.BLOCKED,
      target_type: 'guest',
      target_name: label,
      description: `Revoked ${label}`,
    });
    res.json({
      ok: true,
      ...(pending
        ? { warning: "Code revoked, but the router couldn't be reached to disconnect the device yet — this will keep retrying." }
        : {}),
    });
  } catch (err) {
    console.error('PATCH /admin/guests/:id/revoke failed:', err);
    res.status(500).json({ message: 'Failed to revoke guest.' });
  }
});

// PUT /api/admin/guests/:id — admin edits the start/expiration time
router.put('/:id', async (req, res) => {
  try {
    const { starts_at, expires_at, max_uses } = req.body;
    if (!starts_at || !expires_at) return res.status(400).json({ message: 'starts_at and expires_at are required.' });
    const start = new Date(starts_at);
    const end = new Date(expires_at);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ message: 'starts_at and expires_at must be valid dates.' });
    if (end <= start)
      return res.status(400).json({ message: 'End time must be after start time.' });
    // Seats can be raised for a group that grew, or lowered to stop a pass
    // admitting anyone else — but never below the number already let in, which
    // would leave the pass reading as over-subscribed and the arithmetic behind
    // "places left" going negative.
    let seats;
    if (max_uses !== undefined) {
      seats = parseSeats(max_uses);
      if (seats === null)
        return res.status(400).json({ message: `Seats must be a whole number between 1 and ${MAX_SEATS}.` });
      const [[current]] = await db.query('SELECT uses FROM guests WHERE id=?', [req.params.id]);
      if (current && seats < current.uses)
        return res.status(400).json({ message: `${current.uses} guest${current.uses === 1 ? ' has' : 's have'} already used this pass, so it cannot be set below ${current.uses} seats.` });
    }

    await db.query(
      seats === undefined
        ? 'UPDATE guests SET starts_at=?, expires_at=? WHERE id=?'
        : 'UPDATE guests SET starts_at=?, expires_at=?, max_uses=? WHERE id=?',
      seats === undefined ? [start, end, req.params.id] : [start, end, seats, req.params.id]
    );

    // Raising the seats on a pass that filled up has to reopen it, or the extra
    // places exist only in the column and every arrival is still turned away.
    await db.query("UPDATE guests SET status='active' WHERE id=? AND status='used' AND uses < max_uses", [req.params.id]);

    const label = `Guest code (expires ${end.toLocaleString()})`;
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'guest',
      target_name: label,
      description: `Edited ${label} window to start ${start.toLocaleString()}`,
    });
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
    const label = `Guest code (expired ${new Date(guest.expires_at).toLocaleString()})`;
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'guest',
      target_name: label,
      description: `Deleted ${label}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /admin/guests/:id failed:', err);
    res.status(500).json({ message: 'Failed to delete guest.' });
  }
});

module.exports = router;
