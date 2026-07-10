const db = require("../db");
const { TRASH_RETENTION_DAYS } = require("../utils/constants");

// Hard-deletes any user that has sat in trash past the retention window.
// Relies on the sessions/notifications/emergency_priority FKs being ON DELETE SET NULL
// (see scripts/setupUserTrash.js) so their historical rows survive, detached, rather
// than cascading away with the account.
async function purgeExpiredTrash() {
  await db.query(
    `DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at <= NOW() - INTERVAL ${TRASH_RETENTION_DAYS} DAY`
  );
}

function startTrashPurgeSweeper(intervalMs = 60 * 60 * 1000) {
  const run = () =>
    purgeExpiredTrash().catch((err) => console.error("User trash purge failed:", err));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { purgeExpiredTrash, startTrashPurgeSweeper };
