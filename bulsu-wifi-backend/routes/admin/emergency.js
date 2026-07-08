const router = require('express').Router();
const db = require('../../db');
const crypto = require('crypto');

const VALID_TARGET_TYPES = ['user', 'guest', 'section', 'course', 'role'];
const VALID_ROLES = ['student', 'faculty', 'staff'];
const SORT_COLUMNS = ['activated_at', 'status', 'target_label'];

// GET /api/admin/emergency
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', target_type = '', sort = 'activated_at', dir = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';
    if (search) { where += ' AND (target_label LIKE ? OR reason LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (target_type) { where += ' AND target_type = ?'; params.push(target_type); }

    const sortCol = SORT_COLUMNS.includes(sort) ? sort : 'activated_at';
    const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

    const [priorities] = await db.query(
      `SELECT COALESCE(batch_id, CAST(id AS CHAR)) AS group_key,
              MAX(id) AS id,
              MAX(batch_id) AS batch_id,
              MAX(target_type) AS target_type,
              MAX(target_label) AS target_label,
              COUNT(*) AS user_count,
              MAX(reason) AS reason,
              MAX(activated_by_name) AS activated_by_name,
              MAX(activated_at) AS activated_at,
              MAX(status) AS status
       FROM emergency_priority ${where}
       GROUP BY COALESCE(batch_id, CAST(id AS CHAR))
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT COALESCE(batch_id, CAST(id AS CHAR)) AS gk FROM emergency_priority ${where} GROUP BY gk
       ) grouped`,
      params
    );

    res.json({ priorities, total });
  } catch (err) {
    console.error('GET /admin/emergency failed:', err);
    res.status(500).json({ message: 'Failed to fetch emergency priorities.' });
  }
});

// POST /api/admin/emergency
router.post('/', async (req, res) => {
  try {
    const { reason, target_type, target_id } = req.body;
    if (!reason || !target_type || !target_id)
      return res.status(400).json({ message: 'reason, target_type, and target_id are required.' });
    if (!VALID_TARGET_TYPES.includes(target_type))
      return res.status(400).json({ message: 'target_type must be one of: user, guest, section, course, role.' });

    // Guests live in a separate table/id-space from users, so they populate guest_id
    // instead of user_id — every other target type resolves to one or more users.
    const kind = target_type === 'guest' ? 'guest' : 'user';
    let targets = [];
    let targetLabel = '';

    if (target_type === 'user') {
      const [[user]] = await db.query('SELECT id, full_name FROM users WHERE id = ?', [target_id]);
      if (!user) return res.status(404).json({ message: 'User not found.' });
      targets = [user];
      targetLabel = user.full_name;
    } else if (target_type === 'guest') {
      // Guest targeting is multi-select (checkboxes in the UI), so target_id arrives as an array —
      // still accept a bare id too so a single guest works the same as everywhere else.
      const guestIds = Array.isArray(target_id) ? target_id : [target_id];
      if (guestIds.length === 0)
        return res.status(400).json({ message: 'At least one guest must be selected.' });

      const [guestRows] = await db.query(
        `SELECT id FROM guests WHERE id IN (${guestIds.map(() => '?').join(',')})`,
        guestIds
      );
      if (guestRows.length === 0) return res.status(404).json({ message: 'No matching guests found.' });

      // guest_name lives on the session (a per-connection field), not the guest/QR record itself —
      // use whichever session was most recent per guest so labels reflect who's actually connected.
      const [sessionRows] = await db.query(
        `SELECT guest_id, guest_name FROM guest_sessions WHERE guest_id IN (${guestRows.map(() => '?').join(',')}) ORDER BY login_time DESC`,
        guestRows.map((g) => g.id)
      );
      const nameByGuestId = {};
      sessionRows.forEach((s) => { if (!(s.guest_id in nameByGuestId)) nameByGuestId[s.guest_id] = s.guest_name; });

      targets = guestRows.map((g) => ({ id: g.id, full_name: nameByGuestId[g.id] || `Guest #${g.id}` }));
      // targetLabel is (re)computed below from toActivate, after the duplicate check —
      // guest labels enumerate names, so they must reflect who's actually being activated.
    } else if (target_type === 'section') {
      const [[section]] = await db.query('SELECT id, name FROM sections WHERE id = ?', [target_id]);
      if (!section) return res.status(404).json({ message: 'Section not found.' });
      const [rows] = await db.query('SELECT id, full_name FROM users WHERE section_id = ?', [target_id]);
      targets = rows;
      targetLabel = `Section: ${section.name}`;
    } else if (target_type === 'course') {
      const [[course]] = await db.query('SELECT id, code, name FROM courses WHERE id = ?', [target_id]);
      if (!course) return res.status(404).json({ message: 'Course not found.' });
      const [rows] = await db.query('SELECT id, full_name FROM users WHERE course_id = ?', [target_id]);
      targets = rows;
      targetLabel = `Course: ${course.code || course.name}`;
    } else if (target_type === 'role') {
      if (!VALID_ROLES.includes(target_id))
        return res.status(400).json({ message: 'role must be one of: student, faculty, staff.' });
      const [rows] = await db.query('SELECT id, full_name FROM users WHERE role = ?', [target_id]);
      targets = rows;
      targetLabel = `Role: ${target_id[0].toUpperCase() + target_id.slice(1)}`;
    }

    if (targets.length === 0)
      return res.status(400).json({ message: 'No users match this target.' });

    const [[admin]] = await db.query('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
    const activatedByName = admin?.full_name || 'Unknown';

    const idField = kind === 'guest' ? 'guest_id' : 'user_id';
    const [existing] = await db.query(
      `SELECT ${idField} AS id FROM emergency_priority WHERE status = 'active' AND ${idField} IN (${targets.map(() => '?').join(',')})`,
      targets.map((t) => t.id)
    );
    const alreadyActiveIds = new Set(existing.map((r) => r.id));
    const toActivate = targets.filter((t) => !alreadyActiveIds.has(t.id));

    if (toActivate.length === 0) {
      return res.status(200).json({
        activated: 0,
        already_active: targets.length,
        message: `All matched ${kind === 'guest' ? 'guests' : 'users'} already have an active priority.`,
      });
    }

    // Guest labels enumerate names rather than describing a criterion (unlike "Section: X" etc.),
    // so they must be rebuilt from who's *actually* being activated — otherwise a partially-skipped
    // multi-guest request would list names that got filtered out by the duplicate check above.
    if (target_type === 'guest') {
      targetLabel = toActivate.length === 1
        ? `Guest: ${toActivate[0].full_name}`
        : `Guests: ${toActivate.slice(0, 3).map((t) => t.full_name).join(', ')}${toActivate.length > 3 ? ` +${toActivate.length - 3} more` : ''}`;
    }

    const batchId = toActivate.length > 1 ? crypto.randomUUID() : null;
    const activatedAt = new Date();
    const values = toActivate.map((t) => [
      kind === 'guest' ? null : t.id,
      kind === 'guest' ? t.id : null,
      target_type, targetLabel, batchId, req.user.id, activatedByName, reason, activatedAt, 'active',
    ]);

    await db.query(
      `INSERT INTO emergency_priority
        (user_id, guest_id, target_type, target_label, batch_id, activated_by, activated_by_name, reason, activated_at, status)
       VALUES ?`,
      [values]
    );

    res.status(201).json({
      activated: toActivate.length,
      already_active: alreadyActiveIds.size,
      batch_id: batchId,
    });
  } catch (err) {
    console.error('POST /admin/emergency failed:', err);
    res.status(500).json({ message: 'Failed to create emergency priority.' });
  }
});

// PATCH /api/admin/emergency/:id/deactivate — single, ungrouped row
router.patch('/:id/deactivate', async (req, res) => {
  try {
    await db.query(
      'UPDATE emergency_priority SET status="ended", deactivated_at=NOW() WHERE id=?',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /admin/emergency/:id/deactivate failed:', err);
    res.status(500).json({ message: 'Failed to deactivate emergency priority.' });
  }
});

// PATCH /api/admin/emergency/batch/:batchId/deactivate — whole group at once
router.patch('/batch/:batchId/deactivate', async (req, res) => {
  try {
    await db.query(
      'UPDATE emergency_priority SET status="ended", deactivated_at=NOW() WHERE batch_id=? AND status="active"',
      [req.params.batchId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /admin/emergency/batch/:batchId/deactivate failed:', err);
    res.status(500).json({ message: 'Failed to deactivate emergency priority batch.' });
  }
});

module.exports = router;
