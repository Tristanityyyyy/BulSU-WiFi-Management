const router = require('express').Router();
const db = require('../../db');
const bcrypt = require('bcrypt');
const { logAudit, ACTIONS } = require('../../utils/auditLog');
const { verifyOwnPassword } = require('../../utils/verifyOwnPassword');

const getCatalogSettings = async () => {
  const [courses] = await db.query(
    "SELECT id, code, name, status FROM courses WHERE status = 'active' ORDER BY code"
  );
  const [sections] = await db.query(
    "SELECT id, course_id, name, year_level, status FROM sections WHERE status = 'active' ORDER BY course_id, name"
  );
  const [school_years] = await db.query(
    "SELECT id, name, status FROM school_years WHERE status = 'active' ORDER BY name"
  );
  const [semesters] = await db.query(
    "SELECT id, name, status FROM semesters WHERE status = 'active' ORDER BY name"
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

// DELETE /api/admin/settings/catalog/courses/:id
router.delete('/catalog/courses/:id', async (req, res) => {
  try {
    const [[course]] = await db.query('SELECT code, name FROM courses WHERE id = ?', [Number(req.params.id)]);
    await db.query('DELETE FROM sections WHERE course_id = ?', [Number(req.params.id)]);
    await db.query('DELETE FROM courses WHERE id = ?', [Number(req.params.id)]);
    const label = course?.code || course?.name || 'Unknown course';
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'course',
      target_name: label,
      description: `Deleted course ${label} and its sections`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete course.' });
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

// DELETE /api/admin/settings/catalog/sections/:id
router.delete('/catalog/sections/:id', async (req, res) => {
  try {
    const [[section]] = await db.query('SELECT name FROM sections WHERE id = ?', [Number(req.params.id)]);
    await db.query('DELETE FROM sections WHERE id = ?', [Number(req.params.id)]);
    const label = section?.name || 'Unknown section';
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'section',
      target_name: label,
      description: `Deleted section ${label}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete section.' });
  }
});

// POST /api/admin/settings/catalog/school-years
router.post('/catalog/school-years', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ message: 'School year name is required.' });
    const [result] = await db.query(
      'INSERT INTO school_years (name, status) VALUES (?, ?)',
      [name, 'active']
    );
    const school_year = { id: result.insertId, name, status: 'active' };
    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: 'school_year',
      target_name: name,
      description: `Added school year ${name}`,
    });
    res.status(201).json({ school_year });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That school year already exists.' });
    res.status(500).json({ message: 'Failed to create school year.' });
  }
});

// PUT /api/admin/settings/catalog/school-years/:id
router.put('/catalog/school-years/:id', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ message: 'School year name is required.' });
    await db.query(
      'UPDATE school_years SET name = ? WHERE id = ?',
      [name, Number(req.params.id)]
    );
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'school_year',
      target_name: name,
      description: `Updated school year to ${name}`,
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That school year already exists.' });
    res.status(500).json({ message: 'Failed to update school year.' });
  }
});

// DELETE /api/admin/settings/catalog/school-years/:id
router.delete('/catalog/school-years/:id', async (req, res) => {
  try {
    const [[school_year]] = await db.query('SELECT name FROM school_years WHERE id = ?', [Number(req.params.id)]);
    await db.query('DELETE FROM school_years WHERE id = ?', [Number(req.params.id)]);
    const label = school_year?.name || 'Unknown school year';
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'school_year',
      target_name: label,
      description: `Deleted school year ${label}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete school year.' });
  }
});

// POST /api/admin/settings/catalog/semesters
router.post('/catalog/semesters', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ message: 'Semester name is required.' });
    const [result] = await db.query(
      'INSERT INTO semesters (name, status) VALUES (?, ?)',
      [name, 'active']
    );
    const semester = { id: result.insertId, name, status: 'active' };
    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: 'semester',
      target_name: name,
      description: `Added semester ${name}`,
    });
    res.status(201).json({ semester });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That semester already exists.' });
    res.status(500).json({ message: 'Failed to create semester.' });
  }
});

// PUT /api/admin/settings/catalog/semesters/:id
router.put('/catalog/semesters/:id', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ message: 'Semester name is required.' });
    await db.query(
      'UPDATE semesters SET name = ? WHERE id = ?',
      [name, Number(req.params.id)]
    );
    await logAudit(req, {
      action: ACTIONS.UPDATE,
      target_type: 'semester',
      target_name: name,
      description: `Updated semester to ${name}`,
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That semester already exists.' });
    res.status(500).json({ message: 'Failed to update semester.' });
  }
});

// DELETE /api/admin/settings/catalog/semesters/:id
router.delete('/catalog/semesters/:id', async (req, res) => {
  try {
    const [[semester]] = await db.query('SELECT name FROM semesters WHERE id = ?', [Number(req.params.id)]);
    await db.query('DELETE FROM semesters WHERE id = ?', [Number(req.params.id)]);
    const label = semester?.name || 'Unknown semester';
    await logAudit(req, {
      action: ACTIONS.DELETE,
      target_type: 'semester',
      target_name: label,
      description: `Deleted semester ${label}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete semester.' });
  }
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
