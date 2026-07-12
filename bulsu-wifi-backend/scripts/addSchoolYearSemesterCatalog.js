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

async function constraintExists(table, constraintName) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, constraintName]
  );
  return row.c > 0;
}

async function addSchoolYearSemesterCatalog() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS school_years (
        id     INT AUTO_INCREMENT PRIMARY KEY,
        name   VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        UNIQUE KEY uq_school_years_name (name)
      )
    `);
    console.log("- school_years table ready.");

    await db.query(`
      CREATE TABLE IF NOT EXISTS semesters (
        id     INT AUTO_INCREMENT PRIMARY KEY,
        name   VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        UNIQUE KEY uq_semesters_name (name)
      )
    `);
    console.log("- semesters table ready.");

    if (!(await columnExists("users", "school_year"))) {
      console.log("- users.school_year already migrated, skipping backfill.");
      console.log("✓ School year / semester catalog migration complete!");
      process.exit(0);
    }

    if (!(await columnExists("users", "school_year_id"))) {
      await db.query("ALTER TABLE users ADD COLUMN school_year_id INT NULL AFTER school_year");
      console.log("- users.school_year_id column added.");
    }
    if (!(await columnExists("users", "semester_id"))) {
      await db.query("ALTER TABLE users ADD COLUMN semester_id INT NULL AFTER semester");
      console.log("- users.semester_id column added.");
    }

    await db.query(`
      INSERT INTO school_years (name, status)
      SELECT DISTINCT TRIM(school_year), 'active' FROM users
      WHERE school_year IS NOT NULL AND TRIM(school_year) <> ''
        AND TRIM(school_year) NOT IN (SELECT name FROM school_years)
    `);
    await db.query(`
      INSERT INTO semesters (name, status)
      SELECT DISTINCT TRIM(semester), 'active' FROM users
      WHERE semester IS NOT NULL AND TRIM(semester) <> ''
        AND TRIM(semester) NOT IN (SELECT name FROM semesters)
    `);
    console.log("- Backfilled school_years/semesters from existing free-text values.");

    await db.query(`
      UPDATE users u JOIN school_years sy ON sy.name = TRIM(u.school_year)
      SET u.school_year_id = sy.id WHERE u.school_year IS NOT NULL AND TRIM(u.school_year) <> ''
    `);
    await db.query(`
      UPDATE users u JOIN semesters s ON s.name = TRIM(u.semester)
      SET u.semester_id = s.id WHERE u.semester IS NOT NULL AND TRIM(u.semester) <> ''
    `);
    console.log("- users.school_year_id/semester_id backfilled.");

    if (!(await constraintExists("users", "fk_users_school_year_id"))) {
      await db.query(`
        ALTER TABLE users ADD CONSTRAINT fk_users_school_year_id FOREIGN KEY (school_year_id)
        REFERENCES school_years(id) ON DELETE SET NULL ON UPDATE RESTRICT
      `);
      console.log("- fk_users_school_year_id added.");
    }
    if (!(await constraintExists("users", "fk_users_semester_id"))) {
      await db.query(`
        ALTER TABLE users ADD CONSTRAINT fk_users_semester_id FOREIGN KEY (semester_id)
        REFERENCES semesters(id) ON DELETE SET NULL ON UPDATE RESTRICT
      `);
      console.log("- fk_users_semester_id added.");
    }

    await db.query("ALTER TABLE users DROP COLUMN school_year");
    await db.query("ALTER TABLE users DROP COLUMN semester");
    console.log("- users.school_year/semester (free-text) columns dropped.");

    console.log("✓ School year / semester catalog migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error migrating school year / semester catalog:", err.message);
    process.exit(1);
  }
}

addSchoolYearSemesterCatalog();
