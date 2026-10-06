const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { getSettings, getRoleBandwidth, getRoleBandwidthMap, getRoleSessionMinutes, getRoleSessionMinutesMap } = require("../utils/settings");
const { endSession } = require("../utils/sessions");
const { grantAccess, readClientMac, isRouterAddress } = require("../utils/routeros");
const { normalizeIp } = require("../utils/ip");

// Fallback values used until the admin actually saves Settings at least once
// (the `settings` table only ever holds keys that were explicitly saved).
const { CAPPED_ROLES, DATA_CAPPED_ROLES } = require("../utils/constants");
const { getAllowance } = require("../utils/allowance");
const { activePriorityGrant, emergencyDataCapGb, emergencyLimitsFor } = require("../utils/emergency");
const { ACCOUNT_NUMBER_PATTERN, ACCOUNT_NUMBER_MESSAGE } = require("../utils/constants");

const DEFAULT_MAX_DEVICES = { student: 2, faculty: 3, staff: 3, admin: 5 };

const sectionYearLevel = (section) => {
  const storedYear = Number(section.year_level);
  if (Number.isInteger(storedYear) && storedYear > 0) return storedYear;
  const prefix = String(section.name || "").match(/^(\d+)/)?.[1];
  return prefix ? Number(prefix) : 0;
};

// GET /api/auth/registration-options — public signup choices, limited to the
// active course/section catalog so archived programs cannot receive new users.
router.get("/registration-options", async (req, res) => {
  try {
    const [[catalogCourses], [catalogSections]] = await Promise.all([
      db.query("SELECT id, code, name FROM courses WHERE status = 'active' ORDER BY code, name"),
      db.query(
        `SELECT s.id, s.course_id, s.name, s.year_level
         FROM sections s JOIN courses c ON c.id = s.course_id
        WHERE s.status = 'active' AND c.status = 'active'
        ORDER BY s.course_id, s.year_level, s.name`
      ),
    ]);
    const sections = catalogSections
      .map((section) => ({ ...section, year_level: sectionYearLevel(section) }))
      .filter((section) => section.year_level > 0);
    const coursesWithSections = new Set(sections.map((section) => Number(section.course_id)));
    const courses = catalogCourses.filter((course) => coursesWithSections.has(Number(course.id)));
    res.json({ courses, sections });
  } catch (err) {
    res.status(500).json({ message: "Failed to load registration options." });
  }
});

// POST /api/auth/register — submissions stay requests until an administrator approves them.
router.post("/register", async (req, res) => {
  const {
    student_number, full_name, email, role, birthdate,
    course_id, year_level, section_id, accepted_terms,
  } = req.body;
  const studentNumber = String(student_number || "").trim();
  const name = String(full_name || "").trim();
  const contactEmail = String(email || "").trim().toLowerCase();
  const accountRole = String(role || "").trim().toLowerCase();
  const birthDate = String(birthdate || "").trim();
  const isStudent = accountRole === "student";
  const courseId = isStudent ? Number(course_id) : null;
  const sectionId = isStudent ? Number(section_id) : null;
  const yearLevel = isStudent ? Number(year_level) : null;

  if (accepted_terms !== true)
    return res.status(400).json({ message: "Accept the Terms and Policy before creating an account." });
  if (!["student", "faculty", "staff"].includes(accountRole))
    return res.status(400).json({ message: "Select student, faculty, or staff as the account role." });
  if (!ACCOUNT_NUMBER_PATTERN.test(studentNumber))
    return res.status(400).json({ message: ACCOUNT_NUMBER_MESSAGE });
  if (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    return res.status(400).json({ message: "Enter a valid email address." });
  if (!name || name.length > 255)
    return res.status(400).json({ message: "Enter your full name (up to 255 characters)." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`)) || new Date(`${birthDate}T00:00:00Z`).toISOString().slice(0, 10) !== birthDate || birthDate > new Date().toISOString().slice(0, 10))
    return res.status(400).json({ message: "Enter a valid birth date." });
  if (isStudent && (!Number.isInteger(courseId) || courseId < 1 || !Number.isInteger(sectionId) || sectionId < 1 || !Number.isInteger(yearLevel) || yearLevel < 1))
    return res.status(400).json({ message: "Select a valid course, year, and section." });
  try {
    if (isStudent) {
      const [[section]] = await db.query(
        `SELECT s.id, s.name, s.year_level FROM sections s JOIN courses c ON c.id = s.course_id
          WHERE s.id = ? AND s.course_id = ?
            AND s.status = 'active' AND c.status = 'active' LIMIT 1`,
        [sectionId, courseId]
      );
      if (!section || sectionYearLevel(section) !== yearLevel)
        return res.status(400).json({ message: "That course, year, and section is no longer available." });
    }

    const [[existingUser]] = await db.query(
      "SELECT id FROM users WHERE student_number = ? LIMIT 1",
      [studentNumber]
    );
    if (existingUser)
      return res.status(409).json({ message: "An account with this student number already exists." });
    const [[existingRequest]] = await db.query(
      "SELECT id FROM registration_requests WHERE student_number = ? AND status = 'pending' LIMIT 1",
      [studentNumber]
    );
    if (existingRequest)
      return res.status(409).json({ message: "A registration request for this student number is already pending." });

    await db.query(
      `INSERT INTO registration_requests
        (student_number, full_name, email, role, birth_date, course_id, section_id,
         year_level, accepted_terms_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'pending', NOW())`,
      [studentNumber, name, contactEmail, accountRole, birthDate, courseId, sectionId, yearLevel]
    );
    res.status(201).json({ message: `Request submitted. Your login ID and temporary password will be emailed to ${contactEmail} after approval.` });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "That student number is already registered." });
    if (err.code === "ER_NO_SUCH_TABLE" || err.code === "ER_BAD_FIELD_ERROR")
      return res.status(503).json({ message: "Registration requests are not available yet. Please contact an administrator." });
    res.status(500).json({ message: "Unable to submit registration." });
  }
});

// Enrollment states that revoke network privilege — a student in one of these
// cannot log in. They come from a semester transition, which also force-disconnects
// the student's live session at batch commit; this stops them re-authenticating
// and getting a fresh RouterOS grant afterward.
const NO_ACCESS_ENROLLMENT = ["dropped", "loa", "graduated"];

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password, accepted_terms } = req.body;
  // Guard before bcrypt.compare — it throws on an undefined password. An unknown
  // username short-circuits at the lookup below and never reaches it, so this only
  // ever bit a request naming a real account with no password field: a 500 for
  // what is plainly a bad request.
  if (!username || !password)
    return res.status(400).json({ message: "Username and password are required." });
  if (accepted_terms !== true)
    return res.status(400).json({ message: "Accept the Terms and Policy before logging in." });
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

    // Read once, three uses: the cap gate immediately below, the figure quoted
    // back to the welcome screen, and the queue this login creates further down.
    // It used to be fetched inside the gate, which meant the two halves of a
    // single login disagreed — the cap honoured the grant while the queue was
    // still built at plain role speed, so someone holding an emergency priority
    // connected unboosted and stayed that way until the meter's next tick.
    //
    // `undefined` means no priority at all; `null` means one carrying no
    // figures, which waives the cap outright as it always has.
    const grant = CAPPED_ROLES.includes(user.role)
      ? await activePriorityGrant(user.id)
      : undefined;

    // Daily data-cap check: without this, an account already cut off by the
    // usage meter could just log back in immediately and get a fresh MikroTik
    // grant before the next sweep notices. A cap of 0/unset means unlimited.
    let capGb = 0; // 0 = unlimited; the role's own figure, before any grant
    let effectiveCapGb = 0; // what this account is actually held to today; null = no cutoff
    if (DATA_CAPPED_ROLES.includes(user.role)) {
      const capSettings = await getSettings([`data_cap_gb_${user.role}`]);
      capGb = Number(capSettings[`data_cap_gb_${user.role}`]) || 0;
      // An emergency priority lifts the cap, so it must lift this gate by the
      // same amount — otherwise the boost would only reach people who hadn't
      // needed it yet.
      effectiveCapGb = grant === undefined ? capGb : emergencyDataCapGb(capGb, grant);
      if (capGb > 0) {
        const [[usage]] = await db.query(
          "SELECT bytes_used FROM data_usage WHERE user_id=? AND usage_date=CURDATE()",
          [user.id]
        );
        // A granted allocation raises the bar rather than removing it, so someone
        // who has already burned through role cap *and* grant is still stopped.
        if (effectiveCapGb !== null && (usage?.bytes_used || 0) >= effectiveCapGb * 1024 ** 3) {
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
    const settings = await getSettings(["one_device_policy", `max_devices_${user.role}`]);
    const onePolicy = settings.one_device_policy !== "false"; // defaults ON
    const maxDevices = onePolicy ? 1 : (Number(settings[`max_devices_${user.role}`]) || DEFAULT_MAX_DEVICES[user.role] || 1);
    const timeoutMinutes = await getRoleSessionMinutes(user.role);

    const activeCountQuery = timeoutMinutes == null
      ? `SELECT COUNT(*) AS activeCount FROM sessions WHERE user_id=? AND status='active'`
      : `SELECT COUNT(*) AS activeCount FROM sessions
         WHERE user_id=? AND status='active' AND login_time > NOW() - INTERVAL ? MINUTE`;
    const activeCountParams = timeoutMinutes == null ? [user.id] : [user.id, timeoutMinutes];
    const [[{ activeCount }]] = await db.query(activeCountQuery, activeCountParams);
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

    if (isRouterAddress(clientIp)) {
      // Nothing below can work on this address, and the session that results will
      // look inexplicable later — so name the cause in the log while it is happening.
      console.warn(
        `Login for ${user.student_number} arrived from ${clientIp}, the router's own address: this request ` +
        `was source-NATed on the way in, so the real device is unknown. No grant, no metering, no MAC.`
      );
    }

    let deviceMac = null;
    if (CAPPED_ROLES.includes(user.role)) {
      // The queue is built with the grant already folded in, so a prioritised
      // user is boosted from their first packet. Leaving it at the role's own
      // figure meant they connected at ordinary speed and priority 8, and only
      // moved when the meter next reconciled — up to two minutes of an emergency
      // spent at exactly the limits the emergency was declared to lift.
      const roleLimits = await getRoleBandwidth(user.role);
      const limits = grant === undefined ? roleLimits : emergencyLimitsFor(roleLimits, grant);
      const granted = await grantAccess(clientIp, session.insertId, "session", limits, user.role);
      if (granted) {
        await db.query(
          "INSERT INTO active_queues (session_id, user_id, ip_address, queue_id, last_bytes) VALUES (?,?,?,?,0)",
          [session.insertId, user.id, clientIp, granted.queueId]
        );
        deviceMac = granted.mac;
      }
    }
    // Identifying the device is not a privilege of the roles that get a queue: an
    // admin login, or one whose grant was refused, still names its device here.
    // Recorded now, while the device is demonstrably present — the presence sweeper
    // can only learn it on a later tick, which left every session that ended inside
    // a minute with no record of the device at all.
    if (!deviceMac) deviceMac = await readClientMac(clientIp);
    if (deviceMac) {
      await db.query("UPDATE sessions SET mac_address=? WHERE id=?", [deviceMac, session.insertId]);
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
        // The grant is part of "this account's real limits" for as long as it is
        // active, so the welcome screen quotes what is actually being enforced
        // rather than the role figure the emergency has already superseded.
        dataCapGb: effectiveCapGb > 0 ? effectiveCapGb : null, // null = unlimited
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

// POST /api/auth/change-password — self-service password change, used both for the
// mandatory first-login change and for a user changing their password anytime after.
// GET /api/auth/policy — what each role is entitled to, for anyone who asks.
//
// No authentication, and none is needed: these are the published house rules,
// not anybody's personal figures. Putting them on the login screen answers the
// question most people actually have before they type anything ("what do I even
// get?"), which is otherwise only visible after connecting.
//
// Read from the same settings the enforcement reads, with the same fallbacks,
// so the screen can never quote a number the system doesn't actually apply.
router.get("/policy", async (req, res) => {
  try {
    const bandwidth = await getRoleBandwidthMap(CAPPED_ROLES);
    const [settings, sessionMinutesByRole] = await Promise.all([
      getSettings([
        "one_device_policy",
        ...DATA_CAPPED_ROLES.map((role) => `data_cap_gb_${role}`),
        ...CAPPED_ROLES.map((role) => `max_devices_${role}`),
      ]),
      getRoleSessionMinutesMap(CAPPED_ROLES),
    ]);
    // Same rule login applies: the one-device policy overrides the per-role
    // number rather than sitting beside it, so resolve it here instead of
    // making the client reproduce the precedence.
    const onePolicy = settings.one_device_policy !== "false"; // defaults ON

    res.json({
      roles: CAPPED_ROLES.map((role) => {
        const capGb = DATA_CAPPED_ROLES.includes(role) ? Number(settings[`data_cap_gb_${role}`]) : 0;
        const devices = Number(settings[`max_devices_${role}`]);
        return {
          role,
          dataCapGb: Number.isFinite(capGb) && capGb > 0 ? capGb : null, // null = unlimited
          sessionMinutes: sessionMinutesByRole[role],
          maxDevices: onePolicy
            ? 1
            : (Number.isFinite(devices) && devices > 0 ? devices : DEFAULT_MAX_DEVICES[role] || 1),
          downMbps: bandwidth[role].downMbps || null, // null = unshaped
          upMbps: bandwidth[role].upMbps || null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load access policy." });
  }
});

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
    res.json({ username: user.student_number, ...(await getAllowance(user)) });
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
