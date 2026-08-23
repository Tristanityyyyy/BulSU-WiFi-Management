require("dotenv").config();
const db = require("../db");

// Adds the `last_seen` column both session tables need for presence-based
// disconnect: the last moment the router could actually see that device on the
// network. Nothing before this migration tracked it, so a phone that simply
// walked away (or turned its WiFi off) left its session 'active' forever —
// there was no signal that could ever end it.
//
// Backfilled to login_time so existing rows start with a real timestamp rather
// than NULL: an old ghost session is then immediately past the grace window and
// gets swept on the first tick, which is exactly what should happen to it.
async function addColumn(table) {
  const [[{ c }]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'last_seen'`,
    [table]
  );
  if (c) {
    console.log(`- ${table}.last_seen already exists.`);
    return;
  }
  await db.query(
    `ALTER TABLE ${table} ADD COLUMN last_seen DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER login_time`
  );
  const [res] = await db.query(`UPDATE ${table} SET last_seen = login_time`);
  console.log(`- ${table}.last_seen added, backfilled ${res.affectedRows} row(s) from login_time.`);
}

async function run() {
  try {
    await addColumn("sessions");
    await addColumn("guest_sessions");
    console.log("✓ session presence migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error adding session presence columns:", err.message);
    process.exit(1);
  }
}

run();
