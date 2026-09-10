const db = require('../db');
const { DEFAULT_SESSION_TIMEOUT_MIN } = require('./constants');

// Looks up specific keys from the generic settings table, returning only what's
// actually stored — callers apply their own defaults for missing keys.
async function getSettings(keys) {
  if (!keys.length) return {};
  const [rows] = await db.query(
    `SELECT \`key\`, \`value\` FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`,
    keys
  );
  const result = {};
  rows.forEach((r) => { result[r.key] = r.value; });
  return result;
}

// Fallback speeds (Mbps) used until the admin saves Settings → Network at least
// once. Same numbers the admin panel seeds itself with, so the router and the
// UI never disagree about what an unsaved role is entitled to.
const DEFAULT_BANDWIDTH_MBPS = {
  student: { up: 2, down: 5 },
  faculty: { up: 5, down: 10 },
  staff: { up: 5, down: 10 },
  guest: { up: 1, down: 2 },
};

const toMbps = (raw, fallback) => {
  const n = Number(raw);
  return raw === undefined || raw === '' || Number.isNaN(n) || n < 0 ? fallback : n;
};

// Per-role upload/download ceilings in Mbps, for every role in `roles`, in a
// single query. 0 is a legitimate stored value meaning "unlimited" — routeros.js
// decides how to express that on the router, not us.
async function getRoleBandwidthMap(roles) {
  const keys = roles.flatMap((r) => [`bandwidth_upload_${r}`, `bandwidth_download_${r}`]);
  const stored = await getSettings(keys);
  const map = {};
  for (const role of roles) {
    const d = DEFAULT_BANDWIDTH_MBPS[role] || { up: 0, down: 0 };
    map[role] = {
      upMbps: toMbps(stored[`bandwidth_upload_${role}`], d.up),
      downMbps: toMbps(stored[`bandwidth_download_${role}`], d.down),
    };
  }
  return map;
}

async function getRoleBandwidth(role) {
  return (await getRoleBandwidthMap([role]))[role];
}

// Session window in minutes for every role in `roles`, in a single query. A
// stored 0 (or blank, or junk) falls back to the default rather than meaning
// "expire immediately" — which is how login and the session sweeper have always
// read it, and now how the dashboard countdown reads it too.
async function getRoleSessionMinutesMap(roles) {
  const stored = await getSettings(roles.map((role) => `session_timeout_${role}`));
  const map = {};
  for (const role of roles) {
    const configured = Number(stored[`session_timeout_${role}`]);
    map[role] = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_SESSION_TIMEOUT_MIN[role] || DEFAULT_SESSION_TIMEOUT_MIN.student;
  }
  return map;
}

async function getRoleSessionMinutes(role) {
  return (await getRoleSessionMinutesMap([role]))[role];
}

// The ceiling to hold *all* client traffic to, in Mbps — the parent queue every
// client queue hangs under.
//
// 0, blank or unset means no parent at all, which is how the system ran before
// this setting existed. Unlike the per-role figures, 0 here does not mean
// "unlimited": there is simply no parent queue, so nothing arbitrates between
// clients and an emergency priority's queue priority buys nothing. See
// ensureParentQueue() in utils/routeros.js.
//
// Deliberately the figure written to the router rather than a measured line
// speed the code then discounts — what an admin types is what gets enforced, and
// the "measure, then use 90-95%" advice lives in the field's own hint text.
async function getUplinkTotalMbps() {
  const { uplink_total_mbps: raw } = await getSettings(["uplink_total_mbps"]);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

module.exports = {
  getSettings,
  getRoleBandwidth,
  getRoleBandwidthMap,
  getRoleSessionMinutes,
  getRoleSessionMinutesMap,
  getUplinkTotalMbps,
  DEFAULT_BANDWIDTH_MBPS,
};
