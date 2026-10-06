require('dotenv').config();
const db = require('../db');

async function createRegistrationRequests() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS registration_requests (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        student_number VARCHAR(50) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        birth_date DATE NOT NULL,
        course_id INT NOT NULL,
        section_id INT NOT NULL,
        year_level INT NOT NULL,
        password_hash VARCHAR(255) NULL,
        accepted_terms_at DATETIME NOT NULL,
        status ENUM('pending', 'approved', 'denied') NOT NULL DEFAULT 'pending',
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        user_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_registration_requests_status_created (status, created_at),
        INDEX idx_registration_requests_student_status (student_number, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('Registration requests table ready.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating registration requests table:', err.message);
    process.exit(1);
  }
}

createRegistrationRequests();