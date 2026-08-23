const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { getSettings, getRoleBandwidth } = require("../utils/settings");
const { endSession } = require("../utils/sessions");
const { grantAccess } = require("../utils/routeros");
const { normalizeIp } = require("../utils/ip");

// Fallback values used until the admin actually saves Settings at least once
// (the `settings` table only ever holds keys that were explicitly saved).
const { DEFAULT_SESSION_TIMEOUT_MIN } = require("../utils/constants");

const DEFAULT_MAX_DEVICES = { student: 2, faculty: 3, staff: 3, admin: 5 };

// Roles this account/day-based data cap applies to. Guests have their own
// per-QR data_limit_gb mechanism (guestRoutes.js); admin has no client-facing
// usage dashboard, so neither is metered/capped here.
const CAPPED_ROLES = ["student", "faculty", "staff"];

// Enrollment states that revoke network privilege — a student in one of these
// cannot log in. They come from a semester transition, which also force-disconnects
// the student's live session at batch commit; this stops them re-authenticating
// and getting a fresh RouterOS grant afterward.
const NO_ACCESS_ENROLLMENT = ["dropped", "loa", "graduated"];

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  // Guard before bcrypt.compare — it throws on an undefined password. An unknown
  // username short-circuits at the lookup below and never reaches it, so this only
  // ever bit a request naming a real account with no password field: a 500 for
  // what is plainly a bad request.
  if (!username || !password)
    return res.status(400).json({ message: "Username and password are required." });
  // Stored and handed to the router in one spelling — see utils/ip.js. Raw
  // `req.ip` is IPv4-mapped IPv6 here, which the router refuses.
  const clientIp = normalizeIp(req.ip);
  try {
    const [[user]] = await db.query(
      "SELECT * FROM users WHERE student_number = ? LIMIT 1",
      [username]
    );
    if (!user) return res.status(401).json({ message: "Invalid username or password." });
    if (user.deleted_at) return res.status(403).json({ message: "Account not found." });
    if (user.status === "blocked") return res.status(403).json({ message: "Account is blocked." });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid username or password." });

    // A student transitioned out of active enrollment (dropped / LOA / graduated)
    // keeps their account but loses network access — refuse the login so they
    // can't re-authenticate after a batch commit force-disconnected them.
    if (NO_ACCESS_ENROLLMENT.includes(user.enrollment_status)) {
      return res.status(403).json({ message: "Your enrollment is not active. Contact the registrar." });
    }

    // Daily data-cap check: without this, an account already cut off by the
    // usage meter could just log back in immediately and get a fresh MikroTik
    // grant before the next sweep notices. A cap of 0/unset means unlimited.
    let capGb = 0; // 0 = unlimited; also reported back to the first-login welcome screen
    if (CAPPED_ROLES.includes(user.role)) {
      const capSettings = await getSettings([`data_cap_gb_${user.role}`]);
      capGb = Number(capSettings[`data_cap_gb_${user.role}`]) || 0;
      if (capGb > 0) {
        const [[usage]] = await db.query(
          "SELECT bytes_used FROM data_usage WHERE user_id=? AND usage_date=CURDATE()",
          [user.id]
        );
        if ((usage?.bytes_used || 0) >= capGb * 1024 ** 3) {
          return res.status(403).json({ message: "Daily data limit reached. Access resumes tomorrow." });
        }
      }
    }

    // A new login from an IP that already holds an active session for this account
    // is treated as the same device reconnecting, not a new device — end the old
    // session before counting/enforcing the device limit below.
    const [supersedeTargets] = await db.query(
      "SELECT id FROM sessions WHERE user_id=? AND ip_address=? AND status='active'",
      [user.id, clientIp]
    );
    for (const s of supersedeTargets) {
      await endSession(s.id, { reason: "superseded" });
    }

    // Device policy: reject the login outright once the account is at its device limit.
    // A session only counts against the limit while it's still within that role's
    // timeout window — past that it's stale and doesn't hold a slot, even if no
    // explicit disconnect ever happened.
    const settings = await getSettings(["one_device_policy", `max_devices_${user.role}`, `session_timeout_${user.role}`]);
    const onePolicy = settings.one_device_policy !== "false"; // defaults ON
    const maxDevices = onePolicy ? 1 : (Number(settings[`max_devices_${user.role}`]) || DEFAULT_MAX_DEVICES[user.role] || 1);
    const timeoutMinutes = Number(settings[`session_timeout_${user.role}`]) || DEFAULT_SESSION_TIMEOUT_MIN[user.role] || 120;

    const [[{ activeCount }]] = await db.query(
      `SELECT COUNT(*) AS activeCount FROM sessions
       WHERE user_id=? AND status='active' AND login_time > NOW() - INTERVAL ? MINUTE`,
      [user.id, timeoutMinutes]
    );
    if (activeCount >= maxDevices) {
      if (maxDevices === 1) {
        // Single-device roles: logging in from a new device switches the account
        // over instead of being blocked — end the old device's session rather
        // than rejecting this login. The data allocation is per-account, not
        // per-device, so nothing needs to be transferred.
        const [switchTargets] = await db.query(
          "SELECT id FROM sessions WHERE user_id=? AND status='active'",
          [user.id]
        );
        for (const s of switchTargets) {
          await endSession(s.id, { reason: "auto_logout_device_switch" });
        }
      } else {
        return res.status(403).json({
          message: `Device limit reached (${maxDevices}). Log out from another device first.`,
        });
      }
    }

    // Snapshot the student's section/term at login so usage reports stay
    // accurate even after a later semester transition changes their section.
    const [session] = await db.query(
      `INSERT INTO sessions
         (user_id, ip_address, login_time, status,
          snapshot_course_id, snapshot_section_id, snapshot_school_year_id, snapshot_semester_id)
       VALUES (?, ?, NOW(), 'active', ?, ?, ?, ?)`,
      [user.id, clientIp, user.course_id, user.section_id, user.school_year_id, user.semester_id]
    );

    if (CAPPED_ROLES.includes(user.role)) {
      const limits = await getRoleBandwidth(user.role);
      const granted = await grantAccess(clientIp, session.insertId, "session", limits);
      if (granted) {
        await db.query(
          "INSERT INTO active_queues (session_id, user_id, ip_address, queue_id, last_bytes) VALUES (?,?,?,?,0)",
          [session.insertId, user.id, clientIp, granted.queueId]
        );
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, sessionId: session.insertId },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({
      token,
      role: user.role,
      full_name: user.full_name,
      must_change_password: !!user.must_change_password,
      // The onboarding welcome screen states this account's real limits back to the
      // user, so it reads them from the same settings this login just enforced rather
      // than repeating numbers that would drift the moment an admin edits Settings.
      policy: {
        sessionMinutes: timeoutMinutes,
        maxDevices,
        dataCapGb: capGb > 0 ? capGb : null, // null = unlimited
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

// POST /api/auth/change-password — self-service password change, used both for the
// mandatory first-login change and for a user changing their password anytime after.
// data_usage rows are keyed by CURDATE(), so an allowance resets at the database
// server's local midnight. Compute it the same way rather than in UTC, or the
// countdown shown to a student would be hours out.
function secondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.floor((midnight - now) / 1000);
}

// POST /api/auth/usage — read-only allowance lookup. Deliberately creates nothing:
// no session row, no RouterOS grant, no device slot consumed. That is the whole
// point — a student who has been cut off, or who is already at their device limit,
// is exactly who needs this number, and /login refuses both of them. The walled
// garden allows the portal pre-auth, so a device with no access can still reach it.
router.post("/usage", async (req, res) => {
  const { username, password } = req.body;
  // Guard before bcrypt.compare — it throws on an undefined password, which would
  // surface as a 500 for what is plainly a bad request.
  if (!username || !password)
    return res.status(400).json({ message: "Username and password are required." });
  try {
    const [[user]] = await db.query(
      "SELECT * FROM users WHERE student_number = ? LIMIT 1",
      [username]
    );
    // Same credential checks as /login, and the same deliberately vague failure
    // message — this endpoint must not become a way to probe which IDs exist.
    if (!user) return res.status(401).json({ message: "Invalid username or password." });
    if (user.deleted_at) return res.status(403).json({ message: "Account not found." });
    if (user.status === "blocked") return res.status(403).json({ message: "Account is blocked." });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid username or password." });

    // Enrollment status and the cap itself are NOT checked here. Those gate
    // connecting, not looking; refusing to show a dropped or exhausted student
    // their own figure would recreate the dead end this endpoint exists to remove.
    const capSettings = CAPPED_ROLES.includes(user.role)
      ? await getSettings([`data_cap_gb_${user.role}`])
      : {};
    const capGb = Number(capSettings[`data_cap_gb_${user.role}`]) || 0;

    const [[usage]] = await db.query(
      "SELECT bytes_used FROM data_usage WHERE user_id=? AND usage_date=CURDATE()",
      [user.id]
    );
    const dataUsedMB = Math.round((usage?.bytes_used || 0) / (1024 * 1024));
    const dataLimitMB = capGb > 0 ? capGb * 1024 : null; // null = unlimited

    res.json({
      username: user.student_number,
      role: user.role,
      dataUsedMB,
      dataLimitMB,
      remainingMB: dataLimitMB === null ? null : Math.max(0, dataLimitMB - dataUsedMB),
      resetsInSec: secondsUntilMidnight(),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load data usage." });
  }
});

router.post("/change-password", verifyToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ message: "Current and new password are required." });
  try {
    const [[user]] = await db.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({ message: "Account not found." });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Current password is incorrect." });

    const newHash = await bcrypt.hash(new_password, 10);
    await db.query(
      "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
      [newHash, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to change password." });
  }
});

module.exports = router;
