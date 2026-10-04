require("dotenv").config();
const db = require("../db");

async function ensureBytesUsedColumn(table) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'bytes_used'`,
    [table]
  );
  if (row.c) {
    console.log(`- ${table}.bytes_used already exists, skipping.`);
    return;
  }
  await db.query(`ALTER TABLE ${table} ADD COLUMN bytes_used BIGINT UNSIGNED NOT NULL DEFAULT 0`);
  console.log(`- added ${table}.bytes_used.`);
}

async function migrate() {
  try {
    await ensureBytesUsedColumn("sessions");
    console.log("✓ Session data usage migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error migrating session data usage:", err);
    process.exit(1);
  }
}

migrate();