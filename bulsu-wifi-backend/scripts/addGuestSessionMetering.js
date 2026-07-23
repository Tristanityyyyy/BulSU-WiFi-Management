require("dotenv").config();
const db = require("../db");

// Adds the columns the guest data-usage meter needs onto guest_sessions, and
// (if status is an ENUM) widens it to allow the new 'data_limit' / 'ended'
// outcomes. Idempotent — guarded by information_schema so re-running is a no-op.

async function columnExists(table, column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row.c > 0;
}

async function addColumnIfMissing(column, ddl) {
  if (await columnExists("guest_sessions", column)) {
    console.log(`- guest_sessions.${column} already exists, skipping.`);
    return;
  }
  await db.query(`ALTER TABLE guest_sessions ADD COLUMN ${ddl}`);
  console.log(`- added guest_sessions.${column}.`);
}

// Only touch `status` if it is an ENUM — if it's VARCHAR/TEXT the new values
// already work and need no schema change.
async function ensureStatusValues(required) {
  const [[row]] = await db.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_sessions' AND COLUMN_NAME = 'status'`
  );
  if (!row) return;
  const type = String(row.t);
  if (!type.toLowerCase().startsWith("enum(")) {
    console.log("- guest_sessions.status is not an ENUM, no widening needed.");
    return;
  }
  const existing = (type.match(/'([^']*)'/g) || []).map((s) => s.slice(1, -1));
  const merged = Array.from(new Set([...existing, ...required]));
  if (merged.length === existing.length) {
    console.log("- guest_sessions.status ENUM already covers the new values.");
    return;
  }
  await db.query(
    `ALTER TABLE guest_sessions MODIFY COLUMN status ENUM('${merged.join("','")}') NOT NULL DEFAULT 'active'`
  );
  console.log(`- guest_sessions.status ENUM widened to (${merged.join(", ")}).`);
}

async function migrate() {
  try {
    await addColumnIfMissing("queue_id", "queue_id VARCHAR(64) NULL");
    await addColumnIfMissing("last_bytes", "last_bytes BIGINT NOT NULL DEFAULT 0");
    await addColumnIfMissing("bytes_used", "bytes_used BIGINT NOT NULL DEFAULT 0");
    await ensureStatusValues(["data_limit", "ended"]);
    console.log("✓ guest_sessions metering migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error migrating guest_sessions:", err.message);
    process.exit(1);
  }
}

migrate();
