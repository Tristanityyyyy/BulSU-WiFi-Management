const express = require('express');
const router = express.Router();
const db = require('../../../db');
const { logAudit, ACTIONS } = require('../../../utils/auditLog');
const { getSettings } = require('../../../utils/settings');
const { endSession } = require('../../../utils/sessions');
const { buildBrandedWorkbook, styleHeaderCell, sendWorkbook } = require('../../../utils/xlsxBrand');

const TRANSITION_TYPES = ['promoted', 'retained', 'dropped', 'loa', 'graduated'];
const RESULT_STATUS = { promoted: 'enrolled', retained: 'enrolled', dropped: 'dropped', loa: 'loa', graduated: 'graduated' };
const LOSES_ACCESS = new Set(['dropped', 'loa', 'graduated']);
const NEEDS_SECTION = new Set(['promoted']); // retained may optionally change section; the rest ignore it

// Whitelist of allowed transitions keyed by the student's CURRENT enrollment_status.
// dropped/graduated are terminal and absent here — any transition from them is
// rejected as needing a human (re-admission), matching the skill's Step 2 rule
// that graduated -> enrolled must never happen automatically.
const ALLOWED = {
  enrolled: new Set(['promoted', 'retained', 'dropped', 'loa', 'graduated']),
  loa: new Set(['promoted', 'retained', 'dropped', 'graduated']),
};

async function fetchCatalog() {
  const [courses] = await db.query("SELECT id, code, name FROM courses WHERE status = 'active' ORDER BY code");
  const [sections] = await db.query("SELECT id, course_id, name FROM sections WHERE status = 'active' ORDER BY course_id, name");
  return { courses, sections };
}

async function resolveCurrentTerm() {
  const term = await getSettings(['current_school_year_id', 'current_semester_id']);
  const schoolYearId = Number(term.current_school_year_id) || null;
  const semesterId = Number(term.current_semester_id) || null;
  let schoolYearName = null;
  let semesterName = null;
  if (schoolYearId) {
    const [[sy]] = await db.query('SELECT name FROM school_years WHERE id=?', [schoolYearId]);
    schoolYearName = sy?.name || null;
  }
  if (semesterId) {
    const [[sem]] = await db.query('SELECT name FROM semesters WHERE id=?', [semesterId]);
    semesterName = sem?.name || null;
  }
  return { schoolYearId, semesterId, schoolYearName, semesterName };
}

// Shared classify + validate pass. Writes nothing — both preview and commit
// call this first; commit only proceeds when invalidRows is empty.
async function classifyBatch(rows) {
  const { schoolYearId, semesterId, schoolYearName, semesterName } = await resolveCurrentTerm();
  if (!schoolYearId || !semesterId) {
    return { fatal: 'Set the current school year and semester in Settings before running a transition.' };
  }
  const termLabel = [schoolYearName, semesterName].filter(Boolean).join(' · ');

  const { courses, sections } = await fetchCatalog();
  const courseByCode = new Map(courses.map((c) => [(c.code || '').trim().toUpperCase(), c]));
  const sectionsByCourse = new Map();
  sections.forEach((s) => {
    if (!sectionsByCourse.has(s.course_id)) sectionsByCourse.set(s.course_id, new Map());
    sectionsByCourse.get(s.course_id).set((s.name || '').trim().toUpperCase(), s);
  });

  // Pull every referenced student in one query.
  const numbers = [...new Set(rows.map((r) => (r.student_number || '').trim()).filter(Boolean))];
  let usersByNumber = new Map();
  let alreadyTransitioned = new Set();
  if (numbers.length) {
    const [found] = await db.query(
      `SELECT id, student_number, full_name, role, enrollment_status, course_id, section_id, school_year_id, semester_id
       FROM users WHERE student_number IN (${numbers.map(() => '?').join(',')}) AND deleted_at IS NULL`,
      numbers
    );
    usersByNumber = new Map(found.map((u) => [u.student_number, u]));

    // Students already recorded for THIS term — re-running the same term's batch
    // is rejected cleanly per-row (the enrollment_history unique constraint is the
    // last-resort backstop against a concurrent double-submit).
    const [history] = await db.query(
      `SELECT student_number FROM enrollment_history
       WHERE school_year_id=? AND semester_id=? AND student_number IN (${numbers.map(() => '?').join(',')})`,
      [schoolYearId, semesterId, ...numbers]
    );
    alreadyTransitioned = new Set(history.map((h) => h.student_number));
  }

  const invalidRows = [];
  const resolved = []; // one entry per valid row
  const summary = { promoted: 0, retained: 0, dropped: 0, loa: 0, graduated: 0 };
  const seen = new Set();

  rows.forEach((row, idx) => {
    const line = idx + 2; // header is row 1
    const studentNumber = (row.student_number || '').trim();
    const transition = (row.transition_type || '').trim().toLowerCase();
    const courseCode = (row.course_code || '').trim();
    const sectionName = (row.section_name || '').trim();
    const reject = (reason) => invalidRows.push({ row: line, student_number: studentNumber, reason });

    if (!studentNumber) return reject('Missing student number.');
    if (seen.has(studentNumber)) return reject('Duplicate student number within this file.');
    seen.add(studentNumber);

    if (!TRANSITION_TYPES.includes(transition))
      return reject(`Invalid transition_type "${row.transition_type || ''}". Must be one of: ${TRANSITION_TYPES.join(', ')}.`);

    const user = usersByNumber.get(studentNumber);
    if (!user) return reject('Student number not found in the system.');
    if (user.role !== 'student') return reject('Transitions apply to students only.');
    // A transition moves a student from a prior term INTO the current one, so a
    // student already stamped with the current term can't be transitioned until
    // the term is advanced — otherwise you'd be "promoting" them into the term
    // they're already in.
    if (user.school_year_id === schoolYearId && user.semester_id === semesterId)
      return reject(`This student is already enrolled in the current term (${termLabel}). Advance to the new term in Settings before transitioning.`);
    if (alreadyTransitioned.has(studentNumber))
      return reject('This student already has a transition recorded for the current term.');

    const current = (user.enrollment_status || 'enrolled').toLowerCase();
    const allowedFrom = ALLOWED[current];
    if (!allowedFrom || !allowedFrom.has(transition))
      return reject(`Transition "${transition}" is not allowed from current status "${current}" — needs manual handling.`);

    // Section resolution: required for promoted, optional for retained, ignored otherwise.
    let courseId = user.course_id;
    let sectionId = user.section_id;
    if (NEEDS_SECTION.has(transition) || (transition === 'retained' && (courseCode || sectionName))) {
      if (!courseCode) return reject(`"${transition}" requires a course_code.`);
      const course = courseByCode.get(courseCode.toUpperCase());
      if (!course) return reject(`Course "${courseCode}" is not registered.`);
      if (!sectionName) return reject(`"${transition}" requires a section_name.`);
      const section = sectionsByCourse.get(course.id)?.get(sectionName.toUpperCase());
      if (!section) return reject(`Section "${sectionName}" is not registered under course "${courseCode}".`);
      courseId = course.id;
      sectionId = section.id;
    }

    summary[transition] += 1;
    resolved.push({
      userId: user.id,
      studentNumber,
      transition,
      newStatus: RESULT_STATUS[transition],
      courseId,
      sectionId,
      losesAccess: LOSES_ACCESS.has(transition),
    });
  });

  return { schoolYearId, semesterId, schoolYearName, semesterName, invalidRows, resolved, summary };
}

// GET /api/admin/users/transition/template
router.get('/transition/template', async (req, res) => {
  try {
    const { courses, sections } = await fetchCatalog();
    const firstCourse = courses.find((c) => sections.some((s) => s.course_id === c.id)) || courses[0];
    const courseSections = sections.filter((s) => s.course_id === firstCourse?.id);

    const buildReference = (workbook) => {
      const refSheet = workbook.addWorksheet('Course & Section Reference');
      refSheet.getColumn(1).width = 16;
      refSheet.getColumn(2).width = 40;
      refSheet.getColumn(3).width = 16;
      const header = refSheet.getRow(1);
      header.values = ['Course Code', 'Course Name', 'Section Name'];
      header.eachCell(styleHeaderCell);
      let idx = 2;
      courses.forEach((course) => {
        const rowsForCourse = sections.filter((s) => s.course_id === course.id);
        if (!rowsForCourse.length) refSheet.getRow(idx++).values = [course.code, course.name, ''];
        else rowsForCourse.forEach((s) => { refSheet.getRow(idx++).values = [course.code, course.name, s.name]; });
      });
    };

    const workbook = await buildBrandedWorkbook({
      title: 'BulSU Wi-Fi — Semester Transition',
      subtitle: 'One row per student from the official registrar list. transition_type must be promoted, retained, dropped, loa, or graduated. Course/Section are only needed for promoted (and retained if changing section). Every student is stamped with the current school year/semester set in Settings.',
      sheetName: 'Transition',
      columns: [
        { header: 'student_number', width: 16 },
        { header: 'transition_type', width: 16 },
        { header: 'course_code', width: 14 },
        { header: 'section_name', width: 14 },
      ],
      exampleRows: [
        ['2024001', 'promoted', firstCourse?.code || '', courseSections[1]?.name || courseSections[0]?.name || ''],
        ['2024002', 'retained', '', ''],
        ['2024003', 'graduated', '', ''],
        ['2024004', 'dropped', '', ''],
        ['2024005', 'loa', '', ''],
      ],
      dataValidations: [
        { column: 'B', fromRow: 4, toRow: 500, formulae: ['"promoted,retained,dropped,loa,graduated"'] },
      ],
      extraSheets: [buildReference],
    });
    sendWorkbook(res, workbook, 'semester_transition_template.xlsx');
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate transition template.' });
  }
});

// POST /api/admin/users/transition/validate — preview only, commits nothing.
router.post('/transition/validate', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ message: 'rows array is required.' });

    const result = await classifyBatch(rows);
    if (result.fatal) return res.status(400).json({ message: result.fatal });

    res.json({
      total: rows.length,
      valid: result.resolved.length,
      summary: result.summary,
      will_disconnect: result.resolved.filter((r) => r.losesAccess).length,
      invalid_rows: result.invalidRows,
      term: { school_year: result.schoolYearName, semester: result.semesterName },
    });
  } catch (err) {
    console.error('POST /transition/validate failed:', err);
    res.status(500).json({ message: 'Failed to validate transition batch.' });
  }
});

// POST /api/admin/users/transition/commit — atomic all-or-nothing commit, then
// force-disconnect every student who lost network access.
router.post('/transition/commit', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ message: 'rows array is required.' });

    const result = await classifyBatch(rows);
    if (result.fatal) return res.status(400).json({ message: result.fatal });

    // If ANYTHING fails validation, commit nothing and hand back the full report.
    if (result.invalidRows.length) {
      return res.status(400).json({
        message: `Transition rejected: ${result.invalidRows.length} row(s) failed validation. No changes were made.`,
        invalid_rows: result.invalidRows,
      });
    }

    const { schoolYearId, semesterId, resolved, summary } = result;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [imp] = await conn.query(
        'INSERT INTO csv_imports (imported_by, filename, total_rows, successful_rows, failed_rows, imported_at, notes) VALUES (?,?,?,?,?,NOW(),?)',
        [req.user.id, 'semester_transition.xlsx', rows.length, resolved.length, 0,
          `promoted:${summary.promoted} retained:${summary.retained} dropped:${summary.dropped} loa:${summary.loa} graduated:${summary.graduated}`]
      );
      const importId = imp.insertId;

      for (const r of resolved) {
        // Never touches password_hash or devices (Step 4). Section only moves for
        // promoted/retained; term is stamped for every transition.
        await conn.query(
          'UPDATE users SET enrollment_status=?, course_id=?, section_id=?, school_year_id=?, semester_id=? WHERE id=?',
          [r.newStatus, r.courseId, r.sectionId, schoolYearId, semesterId, r.userId]
        );
        await conn.query(
          `INSERT INTO enrollment_history
             (user_id, student_number, school_year_id, semester_id, course_id, section_id, enrollment_status, transition_type, import_id)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [r.userId, r.studentNumber, schoolYearId, semesterId, r.courseId, r.sectionId, r.newStatus, r.transition, importId]
        );
      }

      await conn.commit();
      conn.release();

      // Post-commit: actively terminate the live hotspot session of everyone who
      // lost access. endSession also revokes their MikroTik grant. Done after the
      // DB transaction because a RouterOS call can't be part of a SQL transaction
      // and must never hold it open or be rolled back.
      let disconnected = 0;
      const losers = resolved.filter((r) => r.losesAccess).map((r) => r.userId);
      if (losers.length) {
        const [activeSessions] = await db.query(
          `SELECT id FROM sessions WHERE status='active' AND user_id IN (${losers.map(() => '?').join(',')})`,
          losers
        );
        for (const s of activeSessions) {
          await endSession(s.id, { reason: 'enrollment_transition' });
          disconnected += 1;
        }
      }

      await logAudit(req, {
        action: ACTIONS.UPDATE,
        target_type: 'csv_import',
        target_name: 'Semester Transition',
        description: `Semester transition committed: ${resolved.length} student(s) updated, ${disconnected} session(s) force-disconnected`,
        metadata: { ...summary, disconnected, import_id: importId },
      });

      res.json({ success: resolved.length, disconnected, import_id: importId, summary });
    } catch (txErr) {
      await conn.rollback();
      conn.release();
      throw txErr;
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      // Backstop for a concurrent double-submit that slipped past the pre-check.
      return res.status(409).json({ message: 'Some of these students were already transitioned for the current term. No changes were made.' });
    }
    console.error('POST /transition/commit failed:', err);
    res.status(500).json({ message: 'Transition commit failed. No changes were made.' });
  }
});

module.exports = router;
