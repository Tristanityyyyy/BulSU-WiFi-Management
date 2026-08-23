const db = require('../db');

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

module.exports = { getSettings, getRoleBandwidth, getRoleBandwidthMap, DEFAULT_BANDWIDTH_MBPS };
