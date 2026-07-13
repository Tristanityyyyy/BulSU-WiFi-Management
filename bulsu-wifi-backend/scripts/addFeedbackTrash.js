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

async function indexExists(table, indexName) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return row.c > 0;
}

async function addFeedbackTrash() {
  try {
    if (!(await columnExists("feedback", "deleted_at"))) {
      await db.query("ALTER TABLE feedback ADD COLUMN deleted_at DATETIME NULL");
      console.log("- feedback.deleted_at column added.");
    } else {
      console.log("- feedback.deleted_at already exists, skipping.");
    }

    if (!(await indexExists("feedback", "idx_feedback_deleted_at"))) {
      await db.query("CREATE INDEX idx_feedback_deleted_at ON feedback (deleted_at)");
      console.log("- idx_feedback_deleted_at index added.");
    } else {
      console.log("- idx_feedback_deleted_at already exists, skipping.");
    }

    console.log("✓ Feedback trash migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error migrating feedback trash:", err.message);
    process.exit(1);
  }
}

addFeedbackTrash();
