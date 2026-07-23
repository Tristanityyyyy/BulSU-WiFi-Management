const express = require("express");
const router = express.Router();
const db = require("../db");
const { grantAccess } = require("../utils/routeros");

// GET /api/guest/token-status?token=...
// Read-only check — does NOT create a session or consume the token
router.get("/token-status", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("GET /guest/token-status failed:", err);
    res.status(500).json({ message: "Unable to check this QR code right now. Please try again." });
  }
});

// POST /api/guest/verify
// Creates the guest session and marks the token as used
router.post("/verify", async (req, res) => {
  try {
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
    const [inserted] = await db.query(
      "INSERT INTO guest_sessions (guest_id, guest_name, mac_address, ip_address, login_time, status) VALUES (?,?,NULL,?,NOW(),'active')",
      [guest.id, guestName, req.ip]
    );
    const guestSessionId = inserted.insertId;

    // Open the real MikroTik gate + start metering this guest. Best-effort,
    // exactly like the student login (authRoutes): a null return (router down
    // or MIKROTIK_HOST unset) must never block the guest from connecting.
    const granted = await grantAccess(req.ip, guestSessionId, "guest");
    if (granted) {
      await db.query(
        "UPDATE guest_sessions SET queue_id=?, last_bytes=0, bytes_used=0 WHERE id=?",
        [granted.queueId, guestSessionId]
      );
    }

    res.json({
      guest: {
        name: guestName,
        expiresAt: guest.expires_at,
        dataLimitGb: guest.data_limit_gb,
      },
    });
  } catch (err) {
    console.error("POST /guest/verify failed:", err);
    res.status(500).json({ message: "Unable to connect right now. Please try again." });
  }
});

// GET /api/guest/session-status?token=...
// Polled by the guest dashboard after connecting so it reflects reality — a
// data-cap or admin cutoff ends the session server-side, and the client needs
// to see that instead of counting down forever. Keyed off the QR token (no JWT
// for guests); returns the latest session tied to that token.
router.get("/session-status", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: "Token is required." });

    const [[row]] = await db.query(
      `SELECT gs.status, gs.bytes_used, g.data_limit_gb, g.expires_at
         FROM guest_sessions gs
         JOIN guests g ON g.id = gs.guest_id
        WHERE g.token = ?
        ORDER BY gs.id DESC LIMIT 1`,
      [token]
    );
    if (!row) return res.status(404).json({ message: "No session found for this QR code." });

    res.json({
      status: row.status, // 'active' | 'timeout' | 'data_limit' | 'force-disconnected' | 'ended'
      bytesUsed: Number(row.bytes_used || 0),
      dataLimitMb: row.data_limit_gb > 0 ? row.data_limit_gb * 1024 : null, // null = unlimited
      expiresAt: row.expires_at,
    });
  } catch (err) {
    console.error("GET /guest/session-status failed:", err);
    res.status(500).json({ message: "Unable to load session status." });
  }
});

module.exports = router;
