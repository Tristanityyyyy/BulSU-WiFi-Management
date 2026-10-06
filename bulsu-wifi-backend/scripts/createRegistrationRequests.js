require('dotenv').config();
const db = require('../db');

async function columnExists(column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'registration_requests' AND COLUMN_NAME = ?`,
    [column]
  );
  return row.c > 0;
}

async function ensureColumn(column, definition) {
  if (await columnExists(column)) return;
  await db.query(`ALTER TABLE registration_requests ADD COLUMN ${column} ${definition}`);
  console.log(`- registration_requests.${column} added.`);
}

async function createRegistrationRequests() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS registration_requests (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        student_number VARCHAR(50) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(254) NULL,
        role ENUM('student', 'faculty', 'staff') NOT NULL DEFAULT 'student',
        birth_date DATE NOT NULL,
        course_id INT NULL,
        section_id INT NULL,
        year_level INT NULL,
        accepted_terms_at DATETIME NOT NULL,
        status ENUM('pending', 'approved', 'denied') NOT NULL DEFAULT 'pending',
        email_status ENUM('pending', 'sent', 'failed') NULL,
        email_error VARCHAR(500) NULL,
        email_sent_at DATETIME NULL,
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        user_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_registration_requests_status_created (status, created_at),
        INDEX idx_registration_requests_student_status (student_number, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn('email', 'VARCHAR(254) NULL AFTER full_name');
    await ensureColumn("role", "ENUM('student', 'faculty', 'staff') NOT NULL DEFAULT 'student' AFTER email");
    await ensureColumn('year_level', 'INT NULL AFTER section_id');
    await ensureColumn("email_status", "ENUM('pending', 'sent', 'failed') NULL AFTER status");
    await ensureColumn('email_error', 'VARCHAR(500) NULL AFTER email_status');
    await ensureColumn('email_sent_at', 'DATETIME NULL AFTER email_error');
    await db.query(
      'ALTER TABLE registration_requests MODIFY COLUMN course_id INT NULL, MODIFY COLUMN section_id INT NULL, MODIFY COLUMN year_level INT NULL'
    );

    if (await columnExists('password_hash')) {
      await db.query('UPDATE registration_requests SET password_hash = NULL');
      await db.query('ALTER TABLE registration_requests DROP COLUMN password_hash');
      console.log('- Removed stored request password hashes.');
    }
    console.log('Registration requests table ready.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating registration requests table:', err.message);
    process.exit(1);
  }
}

createRegistrationRequests();