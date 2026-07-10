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

async function isNullable(table, column) {
  const [[row]] = await db.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row?.IS_NULLABLE === "YES";
}

async function fkDeleteRule(constraintName) {
  const [[row]] = await db.query(
    `SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    [constraintName]
  );
  return row?.DELETE_RULE;
}

async function indexExists(table, indexName) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return row.c > 0;
}

async function relaxForeignKey({ table, column, constraintName, nullable }) {
  const rule = await fkDeleteRule(constraintName);
  if (rule === "SET NULL") {
    console.log(`- ${constraintName} already ON DELETE SET NULL, skipping.`);
    return;
  }
  if (nullable && !(await isNullable(table, column))) {
    await db.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} INT NULL`);
    console.log(`- ${table}.${column} made nullable.`);
  }
  await db.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${constraintName}`);
  await db.query(
    `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${column}) REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT`
  );
  console.log(`- ${constraintName} relaxed to ON DELETE SET NULL.`);
}

async function setupUserTrash() {
  try {
    if (!(await columnExists("users", "deleted_at"))) {
      await db.query("ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL AFTER status");
      console.log("- users.deleted_at column added.");
    } else {
      console.log("- users.deleted_at already exists, skipping.");
    }

    if (!(await indexExists("users", "idx_users_deleted_at"))) {
      await db.query("CREATE INDEX idx_users_deleted_at ON users (deleted_at)");
      console.log("- idx_users_deleted_at index added.");
    } else {
      console.log("- idx_users_deleted_at already exists, skipping.");
    }

    await relaxForeignKey({ table: "sessions", column: "user_id", constraintName: "sessions_ibfk_1", nullable: true });
    await relaxForeignKey({ table: "notifications", column: "user_id", constraintName: "notifications_ibfk_1", nullable: true });
    await relaxForeignKey({ table: "emergency_priority", column: "user_id", constraintName: "emergency_priority_ibfk_1", nullable: false });

    console.log("✓ User trash setup complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error setting up user trash:", err.message);
    process.exit(1);
  }
}

setupUserTrash();
