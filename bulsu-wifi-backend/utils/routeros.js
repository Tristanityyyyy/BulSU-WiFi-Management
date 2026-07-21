const { RouterOSAPI } = require("node-routeros");

// Leaving MIKROTIK_HOST unset disables this feature entirely — every export
// below becomes a safe no-op, which is the expected state on a dev machine
// with no router reachable.
const ENABLED = !!process.env.MIKROTIK_HOST;
const ACCESS_MODE = process.env.MIKROTIK_ACCESS_MODE || "hotspot_ip_binding";
const TAG_PREFIX = "bulsu-wifi:";

async function withConnection(fn) {
  const conn = new RouterOSAPI({
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD || "",
    port: Number(process.env.MIKROTIK_PORT) || 8728,
    timeout: 8,
  });
  try {
    await conn.connect();
    return await fn(conn);
  } finally {
    conn.close().catch(() => {});
  }
}

// Grants real network access for `ip` and starts metering it via a Simple
// Queue. Returns { queueId } on success, or null on ANY failure (router
// unreachable, auth failure, etc.) — callers must treat null as "couldn't
// grant right now" and must never let it block login.
async function grantAccess(ip, sessionId) {
  if (!ENABLED) return null;
  const tag = `${TAG_PREFIX}session-${sessionId}`;
  try {
    return await withConnection(async (conn) => {
      if (ACCESS_MODE === "hotspot_ip_binding") {
        const existing = await conn.write("/ip/hotspot/ip-binding/print", [`?address=${ip}`]);
        if (existing[0]) {
          await conn.write("/ip/hotspot/ip-binding/set", [`=.id=${existing[0][".id"]}`, "=type=bypassed", `=comment=${tag}`]);
        } else {
          await conn.write("/ip/hotspot/ip-binding/add", [`=address=${ip}`, "=type=bypassed", `=comment=${tag}`]);
        }
      } else {
        await conn.write("/ip/firewall/address-list/add", ["=list=bulsu-authorized", `=address=${ip}`, `=comment=${tag}`]);
      }
      const added = await conn.write("/queue/simple/add", [`=name=${tag}`, `=target=${ip}/32`, "=max-limit=0/0", `=comment=${tag}`]);
      return { queueId: added[0].ret };
    });
  } catch (err) {
    console.error("MikroTik grantAccess failed:", err.message);
    return null;
  }
}

// Revokes access and stops metering for a session. Best-effort — never throws,
// so a router outage can't block logout/session-ending.
async function revokeAccess(ip, queueId) {
  if (!ENABLED) return;
  try {
    await withConnection(async (conn) => {
      if (queueId) await conn.write("/queue/simple/remove", [`=.id=${queueId}`]).catch(() => {});

      if (ACCESS_MODE === "hotspot_ip_binding") {
        const existing = await conn.write("/ip/hotspot/ip-binding/print", [`?address=${ip}`]);
        // Only remove bindings we created — never touch one an admin added by hand.
        if (existing[0] && String(existing[0].comment || "").startsWith(TAG_PREFIX)) {
          await conn.write("/ip/hotspot/ip-binding/remove", [`=.id=${existing[0][".id"]}`]).catch(() => {});
        }
      } else {
        const existing = await conn.write("/ip/firewall/address-list/print", ["?list=bulsu-authorized", `?address=${ip}`]);
        if (existing[0]) await conn.write("/ip/firewall/address-list/remove", [`=.id=${existing[0][".id"]}`]).catch(() => {});
      }
    });
  } catch (err) {
    console.error("MikroTik revokeAccess failed:", err.message);
  }
}

// Returns cumulative upload+download bytes for a queue, `null` if the queue
// no longer exists (caller should self-heal by recreating it), or
// `undefined` if the router itself was unreachable — deliberately distinct
// from `null` so a temporary outage is never mistaken for a counter reset.
async function readQueueBytes(queueId) {
  if (!ENABLED) return undefined;
  try {
    return await withConnection(async (conn) => {
      const rows = await conn.write("/queue/simple/print", [`?.id=${queueId}`]);
      if (!rows[0] || !rows[0].bytes) return null;
      const [up, down] = rows[0].bytes.split("/").map(Number);
      return up + down;
    });
  } catch (err) {
    console.error("MikroTik readQueueBytes failed:", err.message);
    return undefined;
  }
}

module.exports = { grantAccess, revokeAccess, readQueueBytes, ENABLED };
