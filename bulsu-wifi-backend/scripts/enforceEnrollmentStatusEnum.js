require("dotenv").config();
const db = require("../db");

const ALLOWED = ['enrolled', 'dropped', 'loa', 'graduated'];

async function checkConstraintExists(name) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.CHECK_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    [name]
  );
  return row.c > 0;
}

// Reconciling migration — always brings the column to the current ALLOWED set,
// so re-running after ALLOWED changes (e.g. dropping a value) applies the change.
async function enforceEnrollmentStatusEnum() {
  try {
    // Safety: refuse to convert if any existing value is outside the allowed set,
    // so no real data gets silently coerced to '' or rejected mid-migration.
    const [rogue] = await db.query(
      `SELECT DISTINCT enrollment_status FROM users
       WHERE enrollment_status IS NOT NULL AND enrollment_status NOT IN (?)`,
      [ALLOWED]
    );
    if (rogue.length) {
      console.error("Aborting — these enrollment_status values are outside the allowed set:",
        rogue.map((r) => r.enrollment_status));
      process.exit(1);
    }

    // Drop the CHECK first so the column/CHECK can be reshaped to the new set.
    if (await checkConstraintExists("chk_enrollment_status")) {
      await db.query("ALTER TABLE users DROP CONSTRAINT chk_enrollment_status");
      console.log("- dropped existing chk_enrollment_status.");
    }

    await db.query(`ALTER TABLE users MODIFY COLUMN enrollment_status ENUM('${ALLOWED.join("','")}') NULL`);
    console.log(`- users.enrollment_status ENUM set to (${ALLOWED.join(', ')}).`);

    // CHECK gives hard rejection even under this DB's non-strict sql_mode, where an
    // ENUM alone would coerce an invalid value to '' instead of erroring. NULL still
    // passes (a CHECK is satisfied on UNKNOWN), matching the nullable column.
    await db.query(
      `ALTER TABLE users ADD CONSTRAINT chk_enrollment_status
       CHECK (enrollment_status IN ('${ALLOWED.join("','")}'))`
    );
    console.log("- chk_enrollment_status CHECK constraint (re)added.");

    console.log("✓ enrollment_status enum/enforcement migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error enforcing enrollment_status enum:", err.message);
    process.exit(1);
  }
}

enforceEnrollmentStatusEnum();
