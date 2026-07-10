const bcrypt = require('bcrypt');
const db = require('../db');

// Step-up auth: confirms the requesting admin's own current password before
// letting them perform a destructive or sensitive action.
async function verifyOwnPassword(req, password) {
  if (!password) return false;
  const [[admin]] = await db.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  return Boolean(admin && await bcrypt.compare(password, admin.password_hash));
}

module.exports = { verifyOwnPassword };
