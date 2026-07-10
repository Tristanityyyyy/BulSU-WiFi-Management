const router = require('express').Router();
const db = require('../../db');
const { logAudit, ACTIONS } = require('../../utils/auditLog');

// GET /api/admin/notifications
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type = '', is_read = '' } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';
    if (type)     { where += ' AND type = ?'; params.push(type); }
    if (is_read !== '') { where += ' AND is_read = ?'; params.push(Number(is_read)); }
    const [notifications] = await db.query(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM notifications ${where}`, params
    );
    res.json({ notifications, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

// POST /api/admin/notifications/send
router.post('/send', async (req, res) => {
  try {
    const { target, user_id, course_id, section_id, message } = req.body;
    if (!target || !message)
      return res.status(400).json({ message: 'target and message are required.' });
    let userIds = [];
    if (target === 'user') {
      if (!user_id) return res.status(400).json({ message: 'user_id is required for target "user".' });
      userIds = [user_id];
    } else if (target === 'section') {
      const normalizedCourseId = Number(course_id);
      const normalizedSectionId = Number(section_id);
      if (!normalizedCourseId || !normalizedSectionId) {
        return res.status(400).json({ message: 'course and section are required for target "section".' });
      }
      const [rows] = await db.query('SELECT id FROM users WHERE course_id = ? AND section_id = ?', [normalizedCourseId, normalizedSectionId]);
      userIds = rows.map((r) => r.id);
    } else {
      const [rows] = await db.query('SELECT id FROM users WHERE role = "student"');
      userIds = rows.map((r) => r.id);
    }
    const values = userIds.map((id) => [id, 'general', message, 0, new Date()]);
    if (values.length) {
      await db.query('INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES ?', [values]);

      let targetName = 'All Students';
      if (target === 'user') {
        const [[u]] = await db.query('SELECT full_name FROM users WHERE id = ?', [user_id]);
        targetName = u?.full_name || 'Unknown user';
      } else if (target === 'section') {
        const [[s]] = await db.query(
          `SELECT sec.name AS section_name, c.code AS course_code
           FROM sections sec LEFT JOIN courses c ON c.id = sec.course_id WHERE sec.id = ?`,
          [section_id]
        );
        targetName = s ? `${s.course_code || ''} ${s.section_name || ''}`.trim() : 'Unknown section';
      }

      await logAudit(req, {
        action: ACTIONS.CREATED,
        target_type: target,
        target_name: targetName,
        description: `Sent notification to ${targetName} (${values.length} recipient(s))`,
        metadata: { target, course_id, message },
      });
    }
    res.json({ sent: values.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send notifications.' });
  }
});

module.exports = router;
