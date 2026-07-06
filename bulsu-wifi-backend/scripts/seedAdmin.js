require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("../db");

async function seedAdmin() {
  try {
    const adminPassword = "Admin@123";
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Check if admin already exists
    const [[existingAdmin]] = await db.query(
      "SELECT id FROM users WHERE birth_date = ? OR student_number = ?",
      ["admin", "ADMIN001"]
    );

    if (existingAdmin) {
      console.log("✓ Admin user already exists!");
      process.exit(0);
    }

    // Insert admin user
    const [result] = await db.query(
      `INSERT INTO users (student_number, full_name, birth_date, password_hash, role, status, enrollment_status, course_section) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "ADMIN001",           // student_number
        "Administrator,",      // full_name
        "2026-12-02",        // birth_date
        hashedPassword,       // password_hash
        "admin",              // role
        "active",             // status
        "enrolled",           // enrollment_status
        "Admin"               // course_section
      ]
    );

    console.log("✓ Admin account created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Student Number: ADMIN001");
    console.log("Password: Admin@123");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding admin:", err.message);
    process.exit(1);
  }
}

seedAdmin();
