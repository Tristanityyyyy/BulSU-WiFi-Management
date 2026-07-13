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

async function addFeedbackRoleGuest() {
  try {
    if (!(await columnExists("feedback", "role"))) {
      await db.query("ALTER TABLE feedback ADD COLUMN role VARCHAR(16) NULL AFTER student_number");
      console.log("- feedback.role column added.");
    }
    if (!(await columnExists("feedback", "guest_name"))) {
      await db.query("ALTER TABLE feedback ADD COLUMN guest_name VARCHAR(150) NULL AFTER role");
      console.log("- feedback.guest_name column added.");
    }

    await db.query(
      `UPDATE feedback f JOIN users u ON f.user_id = u.id
       SET f.role = u.role WHERE f.role IS NULL AND f.user_id IS NOT NULL`
    );
    console.log("- Backfilled role for existing attributed feedback.");

    console.log("✓ Feedback role/guest_name migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error migrating feedback role/guest_name:", err.message);
    process.exit(1);
  }
}

addFeedbackRoleGuest();
