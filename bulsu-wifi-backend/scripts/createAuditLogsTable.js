require("dotenv").config();
const db = require("../db");

async function createAuditLogsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        admin_id      INT NULL,
        admin_name    VARCHAR(255) NOT NULL,
        action        VARCHAR(16) NOT NULL,
        target_type   VARCHAR(32) NULL,
        target_name   VARCHAR(255) NULL,
        description   TEXT NOT NULL,
        metadata      JSON NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_admin_id (admin_id),
        INDEX idx_audit_action (action),
        INDEX idx_audit_created_at (created_at)
      )
    `);

    console.log("✓ audit_logs table ready!");
    process.exit(0);
  } catch (err) {
    console.error("Error creating audit_logs table:", err.message);
    process.exit(1);
  }
}

createAuditLogsTable();
