const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { getSettings } = require("../utils/settings");
const { endSession } = require("../utils/sessions");

const DEFAULT_SESSION_TIMEOUT_MIN = { student: 120, faculty: 240, staff: 240, admin: 240 };

// GET /api/session/status — polled by the dashboard to drive the time-remaining
// countdown, low-data warning, and the data-usage ring.
router.get("/status", verifyToken, async (req, res) => {
  try {
    const [[session]] = await db.query(
      "SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = 'active'",
      [req.user.sessionId, req.user.id]
    );
    if (!session) return res.status(401).json({ message: "Session has ended." });

    const [[user]] = await db.query(
      "SELECT student_number, role FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );
    if (!user) return res.status(401).json({ message: "Account not found." });

    const settings = await getSettings([`session_timeout_${user.role}`, `data_cap_gb_${user.role}`]);
    const configuredRaw = settings[`session_timeout_${user.role}`];
    const configured = Number(configuredRaw);
    const timeoutMinutes = configuredRaw !== undefined && Number.isFinite(configured)
      ? configured
      : DEFAULT_SESSION_TIMEOUT_MIN[user.role] || 120;

    const elapsedSec = Math.floor((Date.now() - new Date(session.login_time).getTime()) / 1000);
    const expiresInSec = Math.max(0, timeoutMinutes * 60 - elapsedSec);

    const [[usage]] = await db.query(
      "SELECT bytes_used FROM data_usage WHERE user_id=? AND usage_date=CURDATE()",
      [req.user.id]
    );
    const capGb = Number(settings[`data_cap_gb_${user.role}`]);
    const dataUsedMB = Math.round((usage?.bytes_used || 0) / (1024 * 1024));
    const dataLimitMB = capGb > 0 ? capGb * 1024 : null; // null = unlimited

    res.json({
      username: user.student_number,
      expiresInSec,
      dataUsedMB,
      dataLimitMB,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load session status." });
  }
});

// POST /api/session/disconnect — self-service logout. Ends only the caller's own
// session (identified by the sessionId embedded in their JWT at login), not every
// active session on the account — a role allowed multiple devices shouldn't have
// disconnecting on one device silently kill the others.
router.post("/disconnect", verifyToken, async (req, res) => {
  try {
    if (req.user.sessionId) {
      await endSession(req.user.sessionId, { reason: "user_logout" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to disconnect." });
  }
});

module.exports = router;
