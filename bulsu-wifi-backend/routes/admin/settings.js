const router = require('express').Router();
const db = require('../../db');

const getCatalogSettings = async () => {
  const [courses] = await db.query(
    "SELECT id, code, name, status FROM courses WHERE status = 'active' ORDER BY code"
  );
  const [sections] = await db.query(
    "SELECT id, course_id, name, year_level, status FROM sections WHERE status = 'active' ORDER BY course_id, name"
  );
  return { courses, sections };
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
    if (!code) return res.status(400).json({ message: 'Course code is required.' });
    const [result] = await db.query(
      'INSERT INTO courses (code, name, status) VALUES (?, ?, ?)',
      [code, code, 'active']
    );
    const course = { id: result.insertId, code, name: code, status: 'active' };
    res.status(201).json({ course });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create course.' });
  }
});

// PUT /api/admin/settings/catalog/courses/:id
router.put('/catalog/courses/:id', async (req, res) => {
  try {
    const code = req.body.code?.trim();
    if (!code) return res.status(400).json({ message: 'Course code is required.' });
    await db.query(
      'UPDATE courses SET code = ?, name = ? WHERE id = ?',
      [code, code, Number(req.params.id)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update course.' });
  }
});

// DELETE /api/admin/settings/catalog/courses/:id
router.delete('/catalog/courses/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM sections WHERE course_id = ?', [Number(req.params.id)]);
    await db.query('DELETE FROM courses WHERE id = ?', [Number(req.params.id)]);
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update section.' });
  }
});

// DELETE /api/admin/settings/catalog/sections/:id
router.delete('/catalog/sections/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM sections WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete section.' });
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save settings.' });
  }
});

module.exports = router;
