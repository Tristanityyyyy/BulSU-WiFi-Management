require("dotenv").config();
const db = require("../db");

// Logins now create a `sessions` row without a real MAC address (there's no
// network-hardware integration yet to supply one) — make sure the column
// allows that instead of failing every login with a NOT NULL violation.
async function getColumnInfo(table, column) {
  const [[row]] = await db.query(
    `SELECT IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row;
}

async function relaxSessionsMacAddress() {
  try {
    const column = await getColumnInfo("sessions", "mac_address");
    if (!column) {
      console.log("- sessions.mac_address column not found, skipping.");
    } else if (column.IS_NULLABLE !== "YES") {
      // Reuse the column's existing type so this only changes nullability.
      await db.query(`ALTER TABLE sessions MODIFY COLUMN mac_address ${column.COLUMN_TYPE} NULL`);
      console.log("- sessions.mac_address made nullable.");
    } else {
      console.log("- sessions.mac_address already nullable, skipping.");
    }
    console.log("✓ Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error relaxing sessions.mac_address:", err.message);
    process.exit(1);
  }
}

relaxSessionsMacAddress();
