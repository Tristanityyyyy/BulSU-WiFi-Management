require("dotenv").config();
const db = require("../db");
const { normalizeIp, isGrantableIp } = require("../utils/ip");

// One-off migration rewriting stored client addresses into the same spelling the
// RouterOS API uses. The backend listens on a dual-stack socket, so `req.ip` was
// an IPv4-mapped IPv6 address ("::ffff:192.168.88.253") and that is what landed in
// these columns. The routes now normalize on the way in (utils/ip.js), but rows
// written before that keep the old form.
//
// Nothing is broken by leaving them — utils/routeros.js normalizes defensively on
// read, precisely because of these rows. This exists so the stored data matches
// what the code now writes, which matters for one thing in particular: the
// "same device reconnecting" lookup in authRoutes compares a freshly-normalized
// req.ip against sessions.ip_address with `=`, and a legacy row never matches.
//
// Safe to re-run: normalizeIp() is idempotent, so a second run finds nothing.

const DRY_RUN = process.argv.includes("--dry-run");

// Every table that stores a client address. guest_sessions/active_queues are
// typically empty on a system that predates the guest metering work, but they're
// written by the same request paths so they get the same treatment.
const TABLES = ["sessions", "guest_sessions", "active_queues"];

async function main() {
  // active_queues is keyed by session_id, not id — resolve the PK per table once
  // rather than assuming.
  const pkFor = {};
  for (const table of TABLES) {
    const [cols] = await db.query(`SHOW COLUMNS FROM ${table}`);
    const pk = cols.find((c) => c.Key === "PRI");
    if (!pk) throw new Error(`${table} has no primary key — refusing to update by guess`);
    pkFor[table] = pk.Field;
  }

  const plans = {};
  let total = 0;
  for (const table of TABLES) {
    const [rows] = await db.query(
      `SELECT ${pkFor[table]} AS pk, ip_address FROM ${table} WHERE ip_address IS NOT NULL`
    );
    plans[table] = rows
      .map((r) => ({ pk: r.pk, from: r.ip_address, to: normalizeIp(r.ip_address) }))
      .filter((c) => c.to !== c.from);
    total += plans[table].length;
  }

  if (!total) {
    console.log("Nothing to do — every stored address is already normalized.");
    process.exit(0);
  }

  for (const table of TABLES) {
    const changes = plans[table];
    if (!changes.length) continue;
    // Collapse to from->to pairs for the summary; individual rows are uninteresting.
    const pairs = new Map();
    changes.forEach((c) => pairs.set(`${c.from} -> ${c.to}`, (pairs.get(`${c.from} -> ${c.to}`) || 0) + 1));
    console.log(`\n${table} (${pkFor[table]}): ${changes.length} row(s)`);
    [...pairs.entries()].sort().forEach(([pair, n]) => console.log(`  ${String(n).padStart(4)} x  ${pair}`));
  }

  // The varchar(15) era truncated some addresses before the column was widened to
  // varchar(45): "::ffff:192.168.88.253" was stored as "::ffff:192.168.". Those
  // don't match the mapped-address pattern, so normalizeIp() leaves them alone and
  // they never appear in a plan above — report them separately rather than let
  // them look like rows this script forgot. The original value is unrecoverable;
  // they belong to closed sessions and match no live client either way.
  const unusable = [];
  for (const table of TABLES) {
    const [rows] = await db.query(
      `SELECT ${pkFor[table]} AS pk, ip_address FROM ${table} WHERE ip_address IS NOT NULL`
    );
    rows.forEach((r) => {
      const to = normalizeIp(r.ip_address);
      if (!isGrantableIp(to) && to !== "127.0.0.1") unusable.push({ table, pk: r.pk, value: r.ip_address });
    });
  }
  if (unusable.length) {
    console.log(`\nNote — ${unusable.length} row(s) hold an address that cannot be repaired:`);
    unusable.forEach((c) => console.log(`  ${c.table} ${c.pk}: "${c.value}"`));
    console.log("  (truncated by the old varchar(15) column — left as-is, harmless)");
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run: nothing written. ${total} row(s) would change.`);
    process.exit(0);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let written = 0;
    for (const table of TABLES) {
      for (const c of plans[table]) {
        const [res] = await conn.query(
          `UPDATE ${table} SET ip_address=? WHERE ${pkFor[table]}=?`,
          [c.to, c.pk]
        );
        written += res.affectedRows;
      }
    }
    await conn.commit();
    console.log(`\n- rows updated: ${written}`);
  } catch (err) {
    await conn.rollback();
    console.error("\n✗ Rolled back — nothing was changed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }

  // Success means "no row would change if this ran again" — the same predicate the
  // plan uses. A raw `LIKE '::%'` would count the unrepairable truncated rows above
  // and report failure for data this script deliberately left alone.
  let leftover = 0;
  for (const table of TABLES) {
    const [rows] = await db.query(`SELECT ip_address FROM ${table} WHERE ip_address IS NOT NULL`);
    leftover += rows.filter((r) => normalizeIp(r.ip_address) !== r.ip_address).length;
  }
  console.log(`verify: ${leftover} row(s) would still change on a re-run.`);
  console.log(leftover === 0 ? "✓ Migration complete!" : "✗ Some rows were not normalized.");
  process.exit(leftover === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
