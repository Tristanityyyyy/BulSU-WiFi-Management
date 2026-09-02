require("dotenv").config();
const db = require("../db");

// Lets an emergency priority carry a *size* rather than being all-or-nothing.
//
// Until now activating one meant unlimited bandwidth and the daily cap waived
// outright — the only grant the feature could make. These three columns let the
// admin say how much instead, and they are additive: the figure is layered on
// top of whatever the person's role already gives them, so one setting is
// correct across a mixed selection. A section holding students and faculty
// grants each of them their own baseline plus the same boost, rather than
// flattening both onto one number and quietly demoting the faculty.
//
// NULL keeps the old meaning. Every priority already in the table therefore
// carries on behaving exactly as it does today, and an admin in a hurry can
// still leave the fields empty and get the blanket grant.
//
// Idempotent: guarded by information_schema.

async function columnExists(column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'emergency_priority' AND COLUMN_NAME = ?`,
    [column]
  );
  return row.c > 0;
}

async function addColumnIfMissing(column, ddl) {
  if (await columnExists(column)) {
    console.log(`- emergency_priority.${column} already exists, skipping.`);
    return;
  }
  await db.query(`ALTER TABLE emergency_priority ADD COLUMN ${ddl}`);
  console.log(`- added emergency_priority.${column}.`);
}

async function run() {
  await addColumnIfMissing("extra_up_mbps", "extra_up_mbps DECIMAL(6,2) NULL AFTER reason");
  await addColumnIfMissing("extra_down_mbps", "extra_down_mbps DECIMAL(6,2) NULL AFTER extra_up_mbps");
  await addColumnIfMissing("extra_data_gb", "extra_data_gb DECIMAL(6,2) NULL AFTER extra_down_mbps");

  const [[{ blanket }]] = await db.query(
    `SELECT COUNT(*) AS blanket FROM emergency_priority
      WHERE status = 'active' AND extra_up_mbps IS NULL AND extra_down_mbps IS NULL AND extra_data_gb IS NULL`
  );
  console.log(`- ${blanket} active priority row(s) carry no figures and keep the blanket grant.`);
}

run()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
  });
