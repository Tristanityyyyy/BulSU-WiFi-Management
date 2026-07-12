const router = require('express').Router();
const db = require('../../db');

// GET /api/admin/overview/stats
router.get('/stats', async (req, res) => {
  try {
    const [[{ enrolledStudents }]] = await db.query('SELECT COUNT(*) AS enrolledStudents FROM users WHERE role = "student" AND enrollment_status = "enrolled"');
    const [[{ facultyCount }]] = await db.query('SELECT COUNT(*) AS facultyCount FROM users WHERE role = "faculty"');
    const [[{ activeSessions }]] = await db.query(
      `SELECT COUNT(*) AS activeSessions FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.status = 'active' AND u.role != 'admin'`
    );
    const [[{ activeGuests }]] = await db.query('SELECT COUNT(*) AS activeGuests FROM guest_sessions WHERE status = "active"');
    res.json({ enrolledStudents, facultyCount, activeSessions, activeGuests });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch stats.' });
  }
});

// GET /api/admin/overview/connected
router.get('/connected', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.id AS session_id, u.full_name, u.student_number, s.mac_address, s.ip_address, s.login_time
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.status = 'active' AND u.role != 'admin'
      ORDER BY s.login_time DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch connected users.' });
  }
});

// GET /api/admin/overview/peak-hours
router.get('/peak-hours', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT HOUR(s.login_time) AS hour, COUNT(*) AS count
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.login_time >= NOW() - INTERVAL 24 HOUR AND u.role != 'admin'
      GROUP BY HOUR(s.login_time)
      ORDER BY hour
    `);
    res.json({
      labels: rows.map((r) => `${String(r.hour).padStart(2, '0')}:00`),
      data: rows.map((r) => r.count),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch peak hours.' });
  }
});

module.exports = router;
