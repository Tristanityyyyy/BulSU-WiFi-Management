require("dotenv").config();
const db = require("../db");

// One-off migration bringing every pre-existing account number up to the 10-digit rule
// now enforced on account creation and roster import (see utils/constants.js).
//
// Safe to re-run: it only touches rows that don't already match ^\d{10}$, so a second
// run is a no-op. Admins are skipped on purpose — their student_number column holds a
// login *username* ("ADMIN001"), which the Settings screen labels as such and which the
// 10-digit rule was never meant to cover.
//
// Passwords are deliberately not re-derived. derivePassword() only falls back to
// student_number when birth_date is missing, and every account here has a birth date,
// so renumbering cannot change anyone's password.

const DRY_RUN = process.argv.includes("--dry-run");

// "2025041" -> "2025000041": keep the 4-digit year prefix, zero-pad the sequence to 6.
const yearPlusSequence = (value) => `${value.slice(0, 4)}${value.slice(4).padStart(6, "0")}`;

function planFor(value) {
  const digits = value.replace(/^0+/, ""); // "02000315393" -> "2000315393"
  if (/^\d{10}$/.test(digits)) return { to: digits, why: "dropped leading zero(s)" };
  if (/^\d{5,9}$/.test(value)) return { to: yearPlusSequence(value), why: "year prefix + padded sequence" };
  return null; // too short / non-numeric to map mechanically — handled by OVERRIDES
}

// Accounts with no derivable pattern get an explicit destination.
const OVERRIDES = {
  2000: "2025000081", // 4-digit test-era number, slotted after the 2025041-2025080 block
};

async function main() {
  const [rows] = await db.query(
    "SELECT id, student_number, full_name, role FROM users WHERE role != 'admin' ORDER BY student_number"
  );

  const changes = [];
  const unmapped = [];
  for (const row of rows) {
    const current = row.student_number.trim();
    if (/^\d{10}$/.test(current)) continue; // already conforms
    const override = OVERRIDES[current];
    const plan = override ? { to: override, why: "explicit override" } : planFor(current);
    if (!plan) { unmapped.push(row); continue; }
    changes.push({ ...row, from: current, ...plan });
  }

  if (unmapped.length) {
    console.error("✗ Aborted — no mapping rule for these account(s). Add them to OVERRIDES:");
    unmapped.forEach((r) => console.error(`    id=${r.id}  "${r.student_number}"  ${r.full_name}`));
    process.exit(1);
  }

  // Every destination must be unique and must not collide with a number already in use
  // by an account we're not touching. The UNIQUE index would catch it, but failing here
  // means we never open a transaction that we'd have to roll back.
  const destinations = new Set();
  const movingIds = new Set(changes.map((c) => c.id));
  for (const c of changes) {
    if (destinations.has(c.to)) {
      console.error(`✗ Aborted — two accounts both map to ${c.to}.`);
      process.exit(1);
    }
    destinations.add(c.to);
  }
  const [collisions] = destinations.size
    ? await db.query(
        `SELECT id, student_number FROM users WHERE student_number IN (${[...destinations].map(() => "?").join(",")})`,
        [...destinations]
      )
    : [[]];
  const blocking = collisions.filter((c) => !movingIds.has(c.id));
  if (blocking.length) {
    console.error("✗ Aborted — destination number(s) already taken by accounts not being moved:");
    blocking.forEach((c) => console.error(`    id=${c.id}  ${c.student_number}`));
    process.exit(1);
  }

  console.log(`${changes.length} account(s) to renumber:\n`);
  changes.forEach((c) => console.log(`  ${c.from.padEnd(12)} -> ${c.to.padEnd(12)} ${c.full_name} (${c.why})`));

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    process.exit(0);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let feedbackUpdated = 0;
    let historyUpdated = 0;
    for (const c of changes) {
      await conn.query("UPDATE users SET student_number=? WHERE id=?", [c.to, c.id]);
      // Two tables keep a denormalized copy of the number rather than joining on user_id;
      // they have to move in lockstep or the rows orphan.
      const [f] = await conn.query("UPDATE feedback SET student_number=? WHERE student_number=?", [c.to, c.from]);
      const [h] = await conn.query("UPDATE enrollment_history SET student_number=? WHERE student_number=?", [c.to, c.from]);
      feedbackUpdated += f.affectedRows;
      historyUpdated += h.affectedRows;
    }
    await conn.commit();
    console.log(`\n- users renumbered: ${changes.length}`);
    console.log(`- feedback rows realigned: ${feedbackUpdated}`);
    console.log(`- enrollment_history rows realigned: ${historyUpdated}`);
  } catch (err) {
    await conn.rollback();
    console.error("\n✗ Rolled back — nothing was changed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }

  const [[check]] = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(student_number REGEXP '^[0-9]{10}$') AS conforming,
            COUNT(DISTINCT student_number) AS distinct_numbers
     FROM users WHERE role != 'admin'`
  );
  console.log(`\nverify: ${check.conforming}/${check.total} non-admin accounts are 10 digits, ${check.distinct_numbers} distinct.`);
  console.log(Number(check.conforming) === Number(check.total) ? "✓ Migration complete!" : "✗ Some accounts still do not conform.");
  process.exit(Number(check.conforming) === Number(check.total) ? 0 : 1);
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
