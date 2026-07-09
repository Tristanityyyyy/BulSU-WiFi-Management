const router = require('express').Router();
const db = require('../../db');
const crypto = require('crypto');

// student/faculty/staff are all "pick individual people" targets, resolved identically apart
// from which role they're scoped to — kept as one list instead of three near-duplicate branches.
const PERSON_TARGET_TYPES = ['student', 'faculty', 'staff'];
const VALID_TARGET_TYPES = [...PERSON_TARGET_TYPES, 'guest', 'section', 'course'];
const SORT_COLUMNS = ['activated_at', 'status', 'target_label'];

// Resolves a target_type/target_id pair into the concrete list of users (or guests) it refers
// to. Shared by the preview and create routes so both agree on exactly who gets activated.
async function resolveTargets(target_type, target_id) {
  const kind = target_type === 'guest' ? 'guest' : 'user';

  if (PERSON_TARGET_TYPES.includes(target_type)) {
    const userIds = Array.isArray(target_id) ? target_id : [target_id];
    if (userIds.length === 0) return { error: { status: 400, message: `At least one ${target_type} must be selected.` } };
    // Scoped by role as well as id — the picker already searches within this role, but this
    // keeps the resolved set (and its label) accurate even if a stale/tampered id slips through.
    const [rows] = await db.query(
      `SELECT id, full_name FROM users WHERE role = ? AND id IN (${userIds.map(() => '?').join(',')})`,
      [target_type, ...userIds]
    );
    if (rows.length === 0) return { error: { status: 404, message: `No matching ${target_type}s found.` } };
    return { kind, targets: rows, targetLabel: '' };
  }

  if (target_type === 'guest') {
    const guestIds = Array.isArray(target_id) ? target_id : [target_id];
    if (guestIds.length === 0) return { error: { status: 400, message: 'At least one guest must be selected.' } };

    const [guestRows] = await db.query(
      `SELECT id FROM guests WHERE id IN (${guestIds.map(() => '?').join(',')})`,
      guestIds
    );
    if (guestRows.length === 0) return { error: { status: 404, message: 'No matching guests found.' } };

    // guest_name lives on the session (a per-connection field), not the guest/QR record itself —
    // use whichever session was most recent per guest so labels reflect who's actually connected.
    const [sessionRows] = await db.query(
      `SELECT guest_id, guest_name FROM guest_sessions WHERE guest_id IN (${guestRows.map(() => '?').join(',')}) ORDER BY login_time DESC`,
      guestRows.map((g) => g.id)
    );
    const nameByGuestId = {};
    sessionRows.forEach((s) => { if (!(s.guest_id in nameByGuestId)) nameByGuestId[s.guest_id] = s.guest_name; });

    const targets = guestRows.map((g) => ({ id: g.id, full_name: nameByGuestId[g.id] || `Guest #${g.id}` }));
    return { kind, targets, targetLabel: '' };
  }

  if (target_type === 'section') {
    const sectionIds = Array.isArray(target_id) ? target_id : [target_id];
    if (sectionIds.length === 0) return { error: { status: 400, message: 'At least one section must be selected.' } };
    const [sections] = await db.query(
      `SELECT id, name FROM sections WHERE id IN (${sectionIds.map(() => '?').join(',')})`,
      sectionIds
    );
    if (sections.length === 0) return { error: { status: 404, message: 'No matching sections found.' } };
    const [rows] = await db.query(
      `SELECT id, full_name FROM users WHERE section_id IN (${sections.map(() => '?').join(',')})`,
      sections.map((s) => s.id)
    );
    const targetLabel = sections.length === 1
      ? `Section: ${sections[0].name}`
      : `Sections: ${sections.slice(0, 3).map((s) => s.name).join(', ')}${sections.length > 3 ? ` +${sections.length - 3} more` : ''}`;
    return { kind, targets: rows, targetLabel };
  }

  if (target_type === 'course') {
    const courseIds = Array.isArray(target_id) ? target_id : [target_id];
    if (courseIds.length === 0) return { error: { status: 400, message: 'At least one course must be selected.' } };
    const [courses] = await db.query(
      `SELECT id, code, name FROM courses WHERE id IN (${courseIds.map(() => '?').join(',')})`,
      courseIds
    );
    if (courses.length === 0) return { error: { status: 404, message: 'No matching courses found.' } };
    const [rows] = await db.query(
      `SELECT id, full_name FROM users WHERE course_id IN (${courses.map(() => '?').join(',')})`,
      courses.map((c) => c.id)
    );
    const courseLabels = courses.map((c) => c.code || c.name);
    const targetLabel = courses.length === 1
      ? `Course: ${courseLabels[0]}`
      : `Courses: ${courseLabels.slice(0, 3).join(', ')}${courses.length > 3 ? ` +${courses.length - 3} more` : ''}`;
    return { kind, targets: rows, targetLabel };
  }

  return { error: { status: 400, message: 'target_type must be one of: student, faculty, staff, guest, section, course.' } };
}

// Splits resolved targets into those that already have an active priority and those that don't,
// so both preview and create show/act on the exact same "who actually gets activated" set.
async function splitAlreadyActive(kind, targets) {
  if (targets.length === 0) return { toActivate: [], alreadyActiveIds: new Set() };
  const idField = kind === 'guest' ? 'guest_id' : 'user_id';
  const [existing] = await db.query(
    `SELECT ${idField} AS id FROM emergency_priority WHERE status = 'active' AND ${idField} IN (${targets.map(() => '?').join(',')})`,
    targets.map((t) => t.id)
  );
  const alreadyActiveIds = new Set(existing.map((r) => r.id));
  const toActivate = targets.filter((t) => !alreadyActiveIds.has(t.id));
  return { toActivate, alreadyActiveIds };
}

// Same "first 3, +N more" enumeration used for activation labels, reused to name (not just count)
// whoever gets skipped for already having an active priority.
function namesOf(list) {
  if (list.length === 0) return '';
  return list.length <= 3
    ? list.map((t) => t.full_name).join(', ')
    : `${list.slice(0, 3).map((t) => t.full_name).join(', ')} +${list.length - 3} more`;
}

// user/guest labels enumerate the actual people being activated (unlike "Section: X" etc., which
// describe the selection criterion), so they're built from toActivate, not from all matched targets.
function buildActivationLabel(target_type, toActivate, fallbackLabel) {
  if (target_type === 'guest') {
    return toActivate.length === 1
      ? `Guest: ${toActivate[0].full_name}`
      : `Guests: ${toActivate.slice(0, 3).map((t) => t.full_name).join(', ')}${toActivate.length > 3 ? ` +${toActivate.length - 3} more` : ''}`;
  }
  if (PERSON_TARGET_TYPES.includes(target_type)) {
    // "Faculty"/"Staff" are already plural/mass nouns; only "student" needs an -s.
    const plural = target_type === 'student' ? 'Students' : target_type[0].toUpperCase() + target_type.slice(1);
    return toActivate.length === 1
      ? toActivate[0].full_name
      : `${plural}: ${toActivate.slice(0, 3).map((t) => t.full_name).join(', ')}${toActivate.length > 3 ? ` +${toActivate.length - 3} more` : ''}`;
  }
  return fallbackLabel;
}

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

// POST /api/admin/emergency/preview — resolves a target selection to an affected-user count
// without activating anything, so the confirm step never needs more than one request.
router.post('/preview', async (req, res) => {
  try {
    const { target_type, target_id } = req.body;
    if (!target_type || !target_id)
      return res.status(400).json({ message: 'target_type and target_id are required.' });
    if (!VALID_TARGET_TYPES.includes(target_type))
      return res.status(400).json({ message: 'target_type must be one of: student, faculty, staff, guest, section, course.' });

    const { error, kind, targets, targetLabel } = await resolveTargets(target_type, target_id);
    if (error) return res.status(error.status).json({ message: error.message });
    if (targets.length === 0) return res.status(400).json({ message: 'No users match this target.' });

    const { toActivate, alreadyActiveIds } = await splitAlreadyActive(kind, targets);
    const label = buildActivationLabel(target_type, toActivate.length ? toActivate : targets, targetLabel);
    const alreadyActiveNames = namesOf(targets.filter((t) => alreadyActiveIds.has(t.id)));

    res.json({ count: toActivate.length, already_active: alreadyActiveIds.size, already_active_names: alreadyActiveNames, target_label: label });
  } catch (err) {
    console.error('POST /admin/emergency/preview failed:', err);
    res.status(500).json({ message: 'Failed to preview target.' });
  }
});

// POST /api/admin/emergency
router.post('/', async (req, res) => {
  try {
    const { target_type, target_id } = req.body;
    const reason = (req.body.reason || '').trim();
    if (!reason || !target_type || !target_id)
      return res.status(400).json({ message: 'reason, target_type, and target_id are required.' });
    if (!VALID_TARGET_TYPES.includes(target_type))
      return res.status(400).json({ message: 'target_type must be one of: student, faculty, staff, guest, section, course.' });

    const { error, kind, targets, targetLabel: criterionLabel } = await resolveTargets(target_type, target_id);
    if (error) return res.status(error.status).json({ message: error.message });
    if (targets.length === 0) return res.status(400).json({ message: 'No users match this target.' });

    const [[admin]] = await db.query('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
    const activatedByName = admin?.full_name || 'Unknown';

    const { toActivate, alreadyActiveIds } = await splitAlreadyActive(kind, targets);

    if (toActivate.length === 0) {
      const alreadyActiveNames = namesOf(targets);
      return res.status(200).json({
        activated: 0,
        already_active: targets.length,
        already_active_names: alreadyActiveNames,
        message: `Already has an active priority: ${alreadyActiveNames}.`,
      });
    }

    const targetLabel = buildActivationLabel(target_type, toActivate, criterionLabel);
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
      already_active_names: namesOf(targets.filter((t) => alreadyActiveIds.has(t.id))),
      batch_id: batchId,
      target_label: targetLabel,
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
