const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { getSettings } = require("../utils/settings");
const { endSession } = require("../utils/sessions");
const { DEFAULT_SESSION_TIMEOUT_MIN } = require("../utils/constants");
const { getAllowance } = require("../utils/allowance");
const { readNetworkPresence } = require("../utils/routeros");
const { normalizeIp, isGrantableIp } = require("../utils/ip");

// The role's configured session window, falling back to the shared default when
// an admin has never saved Settings → Network. Both reads below need it: the
// dashboard countdown, and the device-recognised view that shows the same figure
// without a token.
async function sessionTimeoutMinutes(role) {
  const settings = await getSettings([`session_timeout_${role}`]);
  const configured = Number(settings[`session_timeout_${role}`]);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SESSION_TIMEOUT_MIN[role] || DEFAULT_SESSION_TIMEOUT_MIN.student;
}

// "2023123456" -> "••••••3456". Confirms whose figures these are to the person
// holding the device, without printing an account number in full.
function maskAccountNumber(value) {
  const text = String(value || "");
  return text.length <= 4 ? text : "•".repeat(text.length - 4) + text.slice(-4);
}

// GET /api/session/me — this device's own allowance, with nothing to type.
//
// The allowance page has always demanded a password, because the password was
// the only thing tying a request to a person. On a captive portal it doesn't
// have to be: a device that already holds an active session has been identified
// once already, and the router can confirm the address still belongs to it.
// So the credential here is network position — you are the device holding that
// lease, and the router agrees it is associated right now. That is precisely the
// trust the hotspot already extends to that address when it routes its packets.
//
// The MAC cross-check is what makes it safe to lean on: DHCP handing the address
// to somebody else changes the MAC, and the match fails, so a recycled lease
// cannot show the previous holder's figures. When the router can't be reached
// the check degrades to the address alone, which still requires the caller to
// actually hold it on the LAN.
//
// Takes no input at all, so there is nothing to enumerate: a caller learns only
// about the device they are already sitting on. 404 means "not recognised" —
// the page falls back to asking for a password.
router.get("/me", async (req, res) => {
  try {
    const ip = normalizeIp(req.ip);
    // Loopback (the portal laptop's own browser) has no lease and no router
    // footprint, so there is no device here to recognise.
    if (!isGrantableIp(ip)) return res.status(404).json({ message: "This device isn't connected." });

    const [[session]] = await db.query(
      `SELECT s.id, s.mac_address, s.login_time, u.id AS user_id, u.student_number, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.status = 'active' AND s.ip_address = ?
        ORDER BY s.login_time DESC LIMIT 1`,
      [ip]
    );
    if (!session) return res.status(404).json({ message: "This device isn't connected." });

    const presence = await readNetworkPresence();
    if (presence) {
      const current = presence.macByIp.get(ip) || null;
      const recorded = session.mac_address ? session.mac_address.toUpperCase() : null;
      const present = !!current && presence.liveMacs.has(current) && (!recorded || recorded === current);
      if (!present) return res.status(404).json({ message: "This device isn't connected." });
    }

    const timeoutMinutes = await sessionTimeoutMinutes(session.role);
    const elapsedSec = Math.floor((Date.now() - new Date(session.login_time).getTime()) / 1000);

    res.json({
      // Masked: enough for the holder to recognise their own account, not enough
      // to identify them to whoever picks up this address next.
      username: maskAccountNumber(session.student_number),
      expiresInSec: Math.max(0, timeoutMinutes * 60 - elapsedSec),
      recognizedDevice: true,
      ...(await getAllowance({ id: session.user_id, role: session.role })),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load this device's allowance." });
  }
});

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

    // Both figures come from the same helpers the unauthenticated views use, so
    // the countdown here can't quote a window the sweeper doesn't enforce, nor a
    // remaining figure that disagrees with the allowance page.
    const timeoutMinutes = await sessionTimeoutMinutes(user.role);
    const elapsedSec = Math.floor((Date.now() - new Date(session.login_time).getTime()) / 1000);
    const { dataUsedMB, dataLimitMB } = await getAllowance({ id: req.user.id, role: user.role });

    res.json({
      username: user.student_number,
      expiresInSec: Math.max(0, timeoutMinutes * 60 - elapsedSec),
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
