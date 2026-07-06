const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [[user]] = await db.query(
      "SELECT * FROM users WHERE student_number = ? LIMIT 1",
      [username]
    );
    if (!user) return res.status(401).json({ message: "Invalid username or password." });
    if (user.status === "blocked") return res.status(403).json({ message: "Account is blocked." });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid username or password." });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
