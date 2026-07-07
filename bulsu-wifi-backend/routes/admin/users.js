const express = require('express');
const router = express.Router();
const db = require('../../db');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');

const VALID_IMPORT_ROLES = ['student', 'faculty', 'staff'];
const BRAND_PINK = 'FFDB2777';

const normalizeId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const fetchActiveCatalog = async () => {
  const [courses] = await db.query("SELECT id, code, name FROM courses WHERE status = 'active' ORDER BY code");
  const [sections] = await db.query("SELECT id, course_id, name FROM sections WHERE status = 'active' ORDER BY course_id, name");
  return { courses, sections };
};

// POST /api/admin/users/parse-xlsx (must be before /:id routes)
router.post('/parse-xlsx', express.raw({ type: 'application/octet-stream', limit: '5mb' }), async (req, res) => {
  try {
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0)
      return res.status(400).json({ message: 'No file data received.' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ message: 'The uploaded file has no worksheets.' });

    let headerRowNumber = null;
    sheet.eachRow((row, rowNumber) => {
      if (headerRowNumber) return;
      const firstCell = String(row.getCell(1).value ?? '').trim().toLowerCase();
      if (firstCell === 'student_number') headerRowNumber = rowNumber;
    });
    if (!headerRowNumber) {
      return res.status(400).json({ message: 'Could not find a header row starting with "student_number". Please use the downloaded template.' });
    }

    const header = [];
    sheet.getRow(headerRowNumber).eachCell({ includeEmpty: true }, (cell) => {
      header.push(String(cell.value ?? '').trim().toLowerCase());
    });

    const rows = [];
    for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const values = [];
      let hasContent = false;
      for (let c = 1; c <= header.length; c += 1) {
        let value = row.getCell(c).value;
        if (value && typeof value === 'object' && value.result !== undefined) value = value.result;
        if (value instanceof Date) value = value.toISOString().slice(0, 10);
        const str = value === null || value === undefined ? '' : String(value).trim();
        if (str) hasContent = true;
        values.push(str);
      }
      if (hasContent) rows.push(values);
    }

    res.json({ header, rows });
  } catch (err) {
    res.status(400).json({ message: 'Failed to read the uploaded Excel file. Make sure it is a valid .xlsx file.' });
  }
});

// GET /api/admin/users/csv-template (must be before /:id routes)
router.get('/csv-template', async (req, res) => {
  try {
    const { courses, sections } = await fetchActiveCatalog();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BulSU Wi-Fi Admin';
    workbook.created = new Date();

    const headers = ['student_number', 'full_name', 'birth_date', 'course_code', 'section_name', 'school_year', 'semester', 'enrollment_status'];
    const colWidths = [16, 28, 14, 14, 14, 14, 10, 18];

    const sheet = workbook.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 3 }] });
    headers.forEach((_, i) => { sheet.getColumn(i + 1).width = colWidths[i]; });

    sheet.mergeCells('A1:H1');
    const title = sheet.getCell('A1');
    title.value = 'BulSU Wi-Fi — Student Roster Template';
    title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PINK } };
    title.alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 26;

    sheet.mergeCells('A2:H2');
    const subtitle = sheet.getCell('A2');
    subtitle.value = 'Fill one row per student. Course and Section must exactly match the "Course & Section Reference" sheet. Leave Course/Section blank when importing Faculty or Staff.';
    subtitle.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
    subtitle.alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(2).height = 28;

    const headerRow = sheet.getRow(3);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PINK } };
      cell.alignment = { vertical: 'middle' };
    });
    headerRow.height = 20;

    const firstCourse = courses.find((c) => sections.some((s) => s.course_id === c.id)) || courses[0];
    const courseSections = sections.filter((s) => s.course_id === firstCourse?.id);
    const exampleRows = [
      ['2024001', 'Dela Cruz, Juan Miguel', '2006-08-15', firstCourse?.code || '', courseSections[0]?.name || '', '2025-2026', '1st', 'enrolled'],
      ['2024002', 'Santos, Maria Clara', '2005-11-12', firstCourse?.code || '', courseSections[1]?.name || courseSections[0]?.name || '', '2025-2026', '1st', 'enrolled'],
    ];
    exampleRows.forEach((row) => {
      const r = sheet.addRow(row);
      r.eachCell({ includeEmpty: true }, (cell) => { cell.font = { italic: true, color: { argb: 'FF9CA3AF' } }; });
    });

    // Reference sheet advisers copy exact values from
    const refSheet = workbook.addWorksheet('Course & Section Reference');
    refSheet.getColumn(1).width = 16;
    refSheet.getColumn(2).width = 40;
    refSheet.getColumn(3).width = 16;
    refSheet.getColumn(5).hidden = true;
    const refHeaderRow = refSheet.getRow(1);
    refHeaderRow.values = ['Course Code', 'Course Name', 'Section Name'];
    refHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PINK } };
    });

    let refRowIndex = 2;
    courses.forEach((course, i) => {
      refSheet.getCell(i + 2, 5).value = course.code;
      const rowsForCourse = sections.filter((s) => s.course_id === course.id);
      if (rowsForCourse.length === 0) {
        refSheet.getRow(refRowIndex++).values = [course.code, course.name, ''];
      } else {
        rowsForCourse.forEach((section) => {
          refSheet.getRow(refRowIndex++).values = [course.code, course.name, section.name];
        });
      }
    });

    const courseCodeRange = `'Course & Section Reference'!$E$2:$E$${Math.max(courses.length + 1, 2)}`;
    for (let r = 4; r <= 500; r++) {
      sheet.getCell(`D${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [courseCodeRange],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Unrecognized course',
        error: 'Pick a course code from the Course & Section Reference sheet.',
      };
      sheet.getCell(`H${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"enrolled,not_enrolled"'],
      };
      sheet.getCell(`G${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"1st,2nd,Summer"'],
      };
    }

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="students_template.xlsx"',
    });
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate template.' });
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
      `SELECT u.id, u.student_number, u.full_name, u.course_id, u.section_id, u.enrollment_status, u.role, u.status
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
    const { student_number, full_name, course_id, section_id, enrollment_status, role, password } = req.body;
    if (!student_number || !full_name || !password)
      return res.status(400).json({ message: 'student_number, full_name, and password are required.' });
    const finalRole = role || 'student';
    if (!VALID_IMPORT_ROLES.includes(finalRole))
      return res.status(400).json({ message: 'role must be one of: student, faculty, staff.' });
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (student_number, full_name, course_id, section_id, enrollment_status, password_hash, role, status) VALUES (?,?,?,?,?,?,?,?)',
      [student_number, full_name, finalRole === 'student' ? normalizeId(course_id) : null, finalRole === 'student' ? normalizeId(section_id) : null, enrollment_status, hashed, finalRole, 'active']
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
    const { full_name, course_id, section_id, enrollment_status, role } = req.body;
    // role is omitted entirely when editing the admin account (the form hides it), so only
    // touch the column when a role was actually sent, and never allow setting it outside the three import roles.
    if (role !== undefined && !VALID_IMPORT_ROLES.includes(role))
      return res.status(400).json({ message: 'role must be one of: student, faculty, staff.' });
    const courseSectionAllowed = role === undefined || role === 'student';
    const fields = ['full_name=?', 'course_id=?', 'section_id=?', 'enrollment_status=?'];
    const params = [
      full_name,
      courseSectionAllowed ? normalizeId(course_id) : null,
      courseSectionAllowed ? normalizeId(section_id) : null,
      enrollment_status,
    ];
    if (role !== undefined) {
      fields.push('role=?');
      params.push(role);
    }
    params.push(req.params.id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, params);
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
    const { rows, role } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ message: 'rows array is required.' });
    if (!VALID_IMPORT_ROLES.includes(role))
      return res.status(400).json({ message: 'role must be one of: student, faculty, staff.' });

    // For students, resolve every row's course_code/section_name against the live catalog.
    // If any row references a course or section that isn't registered, reject the whole file.
    let resolvedIds = rows.map(() => ({ course_id: null, section_id: null }));
    if (role === 'student') {
      const { courses, sections } = await fetchActiveCatalog();
      const courseByCode = new Map(courses.map((c) => [(c.code || '').trim().toUpperCase(), c]));
      const sectionsByCourse = new Map();
      sections.forEach((s) => {
        if (!sectionsByCourse.has(s.course_id)) sectionsByCourse.set(s.course_id, new Map());
        sectionsByCourse.get(s.course_id).set((s.name || '').trim().toUpperCase(), s);
      });

      const invalidRows = [];
      resolvedIds = rows.map((row, idx) => {
        const courseCode = row.course_code?.trim() || '';
        const sectionName = row.section_name?.trim() || '';
        if (!courseCode && !sectionName) return { course_id: null, section_id: null };

        if (!courseCode) {
          invalidRows.push({ row: idx + 2, student_number: row.student_number || '', course_code: courseCode, section_name: sectionName, reason: 'A section was given without a course.' });
          return { course_id: null, section_id: null };
        }
        const course = courseByCode.get(courseCode.toUpperCase());
        if (!course) {
          invalidRows.push({ row: idx + 2, student_number: row.student_number || '', course_code: courseCode, section_name: sectionName, reason: `Course "${courseCode}" is not registered.` });
          return { course_id: null, section_id: null };
        }
        if (!sectionName) return { course_id: course.id, section_id: null };

        const section = sectionsByCourse.get(course.id)?.get(sectionName.toUpperCase());
        if (!section) {
          invalidRows.push({ row: idx + 2, student_number: row.student_number || '', course_code: courseCode, section_name: sectionName, reason: `Section "${sectionName}" is not registered under course "${courseCode}".` });
          return { course_id: course.id, section_id: null };
        }
        return { course_id: course.id, section_id: section.id };
      });

      if (invalidRows.length) {
        return res.status(400).json({
          message: `Import rejected: ${invalidRows.length} row(s) reference a course or section that is not registered in the system. No rows were imported.`,
          invalid_rows: invalidRows,
        });
      }
    }

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

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const hasRequiredFields = row.student_number?.trim() && row.full_name?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(row.birth_date?.trim());
      if (!hasRequiredFields) {
        failed++;
        continue;
      }

      try {
        const passwordHash = await bcrypt.hash(derivePassword(row), 10);
        const { course_id, section_id } = resolvedIds[i];

        await db.query(
          'INSERT INTO users (student_number, full_name, birth_date, course_id, section_id, school_year, semester, enrollment_status, role, status, password_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), birth_date=VALUES(birth_date), course_id=VALUES(course_id), section_id=VALUES(section_id), school_year=VALUES(school_year), semester=VALUES(semester), enrollment_status=VALUES(enrollment_status), role=VALUES(role), status=VALUES(status)',
          [
            row.student_number.trim(),
            row.full_name.trim(),
            row.birth_date.trim(),
            course_id,
            section_id,
            row.school_year?.trim() || null,
            row.semester?.trim() || null,
            row.enrollment_status?.trim() || null,
            role,
            'active',
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
