const db = require("../db");
const { getSettings } = require("./settings");

// What an emergency priority actually buys, now that it buys something.
//
// Priority 1 is the part that matters during congestion: a ceiling only decides
// how fast a client may go when there is capacity going spare, while priority
// decides who gets served when there isn't. The 0/0 speeds resolve to the
// unlimited headroom figure in routeros.js — high enough to shape nothing, low
// enough that RouterOS still installs the HTB class and keeps metering them.
const EMERGENCY_LIMITS = { upMbps: 0, downMbps: 0, priority: 1 };

// The master switch. Enforcement is on unless an admin has explicitly turned it
// off, so an activated priority is never silently inert — the state this feature
// spent its whole life in.
async function isEmergencyEnforced() {
  const { emergency_priority_mode: raw } = await getSettings(["emergency_priority_mode"]);
  return raw !== "false";
}

// Every account and guest holding an active priority right now, as id Sets, in
// one query — the data meter checks every session against these on each tick, so
// this must not become a per-session lookup.
//
// Returns empty sets when enforcement is switched off, which means the meter
// re-applies ordinary role limits on its next tick and the boost lifts on its
// own. Deactivating a priority unwinds the same way.
async function getActivePriorities() {
  if (!(await isEmergencyEnforced())) return { users: new Set(), guests: new Set() };
  const [rows] = await db.query(
    "SELECT user_id, guest_id FROM emergency_priority WHERE status = 'active'"
  );
  const users = new Set();
  const guests = new Set();
  for (const row of rows) {
    if (row.user_id != null) users.add(row.user_id);
    if (row.guest_id != null) guests.add(row.guest_id);
  }
  return { users, guests };
}

// Single-account check for the login path, which has one user in hand and no
// reason to read the whole table.
async function hasActivePriority(userId) {
  if (!(await isEmergencyEnforced())) return false;
  const [[row]] = await db.query(
    "SELECT id FROM emergency_priority WHERE status = 'active' AND user_id = ? LIMIT 1",
    [userId]
  );
  return Boolean(row);
}

module.exports = { EMERGENCY_LIMITS, isEmergencyEnforced, getActivePriorities, hasActivePriority };
