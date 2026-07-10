require("dotenv").config();
const db = require("../db");

async function columnExists(table, column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row.c > 0;
}

async function addMustChangePasswordColumn() {
  try {
    if (!(await columnExists("users", "must_change_password"))) {
      await db.query("ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash");
      console.log("- users.must_change_password column added (default 0, existing rows unaffected).");
    } else {
      console.log("- users.must_change_password already exists, skipping.");
    }
    console.log("✓ Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error adding must_change_password column:", err.message);
    process.exit(1);
  }
}

addMustChangePasswordColumn();
