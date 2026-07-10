const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

// POST /api/session/disconnect — self-service logout. Ends only the caller's own
// session (identified by the sessionId embedded in their JWT at login), not every
// active session on the account — a role allowed multiple devices shouldn't have
// disconnecting on one device silently kill the others.
router.post("/disconnect", verifyToken, async (req, res) => {
  try {
    if (req.user.sessionId) {
      await db.query(
        "UPDATE sessions SET status='ended', logout_time=NOW(), logout_reason='user_logout' WHERE id=? AND status='active'",
        [req.user.sessionId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to disconnect." });
  }
});

module.exports = router;
