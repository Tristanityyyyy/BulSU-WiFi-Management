require("dotenv").config();
const db = require("../db");

// Schema and settings for two features that existed only on paper until now:
// emergency priority (rows were written, nothing read them) and the low-data /
// low-time warnings (a browser popup that mostly never fired, and a time warning
// that was never written at all).

async function addNotificationSessionLink() {
  const [[{ c }]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'session_id'`
  );
  if (c) {
    console.log("- notifications.session_id already exists.");
    return;
  }
  // No foreign key on purpose: a warning is a record of something that was true
  // at the time, and it must outlive the session that triggered it — including
  // the trash purge, which hard-deletes rows the FKs are already set up to
  // detach rather than cascade.
  await db.query("ALTER TABLE notifications ADD COLUMN session_id INT NULL AFTER user_id");
  await db.query("CREATE INDEX idx_notifications_session ON notifications (session_id, type)");
  console.log("- notifications.session_id added (+ index) — lets a per-session warning be sent exactly once.");
}

async function enableEmergencyEnforcement() {
  const [[row]] = await db.query("SELECT `value` FROM settings WHERE `key` = 'emergency_priority_mode'");
  if (!row) {
    await db.query("INSERT INTO settings (`key`, `value`) VALUES ('emergency_priority_mode', 'true')");
    console.log("- emergency_priority_mode seeded as 'true'.");
    return;
  }
  if (row.value === "false") {
    // Flipped deliberately: the stored 'false' cannot have been a considered
    // choice, because until now nothing anywhere read this key and an activated
    // priority did nothing either way. Leaving it would ship the feature switched
    // off. It is now a real switch, on the Settings page, and an admin who wants
    // it off can turn it off.
    await db.query("UPDATE settings SET `value` = 'true' WHERE `key` = 'emergency_priority_mode'");
    console.log("- emergency_priority_mode flipped 'false' -> 'true' (it now actually does something).");
    return;
  }
  console.log(`- emergency_priority_mode already '${row.value}'.`);
}

async function seedNoticeThresholds() {
  const defaults = { notify_low_data_mb: "200", notify_low_time_min: "15" };
  for (const [key, value] of Object.entries(defaults)) {
    const [res] = await db.query(
      "INSERT IGNORE INTO settings (`key`, `value`) VALUES (?, ?)",
      [key, value]
    );
    console.log(res.affectedRows ? `- ${key} seeded as ${value}.` : `- ${key} already set.`);
  }
}

async function run() {
  try {
    await addNotificationSessionLink();
    await enableEmergencyEnforcement();
    await seedNoticeThresholds();
    console.log("✓ alerts and emergency priority migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error preparing alerts and priority support:", err.message);
    process.exit(1);
  }
}

run();
