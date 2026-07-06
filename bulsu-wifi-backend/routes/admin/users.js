const router = require('express').Router();
const db = require('../../db');
const bcrypt = require('bcrypt');

// GET /api/admin/users/csv-template (must be before /:id routes)
router.get('/csv-template', (req, res) => {
  try {
    const headers = [
      'student_number',
      'full_name',
      'birth_date',
      'course_section',
      'school_year',
      'semester',
      'enrollment_status',
      'role',
      'status',
    ];
    const exampleRows = [
      ['2024001', 'Dela Cruz, Juan Miguel', '2006-08-15', 'BS-CS 1A', '2025-2026', '1st', 'enrolled', 'student', 'active'],
      ['2024002', 'Santos, Maria Clara', '2005-11-12', 'BS-CS 1B', '2025-2026', '1st', 'enrolled', 'student', 'active'],
      ['admin01', 'Admin, System', '1980-01-01', '', '', '', '', 'admin', 'active'],
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\r\n') + '\r\n';
    
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="users_template.csv"'
    });
    res.send(Buffer.from(csvContent, 'utf-8'));
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate CSV template.' });
  }
});

// GET /api/admin/users
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', enrollment_status = '' } = req.query;
    const offset = (page - 1) * limit;
    const params = [`%${search}%`, `%${search}%`];
    let where = 'WHERE (u.student_number LIKE ? OR u.full_name LIKE ?)';
    if (status) { where += ' AND u.status = ?'; params.push(status); }
    if (enrollment_status) { where += ' AND u.enrollment_status = ?'; params.push(enrollment_status); }
    const [users] = await db.query(
      `SELECT u.id, u.student_number, u.full_name, u.course_section, u.enrollment_status, u.status
       FROM users u ${where} ORDER BY u.full_name LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// POST /api/admin/users
router.post('/', async (req, res) => {
  try {
    const { student_number, full_name, course_section, enrollment_status, password } = req.body;
    if (!student_number || !full_name || !password)
      return res.status(400).json({ message: 'student_number, full_name, and password are required.' });
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (student_number, full_name, course_section, enrollment_status, password_hash, role, status) VALUES (?,?,?,?,?,"student","active")',
      [student_number, full_name, course_section, enrollment_status, hashed]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Student number already exists.' });
    res.status(500).json({ message: 'Failed to create user.' });
  }
});

// PUT /api/admin/users/:id
router.put('/:id', async (req, res) => {
  try {
    const { full_name, course_section, enrollment_status } = req.body;
    await db.query(
      'UPDATE users SET full_name=?, course_section=?, enrollment_status=? WHERE id=?',
      [full_name, course_section, enrollment_status, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user.' });
  }
});

// PATCH /api/admin/users/:id/block
router.patch('/:id/block', async (req, res) => {
  try {
    await db.query('UPDATE users SET status="blocked" WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to block user.' });
  }
});

// PATCH /api/admin/users/:id/unblock
router.patch('/:id/unblock', async (req, res) => {
  try {
    await db.query('UPDATE users SET status="active" WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unblock user.' });
  }
});

// POST /api/admin/users/:id/disconnect
router.post('/:id/disconnect', async (req, res) => {
  try {
    const [[session]] = await db.query(
      'SELECT id FROM sessions WHERE user_id=? AND status="active" LIMIT 1',
      [req.params.id]
    );
    if (session) {
      await db.query(
        'UPDATE sessions SET status="force-disconnected", logout_time=NOW(), logout_reason="force_disconnect" WHERE id=?',
        [session.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to disconnect user.' });
  }
});

// POST /api/admin/users/csv-import
router.post('/csv-import', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ message: 'rows array is required.' });
    let success = 0, failed = 0;

    const derivePassword = (row) => {
      const birthDate = row.birth_date?.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        const [year, month, day] = birthDate.split('-');
        const lastName = row.full_name?.split(',')[0]?.trim() || row.student_number;
        return `${lastName}${year}${month}${day}`;
      }
      return row.student_number || 'password123';
    };

    for (const row of rows) {
      const hasRequiredFields = row.student_number?.trim() && row.full_name?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(row.birth_date?.trim());
      if (!hasRequiredFields) {
        failed++;
        continue;
      }

      try {
        const passwordHash = await bcrypt.hash(derivePassword(row), 10);
        const role = row.role?.trim() || 'student';
        const status = row.status?.trim() || 'active';

        await db.query(
          'INSERT INTO users (student_number, full_name, birth_date, course_section, school_year, semester, enrollment_status, role, status, password_hash) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), birth_date=VALUES(birth_date), course_section=VALUES(course_section), school_year=VALUES(school_year), semester=VALUES(semester), enrollment_status=VALUES(enrollment_status), role=VALUES(role), status=VALUES(status)',
          [
            row.student_number.trim(),
            row.full_name.trim(),
            row.birth_date.trim(),
            row.course_section?.trim() || null,
            row.school_year?.trim() || null,
            row.semester?.trim() || null,
            row.enrollment_status?.trim() || null,
            role,
            status,
            passwordHash,
          ]
        );
        success++;
      } catch {
        failed++;
      }
    }
    const [result] = await db.query(
      'INSERT INTO csv_imports (imported_by, total_rows, success_rows, failed_rows, status, imported_at) VALUES (?,?,?,?,?,NOW())',
      [req.user?.id || null, rows.length, success, failed, failed === 0 ? 'success' : 'partial']
    );
    res.json({ success, failed, import_id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'CSV import failed.' });
  }
});

module.exports = router;
