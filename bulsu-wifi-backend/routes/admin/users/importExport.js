const express = require('express');
const router = express.Router();
const db = require('../../../db');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const { logAudit, ACTIONS } = require('../../../utils/auditLog');
const { styleHeaderCell, buildBrandedWorkbook, sendWorkbook } = require('../../../utils/xlsxBrand');
const { getSettings } = require('../../../utils/settings');
const { derivePassword } = require('../../../utils/derivePassword');

const VALID_IMPORT_ROLES = ['student', 'faculty', 'staff'];

const fetchActiveCatalog = async () => {
  const [courses] = await db.query("SELECT id, code, name FROM courses WHERE status = 'active' ORDER BY code");
  const [sections] = await db.query("SELECT id, course_id, name FROM sections WHERE status = 'active' ORDER BY course_id, name");
  const [school_years] = await db.query("SELECT id, name FROM school_years WHERE status = 'active' ORDER BY name");
  const [semesters] = await db.query("SELECT id, name FROM semesters WHERE status = 'active' ORDER BY name");
  return { courses, sections, school_years, semesters };
};

// POST /api/admin/users/parse-xlsx
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
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;
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
    });

    res.json({ header, rows });
  } catch (err) {
    res.status(400).json({ message: 'Failed to read the uploaded Excel file. Make sure it is a valid .xlsx file.' });
  }
});

// POST /api/admin/users/check-existing — used by the import preview to flag rows whose
// student number already belongs to an account in the system.
router.post('/check-existing', async (req, res) => {
  try {
    const { student_numbers } = req.body;
    if (!Array.isArray(student_numbers) || student_numbers.length === 0)
      return res.json({ existing: [] });
    const cleaned = [...new Set(student_numbers.map((s) => (s || '').trim()).filter(Boolean))];
    if (cleaned.length === 0) return res.json({ existing: [] });
    const [rows] = await db.query(
      `SELECT student_number FROM users WHERE student_number IN (${cleaned.map(() => '?').join(',')})`,
      cleaned
    );
    res.json({ existing: rows.map((r) => r.student_number) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to check existing student numbers.' });
  }
});

// Adds the "Course & Section Reference" sheet advisers copy exact values from.
function buildCatalogReferenceSheet(courses, sections) {
  return (workbook) => {
    const refSheet = workbook.addWorksheet('Course & Section Reference');
    refSheet.getColumn(1).width = 16;
    refSheet.getColumn(2).width = 40;
    refSheet.getColumn(3).width = 16;
    refSheet.getColumn(5).hidden = true;
    const refHeaderRow = refSheet.getRow(1);
    refHeaderRow.values = ['Course Code', 'Course Name', 'Section Name'];
    refHeaderRow.eachCell(styleHeaderCell);

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
  };
}

// GET /api/admin/users/csv-template
router.get('/csv-template', async (req, res) => {
  try {
    const role = ['faculty', 'staff'].includes(req.query.role) ? req.query.role : 'student';

    if (role !== 'student') {
      const roleLabel = role === 'faculty' ? 'Faculty' : 'Staff';
      const workbook = await buildBrandedWorkbook({
        title: `BulSU Wi-Fi — ${roleLabel} Roster Template`,
        subtitle: `Fill one row per ${roleLabel.toLowerCase()} member. Course and Section don't apply to ${roleLabel.toLowerCase()} and are left out of this template.`,
        sheetName: roleLabel,
        columns: [
          { header: 'student_number', width: 16 },
          { header: 'full_name', width: 28 },
          { header: 'birth_date', width: 14 },
        ],
        exampleRows: [
          ['2024F001', 'Reyes, Angela Santos', '1988-03-22'],
          ['2024F002', 'Bautista, Mark Anthony', '1990-07-09'],
        ],
      });
      return sendWorkbook(res, workbook, `${role}_template.xlsx`);
    }

    const { courses, sections } = await fetchActiveCatalog();
    const firstCourse = courses.find((c) => sections.some((s) => s.course_id === c.id)) || courses[0];
    const courseSections = sections.filter((s) => s.course_id === firstCourse?.id);

    const workbook = await buildBrandedWorkbook({
      title: 'BulSU Wi-Fi — Student Roster Template',
      subtitle: 'Fill one row per student. Course and Section must exactly match the "Course & Section Reference" sheet — type them in manually. School year and semester are not entered here — every imported student is stamped with whichever period is set as current in Settings.',
      sheetName: 'Students',
      columns: [
        { header: 'student_number', width: 16 },
        { header: 'full_name', width: 28 },
        { header: 'birth_date', width: 14 },
        { header: 'course_code', width: 14 },
        { header: 'section_name', width: 14 },
        { header: 'enrollment_status', width: 18 },
      ],
      exampleRows: [
        ['2024001', 'Dela Cruz, Juan Miguel', '2006-08-15', firstCourse?.code || '', courseSections[0]?.name || '', 'enrolled'],
        ['2024002', 'Santos, Maria Clara', '2005-11-12', firstCourse?.code || '', courseSections[1]?.name || courseSections[0]?.name || '', 'enrolled'],
      ],
      dataValidations: [
        { column: 'F', fromRow: 4, toRow: 500, formulae: ['"enrolled,not_enrolled"'] },
      ],
      extraSheets: [buildCatalogReferenceSheet(courses, sections)],
    });
    sendWorkbook(res, workbook, 'students_template.xlsx');
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate template.' });
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

    // Resolve every row's free-text course/section against the live catalog. If any row
    // references a course or section that isn't registered, reject the whole file.
    const { courses, sections, school_years, semesters } = await fetchActiveCatalog();
    const invalidRows = [];
    const resolvedIds = rows.map(() => ({ course_id: null, section_id: null }));

    // Course/section resolution only applies to students.
    if (role === 'student') {
      const courseByCode = new Map(courses.map((c) => [(c.code || '').trim().toUpperCase(), c]));
      const sectionsByCourse = new Map();
      sections.forEach((s) => {
        if (!sectionsByCourse.has(s.course_id)) sectionsByCourse.set(s.course_id, new Map());
        sectionsByCourse.get(s.course_id).set((s.name || '').trim().toUpperCase(), s);
      });

      rows.forEach((row, idx) => {
        const courseCode = row.course_code?.trim() || '';
        const sectionName = row.section_name?.trim() || '';
        if (!courseCode && !sectionName) return;

        if (!courseCode) {
          invalidRows.push({ row: idx + 2, student_number: row.student_number || '', course_code: courseCode, section_name: sectionName, reason: 'A section was given without a course.' });
          return;
        }
        const course = courseByCode.get(courseCode.toUpperCase());
        if (!course) {
          invalidRows.push({ row: idx + 2, student_number: row.student_number || '', course_code: courseCode, section_name: sectionName, reason: `Course "${courseCode}" is not registered.` });
          return;
        }
        resolvedIds[idx].course_id = course.id;
        if (!sectionName) return;

        const section = sectionsByCourse.get(course.id)?.get(sectionName.toUpperCase());
        if (!section) {
          invalidRows.push({ row: idx + 2, student_number: row.student_number || '', course_code: courseCode, section_name: sectionName, reason: `Section "${sectionName}" is not registered under course "${courseCode}".` });
          return;
        }
        resolvedIds[idx].section_id = section.id;
      });
    }

    if (invalidRows.length) {
      return res.status(400).json({
        message: `Import rejected: ${invalidRows.length} row(s) reference a course or section that is not registered in the system. No rows were imported.`,
        invalid_rows: invalidRows,
      });
    }

    // Students are always stamped with whichever school year/semester the admin has
    // marked as "current" in Settings — there's no per-row school_year/semester column
    // in the template anymore. Refuse to import until a valid current period is set, so
    // students never end up silently unassigned to a term.
    let currentSchoolYearId = null;
    let currentSemesterId = null;
    if (role === 'student') {
      const termSettings = await getSettings(['current_school_year_id', 'current_semester_id']);
      currentSchoolYearId = Number(termSettings.current_school_year_id) || null;
      currentSemesterId = Number(termSettings.current_semester_id) || null;
      const validSchoolYear = currentSchoolYearId && school_years.some((sy) => sy.id === currentSchoolYearId);
      const validSemester = currentSemesterId && semesters.some((s) => s.id === currentSemesterId);
      if (!validSchoolYear || !validSemester) {
        return res.status(400).json({ message: 'Set the current school year and semester in Settings before importing students.' });
      }
    }

    // Duplicate student numbers are never accepted — pre-check the whole batch against
    // existing accounts so re-importing an existing student is rejected, not silently
    // overwritten (the admin should remove/replace those rows in the preview instead).
    const candidateNumbers = [...new Set(rows.map((r) => r.student_number?.trim()).filter(Boolean))];
    let existingNumbers = new Set();
    if (candidateNumbers.length) {
      const [existingRows] = await db.query(
        `SELECT student_number FROM users WHERE student_number IN (${candidateNumbers.map(() => '?').join(',')})`,
        candidateNumbers
      );
      existingNumbers = new Set(existingRows.map((r) => r.student_number));
    }

    let success = 0, failed = 0;
    const duplicateRows = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const hasRequiredFields = row.student_number?.trim() && row.full_name?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(row.birth_date?.trim());
      if (!hasRequiredFields) {
        failed++;
        continue;
      }

      if (existingNumbers.has(row.student_number.trim())) {
        failed++;
        duplicateRows.push({ row: i + 2, student_number: row.student_number.trim(), reason: 'Student number already exists in the system.' });
        continue;
      }

      try {
        const passwordHash = await bcrypt.hash(derivePassword(row), 10);
        const { course_id, section_id } = resolvedIds[i];

        await db.query(
          'INSERT INTO users (student_number, full_name, birth_date, course_id, section_id, school_year_id, semester_id, enrollment_status, role, status, password_hash, must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
          [
            row.student_number.trim(),
            row.full_name.trim(),
            row.birth_date.trim(),
            course_id,
            section_id,
            currentSchoolYearId,
            currentSemesterId,
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
      'INSERT INTO csv_imports (imported_by, filename, total_rows, successful_rows, failed_rows, imported_at, notes) VALUES (?,?,?,?,?,NOW(),?)',
      [req.user?.id || null, `${role}_roster.xlsx`, rows.length, success, failed, duplicateRows.length ? `${duplicateRows.length} duplicate student number(s) skipped` : null]
    );
    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: 'csv_import',
      target_name: `${role[0].toUpperCase()}${role.slice(1)} Import`,
      description: `Imported ${role} roster: ${success} succeeded, ${failed} failed`,
      metadata: { total: rows.length, success, failed, role, duplicates: duplicateRows.length },
    });
    res.json({ success, failed, import_id: result.insertId, duplicate_rows: duplicateRows });
  } catch (err) {
    console.error('POST /admin/users/csv-import failed:', err);
    res.status(500).json({ message: 'CSV import failed.' });
  }
});

module.exports = router;
