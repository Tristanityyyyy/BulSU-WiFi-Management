const express = require("express");
const router = express.Router();
const db = require("../db");

// POST /api/feedback
// Public — submitted from the portal login page, so no auth required
router.post("/", async (req, res) => {
  try {
    const { stars, comment, studentNumber } = req.body;

    const rating = Number(stars);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ message: "stars must be an integer from 1 to 5." });

    const text = typeof comment === "string" ? comment.trim().slice(0, 500) : "";
    const student = typeof studentNumber === "string" ? studentNumber.trim().slice(0, 20) : "";

    let userId = null;
    if (student) {
      const [[user]] = await db.query(
        "SELECT id FROM users WHERE student_number = ? LIMIT 1",
        [student]
      );
      if (user) userId = user.id;
    }

    await db.query(
      "INSERT INTO feedback (user_id, student_number, rating, comment) VALUES (?,?,?,?)",
      [userId, student || null, rating, text || null]
    );

    res.status(201).json({ message: "Feedback submitted." });
  } catch (err) {
    res.status(500).json({ message: "Failed to submit feedback." });
  }
});

module.exports = router;
