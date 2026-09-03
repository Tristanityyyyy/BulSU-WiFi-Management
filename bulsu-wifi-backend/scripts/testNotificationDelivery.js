require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

// End-to-end check that a notification an admin sends is actually *received* by
// the people it was addressed to — and by nobody else.
//
// It drives the real routers over real HTTP (admin compose on one side, the
// user's own inbox on the other) against the real database, so it fails for the
// same reasons the running system would. Only the sweepers and the RouterOS
// side of server.js are left out; neither takes part in delivery.
//
// Fixtures are created and torn down inside one run, so it is safe to run
// against a working database as often as you like:
//   node scripts/testNotificationDelivery.js

const app = express();
app.use(express.json());
app.use("/api/admin", require("../routes/admin/index"));
app.use("/api/session", require("../routes/sessionRoutes"));

let base = "";
const tokenFor = (user) => jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// What a user can actually see when they open the portal: their own inbox.
async function inbox(user) {
  const { status, data } = await call("GET", "/api/session/notifications", { token: tokenFor(user) });
  if (status !== 200) throw new Error(`inbox for ${user.label} returned ${status}`);
  return data.notifications.map((n) => n.message);
}

const fixtures = { courseId: null, sectionA: null, sectionB: null, users: {} };
let notificationWatermark = 0;
let auditWatermark = 0;

async function seed() {
  const [[{ maxNotification }]] = await db.query("SELECT COALESCE(MAX(id), 0) AS maxNotification FROM notifications");
  notificationWatermark = maxNotification;
  const [[{ maxAudit }]] = await db.query("SELECT COALESCE(MAX(id), 0) AS maxAudit FROM audit_logs");
  auditWatermark = maxAudit;

  const [course] = await db.query(
    "INSERT INTO courses (code, name, status) VALUES ('ZZNOTIF', 'Notification delivery test course', 'inactive')"
  );
  fixtures.courseId = course.insertId;
  const [secA] = await db.query(
    "INSERT INTO sections (course_id, name, year_level, status) VALUES (?, 'T1', 1, 'inactive')",
    [fixtures.courseId]
  );
  const [secB] = await db.query(
    "INSERT INTO sections (course_id, name, year_level, status) VALUES (?, 'T2', 1, 'inactive')",
    [fixtures.courseId]
  );
  const [secEmpty] = await db.query(
    "INSERT INTO sections (course_id, name, year_level, status) VALUES (?, 'T3', 1, 'inactive')",
    [fixtures.courseId]
  );
  const [secBlocked] = await db.query(
    "INSERT INTO sections (course_id, name, year_level, status) VALUES (?, 'T4', 1, 'inactive')",
    [fixtures.courseId]
  );
  fixtures.sectionA = secA.insertId;
  fixtures.sectionB = secB.insertId;
  fixtures.sectionEmpty = secEmpty.insertId;
  fixtures.sectionBlocked = secBlocked.insertId;

  const make = async (label, { number, name, role, sectionId = null, trashed = false, blocked = false }) => {
    const [row] = await db.query(
      `INSERT INTO users (student_number, full_name, birth_date, password_hash, course_id, section_id,
                          enrollment_status, role, status, deleted_at, must_change_password)
       VALUES (?,?,'2000-01-01','x',?,?,?,?,?,?,0)`,
      [
        number,
        name,
        role === "student" ? fixtures.courseId : null,
        role === "student" ? sectionId : null,
        role === "student" ? "enrolled" : null,
        role,
        blocked ? "blocked" : "active",
        trashed ? new Date() : null,
      ]
    );
    fixtures.users[label] = { id: row.insertId, role, label, number, name };
  };

  await make("alice", { number: "9900000001", name: "Test, Alice", role: "student", sectionId: fixtures.sectionA });
  await make("bob", { number: "9900000002", name: "Test, Bob", role: "student", sectionId: fixtures.sectionA });
  await make("carol", { number: "9900000003", name: "Test, Carol", role: "student", sectionId: fixtures.sectionB });
  await make("frank", { number: "9900000004", name: "Test, Frank the faculty", role: "faculty" });
  await make("trashed", { number: "9900000005", name: "Test, Trashed", role: "student", sectionId: fixtures.sectionA, trashed: true });
  await make("blocked", { number: "9900000006", name: "Test, Blocked", role: "student", sectionId: fixtures.sectionA, blocked: true });
  // A section where nobody is reachable is a different problem from an empty
  // one, and gets a different answer.
  await make("shutOut", { number: "9900000007", name: "Test, Shut Out", role: "student", sectionId: fixtures.sectionBlocked, blocked: true });

  const [[admin]] = await db.query("SELECT id, role FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1");
  if (!admin) throw new Error("No admin account in the database to send as.");
  fixtures.admin = { ...admin, label: "admin" };
}

async function cleanup() {
  await db.query("DELETE FROM notifications WHERE id > ?", [notificationWatermark]);
  await db.query("DELETE FROM audit_logs WHERE id > ?", [auditWatermark]);
  const ids = Object.values(fixtures.users).map((u) => u.id);
  if (ids.length) await db.query("DELETE FROM users WHERE id IN (?)", [ids]);
  const sections = [fixtures.sectionA, fixtures.sectionB, fixtures.sectionEmpty, fixtures.sectionBlocked].filter(Boolean);
  if (sections.length) await db.query("DELETE FROM sections WHERE id IN (?)", [sections]);
  if (fixtures.courseId) await db.query("DELETE FROM courses WHERE id = ?", [fixtures.courseId]);
}

async function run() {
  const { alice, bob, carol, frank, trashed, blocked } = fixtures.users;
  const adminToken = tokenFor(fixtures.admin);
  const send = (body) => call("POST", "/api/admin/notifications/send", { token: adminToken, body });

  console.log("\n1. A message addressed to one user reaches that user");
  const direct = "TEST-DIRECT: this is for Alice only.";
  const sent = await send({ target: "user", user_id: alice.id, message: direct });
  check("send accepted", sent.status === 200, `HTTP ${sent.status} ${JSON.stringify(sent.data)}`);
  check("Alice received it", (await inbox(alice)).includes(direct));
  check("Bob did not receive it", !(await inbox(bob)).includes(direct));
  const listed = (await call("GET", "/api/admin/notifications", { token: adminToken })).data.notifications
    .find((n) => n.message === direct);
  check("the admin list names the recipient", listed?.recipient_name === alice.name, `got ${JSON.stringify(listed?.recipient_name)}`);

  console.log("\n2. A message addressed to nobody real is refused, not silently filed");
  const [[{ ghost }]] = await db.query("SELECT MAX(id) + 1000 AS ghost FROM users");
  const unknown = await send({ target: "user", user_id: ghost, message: "TEST-GHOST: goes nowhere." });
  check("unknown user id rejected with 4xx", unknown.status >= 400 && unknown.status < 500, `HTTP ${unknown.status} ${JSON.stringify(unknown.data)}`);
  const [[{ filed }]] = await db.query("SELECT COUNT(*) AS filed FROM notifications WHERE message LIKE 'TEST-GHOST%'");
  check("nothing was filed for the unknown id", Number(filed) === 0, `${filed} row(s)`);

  console.log("\n3. A message addressed to a trashed account is refused");
  const toTrashed = await send({ target: "user", user_id: trashed.id, message: "TEST-TRASHED: undeliverable." });
  check("trashed recipient rejected with 4xx", toTrashed.status >= 400 && toTrashed.status < 500, `HTTP ${toTrashed.status} ${JSON.stringify(toTrashed.data)}`);

  console.log("\n3b. A message addressed to a blocked account is refused");
  const toBlocked = await send({ target: "user", user_id: blocked.id, message: "TEST-BLOCKED: cannot log in to read this." });
  check("blocked recipient rejected with 4xx", toBlocked.status >= 400 && toBlocked.status < 500, `HTTP ${toBlocked.status} ${JSON.stringify(toBlocked.data)}`);
  const [[{ blockedFiled }]] = await db.query(
    "SELECT COUNT(*) AS blockedFiled FROM notifications WHERE user_id = ?", [blocked.id]
  );
  check("nothing was filed for the blocked account", Number(blockedFiled) === 0, `${blockedFiled} row(s)`);

  console.log("\n4. A message to a section reaches that section, and stops there");
  const sectionMsg = "TEST-SECTION: for section T1.";
  const toSection = await send({ target: "section", course_id: fixtures.courseId, section_id: fixtures.sectionA, message: sectionMsg });
  check("send accepted", toSection.status === 200, `HTTP ${toSection.status} ${JSON.stringify(toSection.data)}`);
  check("Alice (T1) received it", (await inbox(alice)).includes(sectionMsg));
  check("Bob (T1) received it", (await inbox(bob)).includes(sectionMsg));
  check("Carol (T2) did not receive it", !(await inbox(carol)).includes(sectionMsg));
  const [[{ toTrash }]] = await db.query(
    "SELECT COUNT(*) AS toTrash FROM notifications WHERE user_id = ? AND message = ?", [trashed.id, sectionMsg]
  );
  check("the trashed T1 account was skipped", Number(toTrash) === 0, `${toTrash} row(s)`);
  const [[{ toBlockedMember }]] = await db.query(
    "SELECT COUNT(*) AS toBlockedMember FROM notifications WHERE user_id = ? AND message = ?", [blocked.id, sectionMsg]
  );
  check("the blocked T1 account was skipped", Number(toBlockedMember) === 0, `${toBlockedMember} row(s)`);

  console.log("\n5. A section with nobody reachable in it is reported, not called a success");
  const empty = await send({ target: "section", course_id: fixtures.courseId, section_id: fixtures.sectionEmpty, message: "TEST-EMPTY: nobody here." });
  check("empty section rejected with 4xx", empty.status >= 400 && empty.status < 500, `HTTP ${empty.status} ${JSON.stringify(empty.data)}`);
  const allBlocked = await send({ target: "section", course_id: fixtures.courseId, section_id: fixtures.sectionBlocked, message: "TEST-SHUTOUT: everyone here is blocked." });
  check("all-blocked section rejected with 4xx", allBlocked.status >= 400 && allBlocked.status < 500, `HTTP ${allBlocked.status} ${JSON.stringify(allBlocked.data)}`);
  check("and says why, rather than claiming the section is empty",
    /blocked/i.test(allBlocked.data?.message || ""), JSON.stringify(allBlocked.data?.message));

  console.log('\n6. "Everyone" means everyone who can log in');
  const everyone = "TEST-ALL: campus-wide notice.";
  const toAll = await send({ target: "all", message: everyone });
  check("send accepted", toAll.status === 200, `HTTP ${toAll.status} ${JSON.stringify(toAll.data)}`);
  check("a student received it", (await inbox(alice)).includes(everyone));
  check("a faculty member received it", (await inbox(frank)).includes(everyone), "faculty are users of the network too");
  const [[{ trashedGot }]] = await db.query(
    "SELECT COUNT(*) AS trashedGot FROM notifications WHERE user_id = ? AND message = ?", [trashed.id, everyone]
  );
  check("a trashed account was skipped", Number(trashedGot) === 0, `${trashedGot} row(s)`);
  const [[{ blockedGot }]] = await db.query(
    "SELECT COUNT(*) AS blockedGot FROM notifications WHERE user_id = ? AND message = ?", [blocked.id, everyone]
  );
  check("a blocked account was skipped", Number(blockedGot) === 0, `${blockedGot} row(s)`);
  const [[{ reported }]] = await db.query(
    "SELECT COUNT(*) AS reported FROM notifications WHERE message = ?", [everyone]
  );
  check("the reported count matches what was filed", Number(toAll.data?.sent) === Number(reported), `reported ${toAll.data?.sent}, filed ${reported}`);

  console.log("\n7. Reading is scoped to the reader");
  const aliceUnread = (await call("GET", "/api/session/notifications", { token: tokenFor(alice) })).data.unread;
  check("Alice's messages arrive unread", aliceUnread > 0, `${aliceUnread} unread`);
  const [[aliceRow]] = await db.query(
    "SELECT id FROM notifications WHERE user_id = ? AND message = ?", [alice.id, everyone]
  );
  const stealing = await call("POST", "/api/session/notifications/read", { token: tokenFor(bob), body: { ids: [aliceRow.id] } });
  check("Bob cannot mark Alice's message read", stealing.data?.marked === 0, `marked ${stealing.data?.marked}`);
  await call("POST", "/api/session/notifications/read", { token: tokenFor(alice) });
  const afterRead = (await call("GET", "/api/session/notifications", { token: tokenFor(alice) })).data;
  check("Alice clearing her own inbox works", afterRead.unread === 0, `${afterRead.unread} unread`);
  const bobStillUnread = (await call("GET", "/api/session/notifications", { token: tokenFor(bob) })).data.unread;
  check("Bob's copy stays unread", bobStillUnread > 0, `${bobStillUnread} unread`);
}

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  let seeded = false;
  try {
    await seed();
    seeded = true;
    await run();
  } catch (err) {
    console.error("\nTest run aborted:", err);
    results.push({ name: "test run completed", passed: false, detail: err.message });
  } finally {
    if (seeded) await cleanup();
    server.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) console.log("Failed:\n" + failed.map((f) => `  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`).join("\n"));
  process.exit(failed.length ? 1 : 0);
})();
