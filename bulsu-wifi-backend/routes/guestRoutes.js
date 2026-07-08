const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/guest/token-status?token=...
// Read-only check — does NOT create a session or consume the token
router.get("/token-status", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: "Token is required." });

  const [[guest]] = await db.query(
    "SELECT status, starts_at, expires_at FROM guests WHERE token = ? LIMIT 1",
    [token]
  );

  if (!guest) return res.status(404).json({ message: "Invalid QR code." });

  if (guest.status === "used") return res.json({ status: "used" });
  if (new Date(guest.expires_at) < new Date()) return res.json({ status: "expired" });
  if (new Date(guest.starts_at) > new Date()) return res.json({ status: "not_started", startsAt: guest.starts_at });

  res.json({ status: "active" });
});

// POST /api/guest/verify
// Creates the guest session and marks the token as used
router.post("/verify", async (req, res) => {
  const { qrCode, guestName } = req.body;
  if (!qrCode || !guestName) return res.status(400).json({ message: "qrCode and guestName are required." });

  const [[guest]] = await db.query(
    "SELECT * FROM guests WHERE token = ? LIMIT 1",
    [qrCode]
  );

  if (!guest) return res.status(404).json({ message: "Invalid QR code." });
  if (guest.status === "used") return res.status(400).json({ message: "This QR code has already been used." });
  if (new Date(guest.expires_at) < new Date()) return res.status(400).json({ message: "This QR code has expired." });
  if (new Date(guest.starts_at) > new Date())
    return res.status(400).json({ message: `This QR code is not active yet. It becomes available at ${new Date(guest.starts_at).toLocaleString()}.` });

  await db.query("UPDATE guests SET status = 'used' WHERE id = ?", [guest.id]);
  await db.query(
    "INSERT INTO guest_sessions (guest_id, guest_name, mac_address, ip_address, login_time, status) VALUES (?,?,NULL,?,NOW(),'active')",
    [guest.id, guestName, req.ip]
  );

  res.json({
    guest: {
      name: guestName,
      expiresAt: guest.expires_at,
      dataLimitGb: guest.data_limit_gb,
    },
  });
});

module.exports = router;
