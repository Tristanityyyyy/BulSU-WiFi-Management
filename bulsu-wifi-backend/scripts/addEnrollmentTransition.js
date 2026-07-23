require("dotenv").config();
const db = require("../db");

async function tableExists(table) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return row.c > 0;
}

async function columnExists(table, column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row.c > 0;
}

async function addSessionSnapshotColumn(column) {
  if (await columnExists("sessions", column)) {
    console.log(`- sessions.${column} already exists, skipping.`);
    return;
  }
  await db.query(`ALTER TABLE sessions ADD COLUMN ${column} INT NULL`);
  console.log(`- sessions.${column} column added.`);
}

async function addEnrollmentTransition() {
  try {
    // enrollment_history: one row per student per term. The UNIQUE on
    // (student_number, school_year_id, semester_id) is what makes re-running a
    // term's transition batch fail loudly instead of silently duplicating.
    // student_number is stored denormalized so history survives even if the
    // user row is later purged from the 30-day trash (user_id then goes NULL).
    if (!(await tableExists("enrollment_history"))) {
      await db.query(`
        CREATE TABLE enrollment_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          student_number VARCHAR(20) NOT NULL,
          school_year_id INT NULL,
          semester_id INT NULL,
          course_id INT NULL,
          section_id INT NULL,
          enrollment_status VARCHAR(20) NOT NULL,
          transition_type VARCHAR(20) NOT NULL,
          import_id INT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_enrollment_history_term (student_number, school_year_id, semester_id),
          CONSTRAINT fk_eh_user FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
          CONSTRAINT fk_eh_import FOREIGN KEY (import_id)
            REFERENCES csv_imports(id) ON DELETE SET NULL ON UPDATE RESTRICT
        ) ENGINE=InnoDB
      `);
      console.log("- enrollment_history table created.");
    } else {
      console.log("- enrollment_history already exists, skipping.");
    }

    // Section/term snapshot captured on each session at login, so usage reports
    // always reflect the section a student was actually in when the session
    // happened — never their current (possibly since-changed) section.
    await addSessionSnapshotColumn("snapshot_course_id");
    await addSessionSnapshotColumn("snapshot_section_id");
    await addSessionSnapshotColumn("snapshot_school_year_id");
    await addSessionSnapshotColumn("snapshot_semester_id");

    console.log("✓ Enrollment transition migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error running enrollment transition migration:", err.message);
    process.exit(1);
  }
}

addEnrollmentTransition();
