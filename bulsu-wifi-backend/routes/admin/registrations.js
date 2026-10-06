const router = require('express').Router();
const db = require('../../db');
const { logAudit, ACTIONS } = require('../../utils/auditLog');
const bcrypt = require('bcrypt');
const { derivePassword } = require('../../utils/derivePassword');
const { sendRegistrationApproval } = require('../../utils/email');

const REQUEST_STATUSES = ['pending', 'approved', 'denied', 'all'];

const REQUEST_FIELDS = `
  r.id, r.student_number, r.full_name, r.email, r.role,
  DATE_FORMAT(r.birth_date, '%Y-%m-%d') AS birth_date,
  r.course_id, r.section_id, r.year_level, r.status,
  r.email_status, r.email_error, u.must_change_password AS can_resend_email,
  DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
  c.code AS course_code, c.name AS course_name, s.name AS section_name,
  DATE_FORMAT(r.email_sent_at, '%Y-%m-%d %H:%i:%s') AS email_sent_at`;

async function deliverApprovalEmail(request, account) {
  let emailStatus = 'sent';
  let emailError = null;
  try {
    const temporaryPassword = derivePassword({
      birth_date: account.birth_date,
      full_name: account.full_name,
      student_number: account.student_number,
    });
    await sendRegistrationApproval({
      email: request.email,
      fullName: account.full_name,
      role: account.role,
      accountId: account.student_number,
      temporaryPassword,
    });
  } catch (err) {
    emailStatus = 'failed';
    emailError = String(err.message || 'Email delivery failed.').slice(0, 500);
    console.error(`Registration approval email failed for request ${request.id}:`, err.message);
  }

  try {
    await db.query(
      `UPDATE registration_requests
          SET email_status = ?, email_error = ?, email_sent_at = ?
        WHERE id = ?`,
      [emailStatus, emailError, emailStatus === 'sent' ? new Date() : null, request.id]
    );
  } catch (err) {
    console.error(`Could not update email status for registration request ${request.id}:`, err.message);
  }
  return { email_sent: emailStatus === 'sent' };
}

router.get('/', async (req, res) => {
  const status = req.query.status || 'pending';
  if (!REQUEST_STATUSES.includes(status))
    return res.status(400).json({ message: 'Invalid registration status.' });
  try {
    const params = [];
    const where = status === 'all' ? '' : 'WHERE r.status = ?';
    if (status !== 'all') params.push(status);
    const [requests] = await db.query(
      `SELECT ${REQUEST_FIELDS}
         FROM registration_requests r
         LEFT JOIN courses c ON c.id = r.course_id
         LEFT JOIN sections s ON s.id = r.section_id
         LEFT JOIN users u ON u.id = r.user_id
         ${where}
        ORDER BY FIELD(r.status, 'pending', 'approved', 'denied'), r.created_at DESC`,
      params
    );
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load registration requests.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ message: 'Invalid registration request.' });
  try {
    const [[request]] = await db.query(
      `SELECT ${REQUEST_FIELDS},
              DATE_FORMAT(r.accepted_terms_at, '%Y-%m-%d %H:%i:%s') AS accepted_terms_at
         FROM registration_requests r
         LEFT JOIN courses c ON c.id = r.course_id
         LEFT JOIN sections s ON s.id = r.section_id
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.id = ? LIMIT 1`,
      [id]
    );
    if (!request) return res.status(404).json({ message: 'Registration request not found.' });
    res.json({ request });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load registration request.' });
  }
});

router.patch('/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ message: 'Invalid registration request.' });

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[request]] = await conn.query(
      'SELECT * FROM registration_requests WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!request) {
      const error = new Error('Registration request not found.');
      error.statusCode = 404;
      throw error;
    }
    if (request.status !== 'pending') {
      const error = new Error('This request has already been reviewed.');
      error.statusCode = 409;
      throw error;
    }
    if (!request.email) {
      const error = new Error('This request has no email address. Update the request before approving it.');
      error.statusCode = 409;
      throw error;
    }
    if (!['student', 'faculty', 'staff'].includes(request.role)) {
      const error = new Error('This request has an invalid account role.');
      error.statusCode = 409;
      throw error;
    }

    const [[existingUser]] = await conn.query(
      'SELECT id FROM users WHERE student_number = ? LIMIT 1',
      [request.student_number]
    );
    if (existingUser) {
      const error = new Error('An account with this student number already exists.');
      error.statusCode = 409;
      throw error;
    }

    if (request.role === 'student') {
      const [[section]] = await conn.query(
        `SELECT s.id FROM sections s JOIN courses c ON c.id = s.course_id
          WHERE s.id = ? AND s.course_id = ? AND s.status = 'active' AND c.status = 'active'
          LIMIT 1`,
        [request.section_id, request.course_id]
      );
      if (!section) {
        const error = new Error('The requested course or section is no longer active.');
        error.statusCode = 409;
        throw error;
      }
    }

    const temporaryPassword = derivePassword({
      birth_date: request.birth_date,
      full_name: request.full_name,
      student_number: request.student_number,
    });
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const isStudent = request.role === 'student';
    const [result] = await conn.query(
      `INSERT INTO users
         (student_number, full_name, birth_date, course_id, section_id, enrollment_status,
          password_hash, role, status, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`,
      [
        request.student_number,
        request.full_name,
        request.birth_date,
        isStudent ? request.course_id : null,
        isStudent ? request.section_id : null,
        isStudent ? 'enrolled' : null,
        passwordHash,
        request.role,
      ]
    );
    await conn.query(
      `UPDATE registration_requests
          SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(),
              user_id = ?, email_status = 'pending', email_error = NULL, email_sent_at = NULL
        WHERE id = ?`,
      [req.user.id, result.insertId, id]
    );
    await conn.commit();
    conn.release();
    conn = null;

    const delivery = await deliverApprovalEmail(request, {
      full_name: request.full_name,
      student_number: request.student_number,
      birth_date: request.birth_date,
      role: request.role,
    });

    await logAudit(req, {
      action: ACTIONS.REGISTRATION_APPROVED,
      target_type: 'registration_request',
      target_name: request.full_name,
      description: `Approved registration for ${request.full_name} (${request.student_number})`,
      metadata: { email_sent: delivery.email_sent },
    });
    res.json({
      ok: true,
      user_id: result.insertId,
      ...delivery,
      message: delivery.email_sent
        ? 'Account approved and credentials emailed.'
        : 'Account approved, but the email could not be sent. Check SMTP settings and retry delivery.',
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch { /* transaction already ended */ }
      conn.release();
    }
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'An account with this student number already exists.' });
    res.status(500).json({ message: 'Failed to approve registration.' });
  }
});

router.patch('/:id/deny', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ message: 'Invalid registration request.' });
  try {
    const [result] = await db.query(
      `UPDATE registration_requests
          SET status = 'denied', reviewed_by = ?, reviewed_at = NOW(),
              email_status = NULL, email_error = NULL, email_sent_at = NULL
        WHERE id = ? AND status = 'pending'`,
      [req.user.id, id]
    );
    if (result.affectedRows === 0) {
      const [[request]] = await db.query('SELECT status FROM registration_requests WHERE id = ?', [id]);
      if (!request) return res.status(404).json({ message: 'Registration request not found.' });
      return res.status(409).json({ message: 'This request has already been reviewed.' });
    }
    await logAudit(req, {
      action: ACTIONS.REGISTRATION_DENIED,
      target_type: 'registration_request',
      target_name: `Request #${id}`,
      description: `Denied registration request #${id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to deny registration.' });
  }
});

router.patch('/:id/resend-email', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ message: 'Invalid registration request.' });
  try {
    const [[request]] = await db.query(
      `SELECT r.id, r.email, r.status, u.student_number, u.full_name,
              u.birth_date, u.role, u.must_change_password
         FROM registration_requests r
         JOIN users u ON u.id = r.user_id
        WHERE r.id = ? LIMIT 1`,
      [id]
    );
    if (!request) return res.status(404).json({ message: 'Approved account not found.' });
    if (request.status !== 'approved')
      return res.status(409).json({ message: 'Only approved registrations can receive account credentials.' });
    if (!request.must_change_password)
      return res.status(409).json({ message: 'The account password has already been changed; the temporary password cannot be resent.' });

    const delivery = await deliverApprovalEmail(request, request);
    res.json({
      ok: true,
      ...delivery,
      message: delivery.email_sent ? 'Credentials emailed.' : 'Email could not be sent. Check SMTP settings and retry.',
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to resend registration email.' });
  }
});

module.exports = router;