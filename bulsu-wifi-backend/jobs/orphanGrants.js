const db = require("../db");
const { reapOrphanGrants, ensureParentQueue, ENABLED } = require("../utils/routeros");
const { getUplinkTotalMbps } = require("../utils/settings");

// Which of the tags found on the router still belong to a live session.
//
// Tags are written by grantAccess as "<kind>-<id>", where kind namespaces the
// two independent id sequences ("session-107" vs "guest-107"). Anything that
// doesn't parse into a known kind and a numeric id is reported as active and
// therefore left alone — an unrecognised tag is far more likely to be something
// a person put there than a leak worth deleting.
const TAG_PATTERN = /^(session|guest)-(\d+)$/;
const TABLE_BY_KIND = { session: "sessions", guest: "guest_sessions" };

async function resolveActiveTags(tags) {
  const active = new Set();
  const idsByKind = { session: [], guest: [] };

  for (const tag of tags) {
    const match = TAG_PATTERN.exec(tag);
    if (!match) {
      active.add(tag);
      continue;
    }
    idsByKind[match[1]].push(Number(match[2]));
  }

  for (const [kind, ids] of Object.entries(idsByKind)) {
    if (!ids.length) continue;
    const [rows] = await db.query(
      `SELECT id FROM ${TABLE_BY_KIND[kind]} WHERE status = 'active' AND id IN (?)`,
      [ids]
    );
    for (const row of rows) active.add(`${kind}-${row.id}`);
  }

  return active;
}

// active_queues rows whose session has since ended.
//
// endSession keeps its row when revokeAccess could not reach the router, so the
// database goes on saying a queue exists — which it does. Once this sweep has
// removed the queue from the router the row is the only thing left saying so,
// and nothing else on the account side would ever clear it. The meter already
// ignores these (it joins on an active session), so this is bookkeeping rather
// than a behaviour change.
async function clearEndedQueueRows() {
  const [result] = await db.query(
    `DELETE aq FROM active_queues aq
       JOIN sessions s ON s.id = aq.session_id
      WHERE s.status <> 'active'`
  );
  return result.affectedRows;
}

async function sweepOrphanGrants() {
  if (!ENABLED) return 0;
  // Re-assert the parent queue on the same schedule. This is already the job
  // that reconciles what is on the router against what should be, so a parent
  // deleted by hand in WinBox — or never created because the router was down at
  // startup — comes back on its own rather than waiting for the next restart.
  await ensureParentQueue(await getUplinkTotalMbps());
  const removed = await reapOrphanGrants(resolveActiveTags);
  // After the router side, never before: while the queue is still up there the
  // row is an accurate record of it.
  await clearEndedQueueRows().catch((err) =>
    console.error("Clearing ended active_queues rows failed:", err.message)
  );
  return removed;
}

// Quarter-hourly is plenty: orphans only appear when a revoke couldn't reach the
// router as a session ended, and the sweep costs one round-trip whether or not
// it finds anything. The run at startup is the one that matters most — it clears
// whatever a crash or an outage left behind while the backend was down.
function startOrphanGrantSweeper(intervalMs = 15 * 60 * 1000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const removed = await sweepOrphanGrants();
      if (removed) console.log(`Orphan grant sweep: revoked ${removed} leftover grant(s).`);
    } catch (err) {
      console.error("Orphan grant sweep failed:", err);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { sweepOrphanGrants, resolveActiveTags, clearEndedQueueRows, startOrphanGrantSweeper };
