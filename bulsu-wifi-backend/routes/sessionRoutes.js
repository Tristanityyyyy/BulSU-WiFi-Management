const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { getRoleSessionMinutes } = require("../utils/settings");
const { getNoticeThresholds } = require("../jobs/sessionNotices");
const { endSession } = require("../utils/sessions");
const { getAllowance } = require("../utils/allowance");
const { findSessionForCaller } = require("../utils/device");

// "2023123456" -> "••••••3456". Confirms whose figures these are to the person
// holding the device, without printing an account number in full.
function maskAccountNumber(value) {
  const text = String(value || "");
  return text.length <= 4 ? text : "•".repeat(text.length - 4) + text.slice(-4);
}

// Which active account session, if any, belongs to the device making this
// request. See utils/device.js for what stands in for a password here and why
// it holds. Takes no input at all, so there is nothing to enumerate: a caller
// learns only about the device they are already sitting on. null means "not
// recognised".
//
// Found by address, or failing that by MAC — a phone that rejoined the Wi-Fi
// and picked up a different lease is still the same device, and the address it
// used to hold is no longer a way to say so.
const SESSION_FIELDS = `s.id, s.mac_address, s.login_time,
          u.id AS user_id, u.student_number, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id`;

async function recognizeDevice(req) {
  return findSessionForCaller(req, {
    byAddress: async (ip) => {
      const [[row]] = await db.query(
        `SELECT ${SESSION_FIELDS} WHERE s.status = 'active' AND s.ip_address = ?
          ORDER BY s.login_time DESC LIMIT 1`,
        [ip]
      );
      return row || null;
    },
    byMac: async (mac) => {
      const [[row]] = await db.query(
        `SELECT ${SESSION_FIELDS} WHERE s.status = 'active' AND UPPER(s.mac_address) = ?
          ORDER BY s.login_time DESC LIMIT 1`,
        [mac]
      );
      return row || null;
    },
  });
}

// The session a bearer token names, or null. The token is the one /claim
// minted for this browser; honouring it here is what lets the allowance page
// keep working after the lease underneath the device has changed. Never throws
// on a bad token — an expired one is simply not a credential, and the device
// check below is still there.
async function sessionFromToken(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  let claims;
  try {
    claims = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (!claims.sessionId || !claims.id) return null;

  const [[row]] = await db.query(
    `SELECT s.id, s.mac_address, s.login_time,
            u.id AS user_id, u.student_number, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.user_id = ? AND s.status = 'active' LIMIT 1`,
    [claims.sessionId, claims.id]
  );
  return row || null;
}

// The caller's session, however they can prove it is theirs: the token their
// browser kept, or the device they are sitting on. Token first — it costs no
// router round-trip, and it is the one that survives a new lease.
async function callerSession(req) {
  return (await sessionFromToken(req)) || (await recognizeDevice(req));
}

// GET /api/session/me — this device's own allowance, with nothing to type.
//
// The allowance page has always demanded a password, because the password was
// the only thing tying a request to a person. On a captive portal it doesn't
// have to be — recognizeDevice() above explains what stands in for it. 404 means
// "not recognised": the page falls back to asking for a password.
router.get("/me", async (req, res) => {
  try {
    const session = await callerSession(req);
    if (!session) return res.status(404).json({ message: "This device isn't connected." });

    const timeoutMinutes = await getRoleSessionMinutes(session.role);
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

// POST /api/session/claim — hands this device a token for the session it is
// already holding.
//
// Login happens inside the phone's captive-portal window (iOS' Captive Network
// Assistant, Android's "Sign in to network" sheet), and the OS closes that
// window seconds later, the moment its connectivity check starts passing. The
// dashboard rendered there goes with it. The browser the user actually watches
// their data and time in is a separate storage sandbox, so the token minted at
// login is not there and never can be — nothing can copy it across.
//
// So the real browser asks to be recognised instead. This is not a new grant:
// the device proved who it was at login, the router still says that address is
// that MAC, and what comes back carries the same claims the login already
// issued to the very same phone. There is nothing here that can start a
// session, extend one, or reach an account that isn't already live on this
// address — an unrecognised caller gets a 404 and a login form.
router.post("/claim", async (req, res) => {
  try {
    const session = await recognizeDevice(req);
    if (!session) return res.status(404).json({ message: "This device isn't connected." });

    const token = jwt.sign(
      { id: session.user_id, role: session.role, sessionId: session.id },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ token, role: session.role });
  } catch (err) {
    res.status(500).json({ message: "Failed to recognise this device." });
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
    const timeoutMinutes = await getRoleSessionMinutes(user.role);
    const elapsedSec = Math.floor((Date.now() - new Date(session.login_time).getTime()) / 1000);
    const { dataUsedMB, dataLimitMB } = await getAllowance({ id: req.user.id, role: user.role });
    const { lowDataMB } = await getNoticeThresholds();

    res.json({
      username: user.student_number,
      expiresInSec: Math.max(0, timeoutMinutes * 60 - elapsedSec),
      dataUsedMB,
      dataLimitMB,
      lowDataMB,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load session status." });
  }
});

// GET /api/session/notifications — the user's own messages.
//
// The notifications table has been written to for a long time (the admin
// compose form, and now the low-data and session-ending warnings) with nothing
// anywhere that could read it back: no user-facing endpoint existed, so every
// message ever "sent" was filed and never delivered. This is the delivery.
router.get("/notifications", verifyToken, async (req, res) => {
  try {
    const [notifications] = await db.query(
      `SELECT id, type, message, is_read, created_at
         FROM notifications WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({
      notifications,
      unread: notifications.filter((n) => !n.is_read).length,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load notifications." });
  }
});

// POST /api/session/notifications/read — marks messages read.
//
// Scoped to the caller's own rows by the WHERE clause, not by trusting the ids
// in the body: passing somebody else's id simply matches nothing.
router.post("/notifications/read", verifyToken, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : null;
    if (ids && !ids.length) return res.json({ marked: 0 });
    const [result] = ids
      ? await db.query(
          `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (?)`,
          [req.user.id, ids]
        )
      : await db.query(
          `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
          [req.user.id]
        );
    res.json({ marked: result.affectedRows });
  } catch (err) {
    res.status(500).json({ message: "Failed to update notifications." });
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
