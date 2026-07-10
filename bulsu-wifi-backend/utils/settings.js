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

module.exports = { getSettings };
