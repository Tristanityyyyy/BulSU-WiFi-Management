require("dotenv").config();
const db = require("../db");
const { generateGuestCode, CODE_LENGTH } = require("../utils/guestCode");

// Adds guests.code — the short, typeable form of a guest pass — and gives every
// existing row one. See utils/guestCode.js for why a second credential exists at
// all. Idempotent: guarded by information_schema, and the backfill only touches
// rows that are still missing a code, so re-running is a no-op.

async function columnExists(column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guests' AND COLUMN_NAME = ?`,
    [column]
  );
  return row.c > 0;
}

async function indexExists(name) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guests' AND INDEX_NAME = ?`,
    [name]
  );
  return row.c > 0;
}

// Nullable on purpose. The unique index has to go on before the backfill so the
// codes it writes cannot collide, and MySQL lets a UNIQUE column hold any number
// of NULLs — which is exactly the window the backfill runs in.
async function run() {
  if (await columnExists("code")) {
    console.log("- guests.code already exists, skipping.");
  } else {
    await db.query(`ALTER TABLE guests ADD COLUMN code VARCHAR(${CODE_LENGTH}) NULL AFTER token`);
    console.log("- added guests.code.");
  }

  if (await indexExists("uniq_guests_code")) {
    console.log("- uniq_guests_code already exists, skipping.");
  } else {
    await db.query("ALTER TABLE guests ADD UNIQUE KEY uniq_guests_code (code)");
    console.log("- added unique index uniq_guests_code.");
  }

  const [rows] = await db.query("SELECT id FROM guests WHERE code IS NULL OR code = ''");
  if (!rows.length) {
    console.log("- every guest row already has a code, nothing to backfill.");
    return;
  }

  let filled = 0;
  for (const { id } of rows) {
    // The unique index is the arbiter, not a pre-check: two runs racing would
    // both pass a SELECT. Retry on the duplicate instead.
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await db.query("UPDATE guests SET code = ? WHERE id = ?", [generateGuestCode(), id]);
        filled++;
        break;
      } catch (err) {
        if (err.code !== "ER_DUP_ENTRY") throw err;
        if (attempt === 9) throw new Error(`Could not find a free code for guest ${id}.`);
      }
    }
  }
  console.log(`- backfilled ${filled} guest code(s).`);
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
