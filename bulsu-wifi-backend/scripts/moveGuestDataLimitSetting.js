require("dotenv").config();
const db = require("../db");

// Reconciles the two names the guest data allowance was known by.
//
// Settings → Network wrote `data_cap_gb_guest`, because guests sat in the
// per-role "Data Cap per Day" table. Nothing ever read it: every backend reader
// iterates CAPPED_ROLES, which is student/faculty/staff, and a guest has neither
// an account nor a second day — their allowance is a total carried by the
// voucher and metered against `guests.data_limit_gb`.
//
// Meanwhile the Guest Access page read `guest_data_limit_gb` to pre-fill a new
// voucher, and nothing ever wrote that. So the admin's configured figure went
// into a key no one read, and the form fell back to its hardcoded 1 GB.
//
// One name survives — `guest_data_limit_gb`, the one the form already asks for —
// and the value the admin actually set is carried across to it rather than being
// silently reset.
//
// Idempotent: the copy only fills a key that is missing, and the delete is a
// no-op once the old row is gone.

async function run() {
  const [[oldRow]] = await db.query("SELECT value FROM settings WHERE `key` = 'data_cap_gb_guest'");
  const [[newRow]] = await db.query("SELECT value FROM settings WHERE `key` = 'guest_data_limit_gb'");

  if (newRow) {
    console.log(`- guest_data_limit_gb already set to ${newRow.value}, leaving it alone.`);
  } else if (oldRow) {
    await db.query(
      "INSERT INTO settings (`key`, `value`) VALUES ('guest_data_limit_gb', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
      [oldRow.value]
    );
    console.log(`- carried ${oldRow.value} over from data_cap_gb_guest to guest_data_limit_gb.`);
  } else {
    // Neither key stored: the form's own fallback covers this, and writing a
    // value here would invent a policy the admin never chose.
    console.log("- neither key was stored; nothing to carry over.");
  }

  const [res] = await db.query("DELETE FROM settings WHERE `key` = 'data_cap_gb_guest'");
  console.log(
    res.affectedRows
      ? "- removed the unread data_cap_gb_guest setting."
      : "- data_cap_gb_guest was not stored, skipping."
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
