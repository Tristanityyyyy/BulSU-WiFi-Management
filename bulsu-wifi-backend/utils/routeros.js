const { RouterOSAPI } = require("node-routeros");
const { normalizeIp, isGrantableIp } = require("./ip");

// Leaving MIKROTIK_HOST unset disables this feature entirely — every export
// below becomes a safe no-op, which is the expected state on a dev machine
// with no router reachable.
const ENABLED = !!process.env.MIKROTIK_HOST;
const ACCESS_MODE = process.env.MIKROTIK_ACCESS_MODE || "hotspot_ip_binding";
const TAG_PREFIX = "bulsu-wifi:";

// A Simple Queue with max-limit=0/0 AND limit-at=0/0 gives RouterOS nothing to
// schedule, so it never installs an HTB class for it — and a queue outside the
// HTB counts nothing. That is why `data_usage` stayed empty for every session on
// record while the queues themselves looked perfectly healthy in WinBox:
// invalid=false, disabled=false, correct target, and zero packets against a
// client that was demonstrably browsing.
//
// So every queue we create now carries a real ceiling. A role configured as
// "unlimited" (0 Mbps in Settings → Network) gets this headroom figure instead,
// which sits far above the uplink and therefore shapes nothing — but it keeps
// the class installed, and the counters alive.
const UNLIMITED_MBPS = 1000;

// RouterOS wants "<upload>/<download>". The queue target is the client, so the
// first figure is the client's own upstream. Returns e.g. "2M/5M".
function toMaxLimit(limits) {
  const mbps = (v) => `${Number(v) > 0 ? Number(v) : UNLIMITED_MBPS}M`;
  return `${mbps(limits && limits.upMbps)}/${mbps(limits && limits.downMbps)}`;
}

// RouterOS hands max-limit back either as the shorthand we wrote ("2M/5M") or as
// plain bits per second ("2000000/5000000") depending on version and how the
// value was set. Compare numerically so the meter does not decide the ceiling
// has drifted — and rewrite it — on every single tick.
function maxLimitBps(str) {
  const unit = { k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
  return String(str || "").split("/").map((part) => {
    const t = part.trim();
    const mult = unit[t.slice(-1)];
    const num = Number(mult ? t.slice(0, -1) : t);
    return Number.isNaN(num) ? NaN : num * (mult || 1);
  });
}

// True when the ceiling already on the router is what `limits` asks for.
function maxLimitMatches(actual, limits) {
  const a = maxLimitBps(actual);
  const b = maxLimitBps(toMaxLimit(limits));
  return a.length === 2 && b.length === 2 && a[0] === b[0] && a[1] === b[1];
}

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
//
// `kind` namespaces the router tag so student sessions and guest sessions —
// whose ids are separate integer sequences — can't collide on the same
// `session-<id>` queue name. Defaults to "session" so existing callers are
// unaffected; the guest flow passes "guest".
// Whether an ip-binding already sitting on that address is one of ours, and so
// safe to re-use for a new session. A binding with any other comment was put
// there by hand — the `portal-server` bypass that keeps the laptop out from
// behind its own hotspot is exactly this — and adopting it would rename it to
// our tag, after which revokeAccess() would delete it at logout and strand the
// portal server behind the captive portal.
function isOursToReuse(binding) {
  return String((binding && binding.comment) || "").startsWith(TAG_PREFIX);
}

async function grantAccess(rawIp, id, kind = "session", limits = null) {
  if (!ENABLED) return null;
  // Callers hand us whatever they hold: Express's `req.ip` on a dual-stack
  // listener, or an ip_address column written before that was normalised. Both
  // can be "::ffff:192.168.88.253", which RouterOS rejects as an IPv4 address —
  // the failure that kept active_queues empty for every real client.
  const ip = normalizeIp(rawIp);
  if (!isGrantableIp(ip)) {
    // Not a router error, so don't dress it up as one: a loopback login (admin
    // testing on the laptop's own browser) has no lease to bypass, and granting
    // it would strand a junk ip-binding + queue on the device.
    console.warn(`MikroTik grantAccess skipped — "${rawIp}" is not an address the router can hold a lease for.`);
    return null;
  }
  const tag = `${TAG_PREFIX}${kind}-${id}`;
  try {
    return await withConnection(async (conn) => {
      if (ACCESS_MODE === "hotspot_ip_binding") {
        const existing = await conn.write("/ip/hotspot/ip-binding/print", [`?address=${ip}`]);
        if (existing[0] && !isOursToReuse(existing[0])) {
          // Refuse rather than hijack someone's hand-made binding. Returning null
          // is the same "couldn't grant right now" the caller already handles, so
          // the login still succeeds — it just goes unmetered, which is far better
          // than knocking the portal server off the network.
          console.warn(
            `MikroTik grantAccess refused — ${ip} already holds a hand-made ip-binding ` +
            `(comment: "${existing[0].comment || ""}"). Leaving it untouched.`
          );
          return null;
        }
        if (existing[0]) {
          await conn.write("/ip/hotspot/ip-binding/set", [`=.id=${existing[0][".id"]}`, "=type=bypassed", `=comment=${tag}`]);
        } else {
          await conn.write("/ip/hotspot/ip-binding/add", [`=address=${ip}`, "=type=bypassed", `=comment=${tag}`]);
        }
      } else {
        await conn.write("/ip/firewall/address-list/add", ["=list=bulsu-authorized", `=address=${ip}`, `=comment=${tag}`]);
      }
      const added = await conn.write("/queue/simple/add", [`=name=${tag}`, `=target=${ip}/32`, `=max-limit=${toMaxLimit(limits)}`, `=comment=${tag}`]);
      return { queueId: added[0].ret };
    });
  } catch (err) {
    console.error("MikroTik grantAccess failed:", err.message);
    return null;
  }
}

// Revokes access and stops metering for a session. Never throws, so a router
// outage can't block logout/session-ending — but it DOES report whether the
// router work actually happened: `true` on success (including when the feature
// is disabled, where there is nothing to revoke), `false` when the router was
// unreachable. Callers must not clear their stored queue_id on `false`, or the
// queue + ip-binding stay live on the device with nothing left to retry with.
//
// Note the per-command `.catch(() => {})` below are still success: a "no such
// item" means the queue/binding is already gone, which is the outcome we want.
// Only a connection-level failure — what the outer catch sees — returns false.
async function revokeAccess(rawIp, queueId) {
  if (!ENABLED) return true;
  const ip = normalizeIp(rawIp);
  try {
    await withConnection(async (conn) => {
      if (queueId) await conn.write("/queue/simple/remove", [`=.id=${queueId}`]).catch(() => {});

      // The queue removal above is keyed by id and works regardless, but the
      // lookups below query *by address*. A row written before normalisation can
      // hold a value the router will never match, and a malformed query would
      // throw out to the catch and report the whole revoke as a connection
      // failure — which makes callers keep the queue_id and retry forever.
      if (!isGrantableIp(ip)) return;

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
    return true;
  } catch (err) {
    console.error("MikroTik revokeAccess failed:", err.message);
    return false;
  }
}

// Returns `{ bytes, maxLimit }` for a queue — cumulative upload+download bytes,
// plus the ceiling currently on the router so the caller can spot drift from
// what Settings now says. `null` if the queue no longer exists (caller should
// self-heal by recreating it), or `undefined` if the router itself was
// unreachable — deliberately distinct from `null` so a temporary outage is
// never mistaken for a counter reset.
async function readQueueState(queueId) {
  if (!ENABLED) return undefined;
  try {
    return await withConnection(async (conn) => {
      const rows = await conn.write("/queue/simple/print", [`?.id=${queueId}`]);
      if (!rows[0] || !rows[0].bytes) return null;
      const [up, down] = rows[0].bytes.split("/").map(Number);
      return { bytes: up + down, maxLimit: rows[0]["max-limit"] || "" };
    });
  } catch (err) {
    console.error("MikroTik readQueueState failed:", err.message);
    return undefined;
  }
}

// Re-applies a role's ceiling to a queue that already exists, so an admin
// editing Settings → Network takes effect on sessions that are already live
// rather than only on the next login. Best-effort like everything else here:
// a failure just means the old ceiling stands until the next tick.
async function setQueueLimit(queueId, limits) {
  if (!ENABLED) return false;
  try {
    return await withConnection(async (conn) => {
      await conn.write("/queue/simple/set", [`=.id=${queueId}`, `=max-limit=${toMaxLimit(limits)}`]);
      return true;
    });
  } catch (err) {
    console.error("MikroTik setQueueLimit failed:", err.message);
    return false;
  }
}

module.exports = { grantAccess, revokeAccess, readQueueState, setQueueLimit, toMaxLimit, maxLimitMatches, isOursToReuse, ENABLED };
