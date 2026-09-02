const router = require('express').Router();
const db = require('../../db');
const crypto = require('crypto');
const { logAudit, ACTIONS } = require('../../utils/auditLog');

// student/faculty/staff are all "pick individual people" targets, resolved identically apart
// from which role they're scoped to — kept as one list instead of three near-duplicate branches.
const PERSON_TARGET_TYPES = ['student', 'faculty', 'staff'];
const VALID_TARGET_TYPES = [...PERSON_TARGET_TYPES, 'guest', 'section', 'course'];
const SORT_COLUMNS = ['activated_at', 'status', 'target_label'];

// Upper bounds on what one activation may hand out. Not a policy judgement so
// much as a guard against a slipped decimal point: 1000 Mbps is already above
// the uplink, and 500 GB is far past any single day of use, so anything beyond
// them is a typo rather than an intention.
const MAX_EXTRA_MBPS = 1000;
const MAX_EXTRA_GB = 500;

// The three figures an admin may attach to an activation, read off the request.
//
// All three are optional and all three are *additions* to whatever the role
// already grants — see utils/emergency.js. Leaving them empty is the blanket
// grant this feature has always made: unlimited bandwidth, cap waived. That is
// why blank resolves to null rather than 0, which would mean "add nothing" and
// quietly pin someone to their ordinary role limits during an emergency.
function parseGrant(body) {
  const read = (raw, max, label) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0)
      return { error: `${label} must be a number of 0 or more.` };
    if (value > max) return { error: `${label} must be ${max} or less.` };
    return value;
  };

  const up = read(body.extra_up_mbps, MAX_EXTRA_MBPS, 'Extra upload');
  const down = read(body.extra_down_mbps, MAX_EXTRA_MBPS, 'Extra download');
  const data = read(body.extra_data_gb, MAX_EXTRA_GB, 'Extra data');
  for (const v of [up, down, data]) if (v && v.error) return { error: v.error };

  return { grant: { up, down, data } };
}

// How the grant reads in the audit log and the activation label. Says "blanket"
// rather than nothing at all, so an unlimited grant is never something an admin
// has to infer from an absence.
function describeGrant({ up, down, data }) {
  if (up === null && down === null && data === null) return "unlimited bandwidth, data cap waived";
  const parts = [];
  if (up !== null || down !== null) parts.push(`+${up ?? 0}/${down ?? 0} Mbps`);
  if (data !== null) parts.push(`+${data} GB`);
  return parts.join(', ');
}

// Resolves a target_type/target_id pair into the concrete list of users (or guests) it refers
// to. Shared by the preview and create routes so both agree on exactly who gets activated.
async function resolveTargets(target_type, target_id) {
  const kind = target_type === 'guest' ? 'guest' : 'user';

  if (PERSON_TARGET_TYPES.includes(target_type)) {
    const userIds = Array.isArray(target_id) ? target_id : [target_id];
    if (userIds.length === 0) return { error: { status: 400, message: `At least one ${target_type} must be selected.` } };
    // Scoped by role as well as id — the picker already searches within this role, but this
    // keeps the resolved set (and its label) accurate even if a stale/tampered id slips through.
    // Soft-deleted accounts are excluded here and in the two resolvers below: they
    // cannot log in at all (authRoutes refuses them), so they can never hold a
    // session for a priority to act on — granting one only inflates the count the
    // admin is shown and leaves a row pointing at a deleted person.
    const [rows] = await db.query(
      `SELECT id, full_name FROM users WHERE role = ? AND deleted_at IS NULL AND id IN (${userIds.map(() => '?').join(',')})`,
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

    // guest_name lives on the session (a per-connection field), not the voucher record itself —
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
      `SELECT id, full_name FROM users WHERE deleted_at IS NULL AND section_id IN (${sections.map(() => '?').join(',')})`,
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
      `SELECT id, full_name FROM users WHERE deleted_at IS NULL AND course_id IN (${courses.map(() => '?').join(',')})`,
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

// Are two grants the same offer? Figures arrive from the client as numbers and
// come back from DECIMAL(6,2) as strings, so they are compared numerically —
// and null has to stay distinguishable from 0, because null is the blanket grant
// (unlimited, cap waived) while 0 means "add nothing to the role's own limits".
function sameFigure(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return Number(a) === Number(b);
}

function sameGrant(row, grant) {
  return sameFigure(row.extra_up_mbps, grant.up)
    && sameFigure(row.extra_down_mbps, grant.down)
    && sameFigure(row.extra_data_gb, grant.data);
}

// Sorts resolved targets into what should happen to each of them.
//
// Three outcomes, not two. Before a priority carried figures there were only
// ever two — activate someone, or skip someone who already had one — because
// every grant was the identical blanket boost and re-activating changed nothing.
// Now the figures differ, so selecting someone who already holds a priority is
// usually an admin correcting or raising it, and skipping them silently strands
// a typo behind a deactivate/re-activate dance during an emergency.
//
// Both preview and create run this, so the confirm step describes exactly what
// the activation will do.
async function splitByOutcome(kind, targets, grant) {
  if (targets.length === 0) return { toActivate: [], toUpdate: [], unchanged: [] };
  const idField = kind === 'guest' ? 'guest_id' : 'user_id';
  const [existing] = await db.query(
    `SELECT id AS row_id, ${idField} AS id, extra_up_mbps, extra_down_mbps, extra_data_gb
       FROM emergency_priority
      WHERE status = 'active' AND ${idField} IN (${targets.map(() => '?').join(',')})`,
    targets.map((t) => t.id)
  );
  const activeById = new Map(existing.map((r) => [r.id, r]));

  const toActivate = [];
  const toUpdate = [];
  const unchanged = [];
  for (const t of targets) {
    const row = activeById.get(t.id);
    if (!row) toActivate.push(t);
    else if (sameGrant(row, grant)) unchanged.push(t);
    else toUpdate.push({ ...t, rowId: row.row_id, previous: row });
  }
  return { toActivate, toUpdate, unchanged };
}

// Ends a sentence that finishes on a person's name. Filipino names very often
// end in an initial — "Mendoza, Rose Laurence F." — and appending a full stop
// to that reads as a typo.
function endsSentence(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
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
              MAX(status) AS status,
              MAX(extra_up_mbps) AS extra_up_mbps,
              MAX(extra_down_mbps) AS extra_down_mbps,
              MAX(extra_data_gb) AS extra_data_gb
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

    // The preview needs the figures too, now that they decide an outcome: the same
    // selection is "2 skipped" or "2 updated" depending on what is being offered.
    const { error: grantError, grant } = parseGrant(req.body);
    if (grantError) return res.status(400).json({ message: grantError });

    const { error, kind, targets, targetLabel } = await resolveTargets(target_type, target_id);
    if (error) return res.status(error.status).json({ message: error.message });
    if (targets.length === 0) return res.status(400).json({ message: 'No users match this target.' });

    const { toActivate, toUpdate, unchanged } = await splitByOutcome(kind, targets, grant);
    const acting = [...toActivate, ...toUpdate];
    const label = buildActivationLabel(target_type, acting.length ? acting : targets, targetLabel);

    res.json({
      count: toActivate.length,
      updated: toUpdate.length,
      updated_names: namesOf(toUpdate),
      already_active: unchanged.length,
      already_active_names: namesOf(unchanged),
      target_label: label,
    });
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

    const { error: grantError, grant } = parseGrant(req.body);
    if (grantError) return res.status(400).json({ message: grantError });

    const { error, kind, targets, targetLabel: criterionLabel } = await resolveTargets(target_type, target_id);
    if (error) return res.status(error.status).json({ message: error.message });
    if (targets.length === 0) return res.status(400).json({ message: 'No users match this target.' });

    const [[admin]] = await db.query('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
    const activatedByName = admin?.full_name || 'Unknown';

    const { toActivate, toUpdate, unchanged } = await splitByOutcome(kind, targets, grant);

    if (toActivate.length === 0 && toUpdate.length === 0) {
      const alreadyActiveNames = namesOf(unchanged);
      return res.status(200).json({
        activated: 0,
        updated: 0,
        already_active: unchanged.length,
        already_active_names: alreadyActiveNames,
        message: endsSentence(`Already has this grant: ${alreadyActiveNames}`),
      });
    }

    // Raising or correcting an existing grant edits that person's row in place.
    // Only the offer changes — the figures and the reason behind them. When the
    // priority began, and who started it, are left as they were: that person's
    // emergency did start then, and rewriting it so a mixed activation groups
    // more tidily in the list would be a tidier lie. The audit entry below is
    // where the change itself is recorded.
    for (const t of toUpdate) {
      await db.query(
        `UPDATE emergency_priority
            SET extra_up_mbps = ?, extra_down_mbps = ?, extra_data_gb = ?, reason = ?
          WHERE id = ?`,
        [grant.up, grant.down, grant.data, reason, t.rowId]
      );
    }

    if (toUpdate.length > 0) {
      const from = describeGrant({
        up: toUpdate[0].previous.extra_up_mbps,
        down: toUpdate[0].previous.extra_down_mbps,
        data: toUpdate[0].previous.extra_data_gb,
      });
      await logAudit(req, {
        action: ACTIONS.UPDATE,
        target_type: 'emergency_priority',
        target_name: namesOf(toUpdate),
        description: `Changed emergency grant for ${namesOf(toUpdate)} (${toUpdate.length} affected) from ${from} to ${describeGrant(grant)} — reason: ${reason}`,
        metadata: { target_type, count: toUpdate.length, ...grant },
      });
    }

    let batchId = null;
    let targetLabel = buildActivationLabel(target_type, toUpdate, criterionLabel);

    if (toActivate.length > 0) {
      targetLabel = buildActivationLabel(target_type, toActivate, criterionLabel);
      batchId = toActivate.length > 1 ? crypto.randomUUID() : null;
      const activatedAt = new Date();
      const values = toActivate.map((t) => [
        kind === 'guest' ? null : t.id,
        kind === 'guest' ? t.id : null,
        target_type, targetLabel, batchId, req.user.id, activatedByName, reason, activatedAt, 'active',
        grant.up, grant.down, grant.data,
      ]);

      await db.query(
        `INSERT INTO emergency_priority
          (user_id, guest_id, target_type, target_label, batch_id, activated_by, activated_by_name, reason, activated_at, status,
           extra_up_mbps, extra_down_mbps, extra_data_gb)
         VALUES ?`,
        [values]
      );

      await logAudit(req, {
        action: ACTIONS.CREATED,
        target_type: 'emergency_priority',
        target_name: targetLabel,
        description: `Activated emergency priority for ${targetLabel} (${toActivate.length} affected, ${describeGrant(grant)}) — reason: ${reason}`,
        metadata: { target_type, count: toActivate.length, ...grant },
      });
    }

    res.status(201).json({
      activated: toActivate.length,
      updated: toUpdate.length,
      updated_names: namesOf(toUpdate),
      already_active: unchanged.length,
      already_active_names: namesOf(unchanged),
      batch_id: batchId,
      target_label: targetLabel,
      grant: describeGrant(grant),
    });
  } catch (err) {
    console.error('POST /admin/emergency failed:', err);
    res.status(500).json({ message: 'Failed to create emergency priority.' });
  }
});

// PATCH /api/admin/emergency/:id/deactivate — single, ungrouped row
router.patch('/:id/deactivate', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT target_label FROM emergency_priority WHERE id=?', [req.params.id]);
    await db.query(
      'UPDATE emergency_priority SET status="ended", deactivated_at=NOW() WHERE id=?',
      [req.params.id]
    );
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'emergency_priority',
      target_name: row?.target_label,
      description: `Deactivated emergency priority for ${row?.target_label}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /admin/emergency/:id/deactivate failed:', err);
    res.status(500).json({ message: 'Failed to deactivate emergency priority.' });
  }
});

// PATCH /api/admin/emergency/batch/:batchId/deactivate — whole group at once
router.patch('/batch/:batchId/deactivate', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT target_label FROM emergency_priority WHERE batch_id=? LIMIT 1',
      [req.params.batchId]
    );
    const [result] = await db.query(
      'UPDATE emergency_priority SET status="ended", deactivated_at=NOW() WHERE batch_id=? AND status="active"',
      [req.params.batchId]
    );
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'emergency_priority',
      target_name: row?.target_label,
      description: `Deactivated emergency priority for ${row?.target_label} (${result.affectedRows} affected)`,
      metadata: { affected: result.affectedRows },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /admin/emergency/batch/:batchId/deactivate failed:', err);
    res.status(500).json({ message: 'Failed to deactivate emergency priority batch.' });
  }
});

module.exports = router;
