require("dotenv").config();
const db = require("../db");

// Turns a guest pass from a one-shot credential into one with a seat count.
//
// `max_uses` is how many guests the pass admits, `uses` how many have taken a
// place. Both default so that every pass already issued keeps behaving exactly
// as it did: one seat, spent on first connect.
//
// A seat is spent when it is claimed and never returned — a visitor who
// connected and went home has still had their turn, and handing their place to
// the next person would quietly reopen a pass the admin considers finished.
// That is why the backfill counts guest_sessions rows outright rather than only
// the ones still active.
//
// Idempotent: guarded by information_schema, and the backfill only touches rows
// that have not been counted yet.

async function columnExists(column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guests' AND COLUMN_NAME = ?`,
    [column]
  );
  return row.c > 0;
}

async function addColumnIfMissing(column, ddl) {
  if (await columnExists(column)) {
    console.log(`- guests.${column} already exists, skipping.`);
    return false;
  }
  await db.query(`ALTER TABLE guests ADD COLUMN ${ddl}`);
  console.log(`- added guests.${column}.`);
  return true;
}

async function run() {
  await addColumnIfMissing("max_uses", "max_uses INT NOT NULL DEFAULT 1 AFTER data_limit_gb");
  const addedUses = await addColumnIfMissing("uses", "uses INT NOT NULL DEFAULT 0 AFTER max_uses");

  if (!addedUses) {
    console.log("- guests.uses was already present, leaving the counts alone.");
    return;
  }

  // Only runs on the migration that introduces the column, so it cannot
  // double-count a pass on a re-run.
  const [res] = await db.query(
    `UPDATE guests g
        SET g.uses = (SELECT COUNT(*) FROM guest_sessions gs WHERE gs.guest_id = g.id)`
  );
  console.log(`- counted existing claims on ${res.affectedRows} pass(es).`);

  // A pass that somehow admitted more guests than its new default allows would
  // otherwise read as over-subscribed the moment the column lands.
  const [widened] = await db.query("UPDATE guests SET max_uses = uses WHERE uses > max_uses");
  if (widened.affectedRows) console.log(`- widened ${widened.affectedRows} pass(es) to match what they already admitted.`);
}

run()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
