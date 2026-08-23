const db = require("../db");
const { getSettings, getRoleSessionMinutesMap } = require("../utils/settings");
const { readNetworkPresence, ENABLED } = require("../utils/routeros");
const { endSession, endGuestSession } = require("../utils/sessions");
const { normalizeIp, isGrantableIp } = require("../utils/ip");

// How long a device may stay unseen by the router before its session is ended.
// Not zero, and not one tick: a phone dropping off for a few seconds while it
// roams, sleeps or re-associates is normal, and killing the session for that
// would log people out mid-browse. Admin-tunable via Settings; 0 turns
// presence-based disconnect off and leaves only the timeout backstop below.
const DEFAULT_GRACE_MINUTES = 5;

async function getGraceMinutes() {
  const { presence_grace_minutes: raw } = await getSettings(["presence_grace_minutes"]);
  const minutes = Number(raw);
  return raw === undefined || raw === "" || !Number.isFinite(minutes) || minutes < 0
    ? DEFAULT_GRACE_MINUTES
    : minutes;
}

// Is the device behind this session's IP still on the network?
//
// Judged on the IP's *current* MAC, never on the one recorded at login: if DHCP
// has since handed that address to somebody else, the original device is gone
// even though the address is very much alive. A session whose recorded MAC no
// longer matches the address is therefore absent, not present.
//
// Returns null for an address the router can't hold a lease for — a loopback
// login from the portal laptop's own browser has no router footprint at all, so
// there is nothing to be present or absent about. Those are left to the timeout.
function devicePresence(presence, row) {
  const ip = normalizeIp(row.ip_address);
  if (!isGrantableIp(ip)) return null;
  const current = presence.macByIp.get(ip) || null;
  const recorded = row.mac_address ? row.mac_address.toUpperCase() : null;
  const present = !!current && presence.liveMacs.has(current) && (!recorded || recorded === current);
  return { mac: current, present };
}

// Ends every session whose device has been gone longer than the grace window,
// and refreshes last_seen for the ones still here. Returns the number ended.
//
// The router being unreachable is NOT evidence that everybody left, so a failed
// read skips the whole phase — otherwise a momentary API outage would disconnect
// every user on campus at once.
async function sweepDepartedDevices(graceMinutes) {
  if (!ENABLED || graceMinutes <= 0) return 0;
  const presence = await readNetworkPresence();
  if (!presence) return 0;

  const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);
  let ended = 0;

  const sweep = async (rows, { seen, learnMac, end }) => {
    for (const row of rows) {
      const state = devicePresence(presence, row);
      if (!state) continue;
      if (state.present) {
        await seen(row.id);
        // Fill in the MAC the first time we can tie one to this session, so a
        // later DHCP reassignment of the same address is detectable above.
        if (state.mac && !row.mac_address) await learnMac(row.id, state.mac);
        continue;
      }
      // last_seen is never NULL in practice (the column defaults to the insert
      // time and the migration backfilled it), but a NULL would otherwise make
      // this comparison false and pin the session open forever.
      if (row.last_seen && new Date(row.last_seen) > cutoff) continue;
      if (await end(row.id)) ended++;
    }
  };

  const [userRows] = await db.query(
    "SELECT id, ip_address, mac_address, last_seen FROM sessions WHERE status = 'active'"
  );
  await sweep(userRows, {
    seen: (id) => db.query("UPDATE sessions SET last_seen = NOW() WHERE id = ?", [id]),
    learnMac: (id, mac) => db.query("UPDATE sessions SET mac_address = ? WHERE id = ?", [mac, id]),
    end: async (id) => Boolean(await endSession(id, { reason: "device_disconnected", status: "disconnected" })),
  });

  const [guestRows] = await db.query(
    "SELECT id, ip_address, mac_address, last_seen FROM guest_sessions WHERE status = 'active'"
  );
  await sweep(guestRows, {
    seen: (id) => db.query("UPDATE guest_sessions SET last_seen = NOW() WHERE id = ?", [id]),
    learnMac: (id, mac) => db.query("UPDATE guest_sessions SET mac_address = ? WHERE id = ?", [mac, id]),
    end: async (id) => {
      const session = await endGuestSession(id, { status: "disconnected" });
      return Boolean(session && session.ended);
    },
  });

  return ended;
}

// The backstop. Settings → Network has carried a per-role session timeout since
// the beginning, and the student dashboard counts down against it — but nothing
// ever acted on it, so a session that reached 0:00 simply stayed active. This
// enforces it, and it runs whether or not the router can be reached, which makes
// it the one guarantee that no session lives forever.
async function sweepTimedOutSessions() {
  const [rows] = await db.query(
    `SELECT s.id, s.login_time, u.role
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active'`
  );
  if (!rows.length) return 0;

  // A session whose account was hard-deleted keeps its row (the FK is ON DELETE
  // SET NULL) and still needs sweeping, so an absent role resolves to the student
  // window rather than leaving the session active in perpetuity.
  const roles = [...new Set(rows.map((r) => r.role || "student"))];
  const windows = await getRoleSessionMinutesMap(roles);

  let ended = 0;
  for (const row of rows) {
    const minutes = windows[row.role || "student"];
    if (Date.now() - new Date(row.login_time).getTime() < minutes * 60 * 1000) continue;
    if (await endSession(row.id, { reason: "timeout", status: "timeout" })) ended++;
  }
  return ended;
}

async function sweepSessionPresence() {
  const graceMinutes = await getGraceMinutes();
  const departed = await sweepDepartedDevices(graceMinutes);
  const timedOut = await sweepTimedOutSessions();
  return { departed, timedOut };
}

function startSessionPresenceSweeper(intervalMs = 60 * 1000) {
  // Ending a session costs a router round-trip (8s timeout) each, so a sweep
  // with several departures can outlast the interval. Skip rather than overlap:
  // two sweeps would both read the same 'active' rows and race on ending them.
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { departed, timedOut } = await sweepSessionPresence();
      if (departed || timedOut) {
        console.log(`Session sweep: ${departed} disconnected device(s), ${timedOut} timed out.`);
      }
    } catch (err) {
      console.error("Session presence sweep failed:", err);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { sweepSessionPresence, sweepDepartedDevices, sweepTimedOutSessions, startSessionPresenceSweeper };
