const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../db");

// POST /api/feedback
// Public — submitted post-disconnect/expiry by logged-in users (with a still-valid
// JWT) or by guests (no account, identified only by the name they gave to connect).
// Auth is optional rather than enforced by middleware so guests can still post here.
router.post("/", async (req, res) => {
  try {
    const { stars, comment, guestName } = req.body;

    const rating = Number(stars);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ message: "stars must be an integer from 1 to 5." });

    const text = typeof comment === "string" ? comment.trim().slice(0, 500) : "";

    let userId = null;
    let studentNumber = null;
    let role = null;
    let guest = null;

    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        const [[user]] = await db.query(
          "SELECT id, student_number, role FROM users WHERE id = ? LIMIT 1",
          [payload.id]
        );
        if (user) {
          userId = user.id;
          studentNumber = user.student_number;
          role = user.role;
        }
      } catch {
        // invalid/expired token — fall through and treat as anonymous
      }
    }

    if (!userId) {
      guest = typeof guestName === "string" ? guestName.trim().slice(0, 150) : "";
      role = "guest";
    }

    await db.query(
      "INSERT INTO feedback (user_id, student_number, role, guest_name, rating, comment) VALUES (?,?,?,?,?,?)",
      [userId, studentNumber, role, guest || null, rating, text || null]
    );

    res.status(201).json({ message: "Feedback submitted." });
  } catch (err) {
    res.status(500).json({ message: "Failed to submit feedback." });
  }
});

module.exports = router;
