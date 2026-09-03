const router = require('express').Router();
const db = require('../../db');
const { logAudit, ACTIONS } = require('../../utils/auditLog');

// GET /api/admin/notifications
//
// The recipient is joined in rather than listed as a bare user_id: an admin
// checking that a message reached the right person needs a name, and a raw
// database id is not one. A purged account leaves the FK null, so the row
// survives with no recipient — those read as "deleted account", not as blank.
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type = '', is_read = '' } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';
    if (type)     { where += ' AND n.type = ?'; params.push(type); }
    if (is_read !== '') { where += ' AND n.is_read = ?'; params.push(Number(is_read)); }
    const [notifications] = await db.query(
      `SELECT n.id, n.user_id, n.session_id, n.type, n.message, n.is_read, n.created_at,
              u.full_name AS recipient_name, u.student_number AS recipient_number
         FROM notifications n
         LEFT JOIN users u ON u.id = n.user_id
         ${where} ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM notifications n ${where}`, params
    );
    res.json({ notifications, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

// Work out who a compose request is actually addressed to, and refuse the send
// outright if that turns out to be nobody.
//
// A notification is only worth anything if it reaches a person, so an address
// that cannot resolve to one is an error the admin has to see — not a row
// quietly filed against an id nobody holds, and not a "sent successfully" toast
// for zero recipients.
//
// An account that cannot log in cannot read anything sent to it, so neither
// kind is ever a recipient. Trash is a one-way trip to deletion, and the purge
// sweeper will null the row out; a block is reversible, but while it lasts the
// login is refused outright, so the message would sit unread behind a door the
// account cannot open. Both are worth saying out loud rather than skipping
// silently — each has an admin action that fixes it.
const CAN_RECEIVE = "deleted_at IS NULL AND status <> 'blocked'";

async function resolveRecipients({ target, user_id, course_id, section_id }) {
  if (target === 'user') {
    const id = Number(user_id);
    if (!Number.isInteger(id) || id <= 0)
      return { error: { status: 400, message: 'Choose who this message is for.' } };
    const [[user]] = await db.query(
      'SELECT id, full_name, student_number, status, deleted_at FROM users WHERE id = ?',
      [id]
    );
    if (!user)
      return { error: { status: 404, message: 'That account does not exist, so the message was not sent.' } };
    if (user.deleted_at)
      return { error: { status: 409, message: `${user.full_name} is in the trash and cannot receive messages. Restore the account first.` } };
    if (user.status === 'blocked')
      return { error: { status: 409, message: `${user.full_name} is blocked and cannot log in to read messages. Unblock the account first.` } };
    return { userIds: [user.id], targetName: `${user.full_name} (${user.student_number})` };
  }

  if (target === 'section') {
    const courseId = Number(course_id);
    const sectionId = Number(section_id);
    if (!courseId || !sectionId)
      return { error: { status: 400, message: 'Choose a course and a section.' } };
    const [[section]] = await db.query(
      `SELECT sec.name AS section_name, c.code AS course_code
         FROM sections sec LEFT JOIN courses c ON c.id = sec.course_id
        WHERE sec.id = ? AND sec.course_id = ?`,
      [sectionId, courseId]
    );
    if (!section)
      return { error: { status: 404, message: 'That section does not exist under that course.' } };
    const label = `${section.course_code || ''} ${section.section_name || ''}`.trim() || 'that section';
    const [rows] = await db.query(
      `SELECT id FROM users WHERE course_id = ? AND section_id = ? AND ${CAN_RECEIVE}`,
      [courseId, sectionId]
    );
    if (!rows.length) {
      // An empty section and a section whose every member is blocked or trashed
      // are different problems with different fixes, so they don't share a
      // message.
      const [[{ enrolled }]] = await db.query(
        'SELECT COUNT(*) AS enrolled FROM users WHERE course_id = ? AND section_id = ?',
        [courseId, sectionId]
      );
      return { error: { status: 404, message: enrolled
        ? `Every account in ${label} is blocked or in the trash, so the message was not sent.`
        : `No one is enrolled in ${label}, so the message was not sent.` } };
    }
    return { userIds: rows.map((r) => r.id), targetName: label };
  }

  if (target === 'all') {
    // "Everyone" is everyone who uses the network — faculty and staff included.
    // Restricting this to students meant a campus-wide notice silently skipped
    // every non-student account. Admins are left out: the compose form is
    // theirs, and they have no user-facing inbox to read it in.
    const [rows] = await db.query(
      `SELECT id FROM users WHERE role <> 'admin' AND ${CAN_RECEIVE}`
    );
    if (!rows.length)
      return { error: { status: 404, message: 'There are no accounts able to receive a message.' } };
    return { userIds: rows.map((r) => r.id), targetName: 'Everyone' };
  }

  return { error: { status: 400, message: 'target must be one of: user, section, all.' } };
}

// POST /api/admin/notifications/send
router.post('/send', async (req, res) => {
  try {
    const { target, user_id, course_id, section_id } = req.body;
    const message = String(req.body.message ?? '').trim();
    if (!target || !message)
      return res.status(400).json({ message: 'target and message are required.' });

    const { userIds, targetName, error } = await resolveRecipients({ target, user_id, course_id, section_id });
    if (error) return res.status(error.status).json({ message: error.message });

    await db.query(
      'INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES ?',
      [userIds.map((id) => [id, 'general', message, 0, new Date()])]
    );

    await logAudit(req, {
      action: ACTIONS.CREATED,
      target_type: target,
      target_name: targetName,
      description: `Sent notification to ${targetName} (${userIds.length} recipient(s))`,
      metadata: { target, course_id, section_id, message },
    });

    res.json({ sent: userIds.length, target_name: targetName });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send notifications.' });
  }
});

module.exports = router;
