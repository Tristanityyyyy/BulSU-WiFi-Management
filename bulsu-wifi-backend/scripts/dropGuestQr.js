require("dotenv").config();
const db = require("../db");

// Retires the QR half of a guest pass, now that a voucher code is the whole
// credential.
//
// Two things go:
//
//   guests.token          — the long random string a QR code encoded. Nothing
//                           reads it any more: the portal resolves a pass by
//                           `code` alone, and no screen renders a QR to carry
//                           it. Dropping it takes its unique index with it.
//
//   settings.session_timeout_guest — a control that looked live and governed
//                           nothing. Guest sessions never ran on a role-wide
//                           timeout; each voucher carries its own start and
//                           expiry, and jobs/guestExpiry.js ends the session on
//                           that. Every reader of session_timeout_* takes its
//                           role from `sessions`/`users`, so no guest ever
//                           reached this value. Leaving it in place only invites
//                           someone to set it and expect something to happen.
//
// The vouchers themselves are kept — passes already issued stay usable.
//
// Idempotent: both steps check before acting, so re-running is a no-op.

async function columnExists(table, column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row.c > 0;
}

async function run() {
  // A voucher-less pass would be unreachable once the token is gone, so refuse
  // to strip the only credential a row has left.
  const [[{ orphans }]] = await db.query(
    "SELECT COUNT(*) AS orphans FROM guests WHERE code IS NULL OR code = ''"
  );
  if (orphans > 0) {
    throw new Error(
      `${orphans} guest pass(es) have no voucher code. Run scripts/addGuestShortCode.js first — dropping the token now would leave them with no way in.`
    );
  }

  if (await columnExists("guests", "token")) {
    await db.query("ALTER TABLE guests DROP COLUMN token");
    console.log("- dropped guests.token (its unique index went with it).");
  } else {
    console.log("- guests.token is already gone, skipping.");
  }

  const [res] = await db.query("DELETE FROM settings WHERE `key` = 'session_timeout_guest'");
  console.log(
    res.affectedRows
      ? "- removed the session_timeout_guest setting."
      : "- session_timeout_guest was not stored, skipping."
  );
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
