const db = require("../db");
const { getSettings, getRoleBandwidthMap } = require("./settings");
const { setQueueLimit, ENABLED } = require("./routeros");
const { CAPPED_ROLES } = require("./constants");

// What an emergency priority actually buys, now that it buys something.
//
// Priority 1 is the part that matters during congestion: a ceiling only decides
// how fast a client may go when there is capacity going spare, while priority
// decides who gets served when there isn't. The 0/0 speeds resolve to the
// unlimited headroom figure in routeros.js — high enough to shape nothing, low
// enough that RouterOS still installs the HTB class and keeps metering them.
//
// This is the *blanket* grant, used when an admin activated a priority without
// naming any figures. It is what every priority did before figures existed.
const EMERGENCY_LIMITS = { upMbps: 0, downMbps: 0, priority: 1 };

// A grant's figures are added to the role's, not substituted for them.
//
// One activation usually covers a mixed set — a section holds students and
// faculty on different entitlements — and an absolute figure would flatten them
// onto one number, silently demoting whoever was already better off. Adding
// keeps each person's baseline and gives everyone the same boost.
//
// Zero already means "unlimited" throughout this codebase (see UNLIMITED_MBPS in
// routeros.js), so adding to it must not turn it into a real ceiling: an
// unlimited role stays unlimited rather than becoming `0 + 5`.
function addMbps(base, extra) {
  const b = Number(base) || 0;
  if (b <= 0) return 0;
  return b + (Number(extra) || 0);
}

// The queue limits a prioritised session should be running at.
//
// `grant` is null when the admin named no figures, which is the blanket case:
// unlimited, exactly as before. Otherwise the role's own ceiling plus whatever
// was granted, still at priority 1 — the boost is about being served first as
// much as it is about headroom.
function emergencyLimitsFor(roleLimits, grant) {
  if (!grant) return EMERGENCY_LIMITS;
  return {
    upMbps: addMbps(roleLimits?.upMbps, grant.upMbps),
    downMbps: addMbps(roleLimits?.downMbps, grant.downMbps),
    priority: EMERGENCY_LIMITS.priority,
  };
}

// The daily cap a prioritised account should be held to, in GB.
//
// null means "do not cut this person off at all": either the admin named no
// figures (the blanket waiver this feature has always granted), or the role had
// no cap to begin with. A number means they are still capped, just higher —
// which is the point of granting an allocation rather than waiving the limit.
function emergencyDataCapGb(roleCapGb, grant) {
  if (!grant) return null;
  const base = Number(roleCapGb) || 0;
  if (base <= 0) return null;
  return base + (Number(grant.dataGb) || 0);
}

// Reads the three figures off a row into a grant, or null when none were named.
// A row with only some of them filled in is still a grant — an admin who granted
// data but no bandwidth meant exactly that, and the missing figures add nothing.
function grantFromRow(row) {
  const up = row.extra_up_mbps;
  const down = row.extra_down_mbps;
  const data = row.extra_data_gb;
  if (up == null && down == null && data == null) return null;
  return {
    upMbps: Number(up) || 0,
    downMbps: Number(down) || 0,
    dataGb: Number(data) || 0,
  };
}

// The master switch. Enforcement is on unless an admin has explicitly turned it
// off, so an activated priority is never silently inert — the state this feature
// spent its whole life in.
async function isEmergencyEnforced() {
  const { emergency_priority_mode: raw } = await getSettings(["emergency_priority_mode"]);
  return raw !== "false";
}

// Every account and guest holding an active priority right now, in one query —
// the data meter checks every session against these on each tick, so this must
// not become a per-session lookup.
//
// Maps rather than Sets, keyed by id, valued by grant (or null for a blanket
// one). `.has()` still answers "is this person prioritised", which is all most
// callers want; `.get()` answers "by how much".
//
// Returns empty maps when enforcement is switched off, which means the meter
// re-applies ordinary role limits on its next tick and the boost lifts on its
// own. Deactivating a priority unwinds the same way.
async function getActivePriorities() {
  if (!(await isEmergencyEnforced())) return { users: new Map(), guests: new Map() };
  const [rows] = await db.query(
    `SELECT user_id, guest_id, extra_up_mbps, extra_down_mbps, extra_data_gb
       FROM emergency_priority WHERE status = 'active'`
  );
  const users = new Map();
  const guests = new Map();
  for (const row of rows) {
    const grant = grantFromRow(row);
    if (row.user_id != null) users.set(row.user_id, grant);
    if (row.guest_id != null) guests.set(row.guest_id, grant);
  }
  return { users, guests };
}

// Single-account lookup for the login path, which has one user in hand and no
// reason to read the whole table. Returns undefined when there is no active
// priority — distinct from null, which is a real priority carrying no figures.
async function activePriorityGrant(userId) {
  if (!(await isEmergencyEnforced())) return undefined;
  const [[row]] = await db.query(
    `SELECT extra_up_mbps, extra_down_mbps, extra_data_gb
       FROM emergency_priority WHERE status = 'active' AND user_id = ? LIMIT 1`,
    [userId]
  );
  return row ? grantFromRow(row) : undefined;
}

// The guest sibling of the lookup above, for the voucher paths that hold one
// guest and have no reason to read the whole table. Same tri-state contract:
// undefined = no priority, null = a priority carrying no figures.
async function activeGuestPriorityGrant(guestId) {
  if (!(await isEmergencyEnforced())) return undefined;
  const [[row]] = await db.query(
    `SELECT extra_up_mbps, extra_down_mbps, extra_data_gb
       FROM emergency_priority WHERE status = 'active' AND guest_id = ? LIMIT 1`,
    [guestId]
  );
  return row ? grantFromRow(row) : undefined;
}

// Push a just-changed set of priorities onto the live queues now, rather than
// leaving it to the meter's next tick.
//
// This is not a second source of truth. It is the same resolution the meter
// runs, run early and only for the handful of people an admin just acted on —
// the meter still reconciles everything on its own schedule and will repair
// anything that fails here. Without it an activation took up to a full tick
// (two minutes by default) to reach the router, which during an emergency is
// precisely the wrong moment to be waiting.
//
// Deactivation calls this too: by then the rows read 'ended', so
// getActivePriorities() no longer returns them and the same resolution lands
// the role's ordinary limits back on the queue.
//
// Best-effort, like every other router call in this codebase — a return value
// nobody has to check, and never a throw. A router outage must not fail the
// activation that triggered it.
async function applyPrioritiesToLiveSessions(userIds = [], guestIds = []) {
  if (!ENABLED || (!userIds.length && !guestIds.length)) return 0;
  try {
    return await applyToQueues(userIds, guestIds);
  } catch (err) {
    console.error("Emergency queue apply failed (meter will retry):", err.message);
    return 0;
  }
}

async function applyToQueues(userIds, guestIds) {
  const priorities = await getActivePriorities();
  const bandwidth = await getRoleBandwidthMap([...CAPPED_ROLES, "guest"]);
  let applied = 0;

  // A role with no entry in the bandwidth map is skipped rather than sent through
  // as `undefined`, which toMaxLimit() would read as 0 and hand out as unlimited.
  const push = async (queueId, limits) => {
    if (!queueId || !limits) return;
    if (await setQueueLimit(queueId, limits)) applied++;
  };

  if (userIds.length) {
    const [rows] = await db.query(
      `SELECT aq.user_id, aq.queue_id, u.role
         FROM active_queues aq
         JOIN sessions s ON s.id = aq.session_id AND s.status = 'active'
         JOIN users u ON u.id = aq.user_id
        WHERE aq.user_id IN (?)`,
      [userIds]
    );
    for (const row of rows) {
      const roleLimits = bandwidth[row.role];
      await push(
        row.queue_id,
        priorities.users.has(row.user_id)
          ? emergencyLimitsFor(roleLimits, priorities.users.get(row.user_id))
          : roleLimits
      );
    }
  }

  if (guestIds.length) {
    const [rows] = await db.query(
      `SELECT guest_id, queue_id FROM guest_sessions
        WHERE status = 'active' AND queue_id IS NOT NULL AND guest_id IN (?)`,
      [guestIds]
    );
    for (const row of rows) {
      await push(
        row.queue_id,
        priorities.guests.has(row.guest_id)
          ? emergencyLimitsFor(bandwidth.guest, priorities.guests.get(row.guest_id))
          : bandwidth.guest
      );
    }
  }

  return applied;
}

module.exports = {
  EMERGENCY_LIMITS,
  emergencyLimitsFor,
  emergencyDataCapGb,
  isEmergencyEnforced,
  getActivePriorities,
  activePriorityGrant,
  activeGuestPriorityGrant,
  applyPrioritiesToLiveSessions,
};
