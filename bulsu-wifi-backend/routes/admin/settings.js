const router = require('express').Router();
const db = require('../../db');
const bcrypt = require('bcrypt');
const { logAudit, ACTIONS } = require('../../utils/auditLog');
const { verifyOwnPassword } = require('../../utils/verifyOwnPassword');

// A catalog entry referenced by any user (incl. soft-deleted) or by the permanent
// enrollment_history is archived rather than hard-deleted, so those references
// never dangle. `usersCol`/`historyCol` are fixed internal column names, not input.
async function countCatalogRefs(usersCol, historyCol, id) {
  const [[u]] = await db.query(`SELECT COUNT(*) AS c FROM users WHERE ${usersCol} = ?`, [id]);
  const [[h]] = await db.query(`SELECT COUNT(*) AS c FROM enrollment_history WHERE ${historyCol} = ?`, [id]);
  return u.c + h.c;
}

async function isCurrentTerm(settingKey, id) {
  const [[row]] = await db.query('SELECT value FROM settings WHERE `key` = ?', [settingKey]);
  return row != null && Number(row.value) === Number(id);
}

// school_years and semesters are both plain "name + status" lookups with duplicate-name
// protection — registers create/update/delete/reactivate for one such table so the two
// entities below don't repeat identical route bodies that differ only in table/label.
function registerNamedCatalogRoutes({ basePath, table, targetType, label, usersRefColumn, currentSettingKey }) {
  const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);

  router.post(basePath, async (req, res) => {
    try {
      const name = req.body.name?.trim();
      if (!name) return res.status(400).json({ message: `${capitalizedLabel} name is required.` });
      const [result] = await db.query(
        `INSERT INTO ${table} (name, status) VALUES (?, ?)`,
        [name, 'active']
      );
      const entity = { id: result.insertId, name, status: 'active' };
      await logAudit(req, {
        action: ACTIONS.CREATED,
        target_type: targetType,
        target_name: name,
        description: `Added ${label} ${name}`,
      });
      res.status(201).json({ [targetType]: entity });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: `That ${label} already exists.` });
      res.status(500).json({ message: `Failed to create ${label}.` });
    }
  });

  router.put(`${basePath}/:id`, async (req, res) => {
    try {
      const name = req.body.name?.trim();
      if (!name) return res.status(400).json({ message: `${capitalizedLabel} name is required.` });
      await db.query(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, Number(req.params.id)]);
      await logAudit(req, {
        action: ACTIONS.UPDATE,
        target_type: targetType,
        target_name: name,
        description: `Updated ${label} to ${name}`,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: `That ${label} already exists.` });
      res.status(500).json({ message: `Failed to update ${label}.` });
    }
  });

  // Delete always archives (soft-delete) so nothing is ever silently lost. The
  // Archived view offers Restore, or an explicit permanent-delete below.
  router.delete(`${basePath}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [[row]] = await db.query(`SELECT name FROM ${table} WHERE id = ?`, [id]);
      const rowLabel = row?.name || `Unknown ${label}`;

      // Never archive the term currently set as active — it would dangle the setting
      // and break imports/transitions.
      if (currentSettingKey && (await isCurrentTerm(currentSettingKey, id))) {
        return res.status(400).json({ message: `Can't delete the current ${label}. Change the current ${label} in Settings first.` });
      }

      await db.query(`UPDATE ${table} SET status = 'inactive' WHERE id = ?`, [id]);
      await logAudit(req, {
        action: ACTIONS.DELETE,
        target_type: targetType,
        target_name: rowLabel,
        description: `Archived ${label} ${rowLabel}`,
      });
      res.json({ ok: true, archived: true });
    } catch (err) {
      res.status(500).json({ message: `Failed to delete ${label}.` });
    }
  });

  // Permanent (hard) delete — only allowed when nothing references it and it isn't
  // the current term; otherwise it stays archived so records never dangle.
  router.delete(`${basePath}/:id/permanent`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [[row]] = await db.query(`SELECT name FROM ${table} WHERE id = ?`, [id]);
      const rowLabel = row?.name || `Unknown ${label}`;

      if (currentSettingKey && (await isCurrentTerm(currentSettingKey, id))) {
        return res.status(400).json({ message: `Can't delete the current ${label}. Change the current ${label} in Settings first.` });
      }
      const refs = await countCatalogRefs(usersRefColumn, usersRefColumn, id);
      if (refs > 0) {
        return res.status(400).json({ message: `Can't permanently delete this ${label} — ${refs} student(s)/record(s) still reference it. It stays archived.` });
      }

      await db.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
      await logAudit(req, {
        action: ACTIONS.DELETE,
        target_type: targetType,
        target_name: rowLabel,
        description: `Permanently deleted ${label} ${rowLabel}`,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: `Failed to permanently delete ${label}.` });
    }
  });

  router.patch(`${basePath}/:id/reactivate`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [[row]] = await db.query(`SELECT name FROM ${table} WHERE id = ?`, [id]);
      await db.query(`UPDATE ${table} SET status = 'active' WHERE id = ?`, [id]);
      await logAudit(req, {
        action: ACTIONS.UPDATE,
        target_type: targetType,
        target_name: row?.name || `Unknown ${label}`,
        description: `Reactivated ${label} ${row?.name || ''}`.trim(),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: `Failed to reactivate ${label}.` });
    }
  });
}

// Returns ALL catalog rows (active + archived) with their status. Archived
// entries must be included because this feeds the Users-table name resolution —
// a student still in an archived section must keep showing its name. Frontend
// selection dropdowns filter to active themselves. Import/transition use the
// separate active-only fetchActiveCatalog, so they never offer archived entries.
const getCatalogSettings = async () => {
  const [courses] = await db.query(
    "SELECT id, code, name, status FROM courses ORDER BY (status='active') DESC, code"
  );
  const [sections] = await db.query(
    "SELECT id, course_id, name, year_level, status FROM sections ORDER BY (status='active') DESC, course_id, name"
  );
  const [school_years] = await db.query(
    "SELECT id, name, status FROM school_years ORDER BY (status='active') DESC, name"
  );
  const [semesters] = await db.query(
    "SELECT id, name, status FROM semesters ORDER BY (status='active') DESC, name"
  );
  return { courses, sections, school_years, semesters };
};

// GET /api/admin/settings
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT `key`, `value` FROM settings'
    );
    const result = {};
    rows.forEach((r) => { result[r.key] = r.value; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch settings.' });
  }
});

// GET /api/admin/settings/catalog
router.get('/catalog', async (req, res) => {
  try {
    const catalog = await getCatalogSettings();
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch course and section catalog.' });
  }
});

// POST /api/admin/settings/catalog/courses
router.post('/catalog/courses', async (req, res) => {
  try {
    const code = req.body.code?.trim();
    const name = req.body.name?.trim() || code;
    if (!code) return res.status(400).json({ message: 'Course code is required.' });
    const [result] = await db.query(
      'INSERT INTO courses (code, name, status) VALUES (?, ?, ?)',
      [code, name, 'active']
    );
    const course = { id: result.insertId, code, name, status: 'active' };
    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: 'course',
      target_name: code,
      description: `Added course ${code} (${name})`,
    });
    res.status(201).json({ course });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create course.' });
  }
});

// PUT /api/admin/settings/catalog/courses/:id
router.put('/catalog/courses/:id', async (req, res) => {
  try {
    const code = req.body.code?.trim();
    const name = req.body.name?.trim() || code;
    if (!code) return res.status(400).json({ message: 'Course code is required.' });
    await db.query(
      'UPDATE courses SET code = ?, name = ? WHERE id = ?',
      [code, name, Number(req.params.id)]
    );
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'course',
      target_name: code,
      description: `Updated course to ${code} (${name})`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update course.' });
  }
});

// DELETE /api/admin/settings/catalog/courses/:id — always archives (cascades to sections).
router.delete('/catalog/courses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[course]] = await db.query('SELECT code, name FROM courses WHERE id = ?', [id]);
    const label = course?.code || course?.name || 'Unknown course';

    await db.query("UPDATE courses SET status = 'inactive' WHERE id = ?", [id]);
    await db.query("UPDATE sections SET status = 'inactive' WHERE course_id = ?", [id]);
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'course',
      target_name: label,
      description: `Archived course ${label} and its sections`,
    });
    res.json({ ok: true, archived: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete course.' });
  }
});

// DELETE /api/admin/settings/catalog/courses/:id/permanent — hard delete when unused.
router.delete('/catalog/courses/:id/permanent', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[course]] = await db.query('SELECT code, name FROM courses WHERE id = ?', [id]);
    const label = course?.code || course?.name || 'Unknown course';

    // A course counts references from itself OR any of its sections.
    const courseRefs = await countCatalogRefs('course_id', 'course_id', id);
    const [[secRef]] = await db.query(
      `SELECT (SELECT COUNT(*) FROM users u JOIN sections s ON s.id = u.section_id WHERE s.course_id = ?)
            + (SELECT COUNT(*) FROM enrollment_history eh JOIN sections s ON s.id = eh.section_id WHERE s.course_id = ?) AS c`,
      [id, id]
    );
    const refs = courseRefs + secRef.c;
    if (refs > 0) {
      return res.status(400).json({ message: `Can't permanently delete this course — ${refs} student(s)/record(s) still reference it or its sections. It stays archived.` });
    }

    await db.query('DELETE FROM sections WHERE course_id = ?', [id]);
    await db.query('DELETE FROM courses WHERE id = ?', [id]);
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'course',
      target_name: label,
      description: `Permanently deleted course ${label} and its sections`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to permanently delete course.' });
  }
});

// PATCH /api/admin/settings/catalog/courses/:id/reactivate
router.patch('/catalog/courses/:id/reactivate', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[course]] = await db.query('SELECT code, name FROM courses WHERE id = ?', [id]);
    await db.query("UPDATE courses SET status = 'active' WHERE id = ?", [id]);
    await db.query("UPDATE sections SET status = 'active' WHERE course_id = ?", [id]);
    const label = course?.code || course?.name || 'Unknown course';
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'course',
      target_name: label,
      description: `Reactivated course ${label} and its sections`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reactivate course.' });
  }
});

// POST /api/admin/settings/catalog/sections
router.post('/catalog/sections', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const course_id = Number(req.body.course_id);
    if (!name) return res.status(400).json({ message: 'Section name is required.' });
    if (!course_id) return res.status(400).json({ message: 'Course is required.' });
    const [result] = await db.query(
      'INSERT INTO sections (course_id, name, status) VALUES (?, ?, ?)',
      [course_id, name, 'active']
    );
    const section = { id: result.insertId, course_id, name, status: 'active' };
    const [[course]] = await db.query('SELECT code, name AS course_name FROM courses WHERE id = ?', [course_id]);
    const courseLabel = course?.code || course?.course_name || 'Unknown course';
    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: 'section',
      target_name: name,
      description: `Added section ${name} under course ${courseLabel}`,
    });
    res.status(201).json({ section });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create section.' });
  }
});

// PUT /api/admin/settings/catalog/sections/:id
router.put('/catalog/sections/:id', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const course_id = Number(req.body.course_id);
    if (!name) return res.status(400).json({ message: 'Section name is required.' });
    if (!course_id) return res.status(400).json({ message: 'Course is required.' });
    await db.query(
      'UPDATE sections SET course_id = ?, name = ? WHERE id = ?',
      [course_id, name, Number(req.params.id)]
    );
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'section',
      target_name: name,
      description: `Updated section ${name}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update section.' });
  }
});

// DELETE /api/admin/settings/catalog/sections/:id — always archives.
router.delete('/catalog/sections/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[section]] = await db.query('SELECT name FROM sections WHERE id = ?', [id]);
    const label = section?.name || 'Unknown section';

    await db.query("UPDATE sections SET status = 'inactive' WHERE id = ?", [id]);
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'section',
      target_name: label,
      description: `Archived section ${label}`,
    });
    res.json({ ok: true, archived: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete section.' });
  }
});

// DELETE /api/admin/settings/catalog/sections/:id/permanent — hard delete when unused.
router.delete('/catalog/sections/:id/permanent', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[section]] = await db.query('SELECT name FROM sections WHERE id = ?', [id]);
    const label = section?.name || 'Unknown section';

    const refs = await countCatalogRefs('section_id', 'section_id', id);
    if (refs > 0) {
      return res.status(400).json({ message: `Can't permanently delete this section — ${refs} student(s)/record(s) still reference it. It stays archived.` });
    }

    await db.query('DELETE FROM sections WHERE id = ?', [id]);
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'section',
      target_name: label,
      description: `Permanently deleted section ${label}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to permanently delete section.' });
  }
});

// PATCH /api/admin/settings/catalog/sections/:id/reactivate
router.patch('/catalog/sections/:id/reactivate', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[section]] = await db.query('SELECT name FROM sections WHERE id = ?', [id]);
    await db.query("UPDATE sections SET status = 'active' WHERE id = ?", [id]);
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'section',
      target_name: section?.name || 'Unknown section',
      description: `Reactivated section ${section?.name || ''}`.trim(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reactivate section.' });
  }
});

registerNamedCatalogRoutes({
  basePath: '/catalog/school-years',
  table: 'school_years',
  targetType: 'school_year',
  label: 'school year',
  usersRefColumn: 'school_year_id',
  currentSettingKey: 'current_school_year_id',
});

registerNamedCatalogRoutes({
  basePath: '/catalog/semesters',
  table: 'semesters',
  targetType: 'semester',
  label: 'semester',
  usersRefColumn: 'semester_id',
  currentSettingKey: 'current_semester_id',
});

// PUT /api/admin/settings
router.put('/', async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    if (entries.length === 0)
      return res.status(400).json({ message: 'No settings provided.' });
    for (const [key, value] of entries) {
      await db.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, value]
      );
    }
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'settings',
      target_name: 'Network Settings',
      description: `Updated settings: ${entries.map(([k]) => k).join(', ')}`,
      metadata: Object.fromEntries(entries),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save settings.' });
  }
});

// GET /api/admin/settings/account — the logged-in admin's own name and username
router.get('/account', async (req, res) => {
  try {
    const [[admin]] = await db.query('SELECT full_name, student_number FROM users WHERE id = ?', [req.user.id]);
    if (!admin) return res.status(404).json({ message: 'Account not found.' });
    res.json({ full_name: admin.full_name, student_number: admin.student_number });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch account.' });
  }
});

// PUT /api/admin/settings/account — the logged-in admin updates their own name, username, and/or password.
// Always requires the current password, even when only the name/username is changing.
router.put('/account', async (req, res) => {
  try {
    const full_name = req.body.full_name?.trim();
    const student_number = req.body.student_number?.trim();
    const { current_password, new_password } = req.body;
    if (!full_name) return res.status(400).json({ message: 'Name is required.' });
    if (!student_number) return res.status(400).json({ message: 'Username is required.' });
    if (!current_password) return res.status(400).json({ message: 'Current password is required.' });

    const [[admin]] = await db.query('SELECT full_name, student_number FROM users WHERE id = ?', [req.user.id]);
    if (!(await verifyOwnPassword(req, current_password))) return res.status(403).json({ message: 'Current password is incorrect.' });

    const usernameChanged = student_number !== admin.student_number;
    const nameChanged = full_name !== admin.full_name;
    if (usernameChanged) {
      const [[existing]] = await db.query('SELECT id FROM users WHERE student_number = ? AND id != ?', [student_number, req.user.id]);
      if (existing) return res.status(409).json({ message: 'That username is already taken.' });
    }

    const fields = ['full_name = ?', 'student_number = ?'];
    const params = [full_name, student_number];
    if (new_password) {
      const passwordHash = await bcrypt.hash(new_password, 10);
      fields.push('password_hash = ?');
      params.push(passwordHash);
    }
    params.push(req.user.id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

    const changed = [nameChanged && 'name', usernameChanged && 'username', new_password && 'password'].filter(Boolean);
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'admin_account',
      target_name: full_name,
      description: changed.length ? `Updated own account (${changed.join(', ')})` : 'Updated own account',
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That username is already taken.' });
    res.status(500).json({ message: 'Failed to update account.' });
  }
});

module.exports = router;
