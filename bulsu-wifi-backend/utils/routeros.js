const { RouterOSAPI } = require("node-routeros");
const { normalizeIp, isGrantableIp } = require("./ip");

// Leaving MIKROTIK_HOST unset disables this feature entirely — every export
// below becomes a safe no-op, which is the expected state on a dev machine
// with no router reachable.
const ENABLED = !!process.env.MIKROTIK_HOST;
const ACCESS_MODE = process.env.MIKROTIK_ACCESS_MODE || "hotspot_ip_binding";
const TAG_PREFIX = "bulsu-wifi:";

// The queue every client queue hangs under.
//
// It is what makes an emergency priority mean anything. RouterOS `priority` only
// orders *sibling* classes competing for a shared parent's spare bandwidth. With
// every queue standing alone under the global root, the router is never the
// bottleneck — congestion happens upstream at the ISP handoff, where a priority
// field on our side has no effect whatsoever. So priority 1 was being written
// faithfully to every emergency queue and buying nothing: the grant raised the
// holder's ceiling, but nobody actually gave way to them.
//
// Capped just under the real uplink, the router becomes the bottleneck it has to
// be in order to arbitrate at all.
const PARENT_QUEUE_NAME = "bulsu-wifi-total";
const PARENT_TAG = `${TAG_PREFIX}parent`;

// The parent's name once it is known to exist on the router, or null.
//
// grantAccess() consults this rather than reading Settings on every login: the
// figure changes about once, and a queue built without a parent is repaired by
// the next sweep anyway. Set by ensureParentQueue() — which runs at startup, on
// save, and on the orphan sweep — so it reflects what is actually up there
// rather than what the database wishes were.
let activeParentQueue = null;

// An explicit override for deployments where the router's own tables don't
// describe the client range usefully. Normally left unset: the subnet is read
// from the router in resolveClientSubnet() below, because a /24 is an assumption
// and the router already knows the answer.
const CLIENT_SUBNET = process.env.MIKROTIK_CLIENT_SUBNET || "";

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

// Simple-queue priority, 1 (served first) to 8 (default, served last). A ceiling
// only decides how fast a client may go when there is capacity to spare; priority
// is what decides who gets served when there isn't — which is the whole point of
// an emergency priority, and the reason it is set alongside the ceiling rather
// than instead of it. RouterOS spells it "<upload>/<download>".
const DEFAULT_QUEUE_PRIORITY = 8;

function toPriority(limits) {
  const raw = Number(limits && limits.priority);
  const value = Number.isFinite(raw) && raw >= 1 && raw <= 8 ? Math.round(raw) : DEFAULT_QUEUE_PRIORITY;
  return `${value}/${value}`;
}

// True when both the ceiling and the priority already on the router are what
// `limits` asks for, so the meter only rewrites a queue that has actually drifted.
function queueMatchesLimits(state, limits) {
  if (!state) return false;
  const priorityMatches = !state.priority || state.priority === toPriority(limits);
  return maxLimitMatches(state.maxLimit, limits) && priorityMatches;
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
// Queue. Returns { queueId, mac } on success, or null on ANY failure (router
// unreachable, auth failure, etc.) — callers must treat null as "couldn't
// grant right now" and must never let it block login. `mac` may be null on its
// own if the router could not name the device; the grant still stands.
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
// The router's own address is never a client.
//
// It arrives as one when a hotspot-intercepted connection gets source-NATed on
// its way to the portal — a masquerade rule without an out-interface constraint
// does exactly that, and this deployment had one. The login still succeeds, but
// everything downstream is then working with the router's address instead of the
// device's: the grant would bypass the router itself rather than the phone, no
// MAC can be found for it, presence detection sweeps the session as departed,
// and two devices arriving this way would supersede each other's sessions.
//
// Cheap to detect and worth saying loudly, because the symptom on its own points
// nowhere near the cause.
function isRouterAddress(rawIp) {
  const host = normalizeIp(process.env.MIKROTIK_HOST);
  return Boolean(host) && normalizeIp(rawIp) === host;
}

// The MAC behind an address, on a connection of our own. For callers that have
// no grant to make — an admin logging in gets no queue, but identifying the
// device shouldn't be a privilege of the roles that do.
//
// Returns null without touching the router for an address it could never know
// (loopback), so a local login pays nothing for asking.
async function readClientMac(rawIp) {
  if (!ENABLED) return null;
  const ip = normalizeIp(rawIp);
  if (!isGrantableIp(ip) || isRouterAddress(ip)) return null;
  try {
    return await withConnection((conn) => readMacFor(conn, ip));
  } catch (err) {
    console.error("MikroTik readClientMac failed:", err.message);
    return null;
  }
}

// The MAC behind an address, asked of a connection that is already open.
//
// ARP first (it is populated the moment a client speaks to the router at all),
// the DHCP lease second for the case where ARP has aged out but the lease has
// not. Never throws: not knowing the MAC is a missing detail, not a reason to
// fail whatever the caller was really doing.
async function readMacFor(conn, ip) {
  const arp = await conn.write("/ip/arp/print", [`?address=${ip}`]).catch(() => []);
  if (arp[0] && arp[0]["mac-address"]) return String(arp[0]["mac-address"]).toUpperCase();
  const lease = await conn.write("/ip/dhcp-server/lease/print", [`?address=${ip}`]).catch(() => []);
  if (lease[0] && lease[0]["mac-address"]) return String(lease[0]["mac-address"]).toUpperCase();
  return null;
}

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
  if (isRouterAddress(ip)) {
    // Bypassing the router's own address would grant nothing to the client that
    // actually made the request, while leaving a binding on the gateway itself.
    console.warn(
      `MikroTik grantAccess refused — ${ip} is the router's own address, so this request reached the ` +
      `backend source-NATed rather than from the client. Check for a srcnat masquerade rule with no ` +
      `out-interface-list constraint (the Hotspot setup wizard adds one).`
    );
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
      const added = await conn.write("/queue/simple/add", [
        `=name=${tag}`,
        `=target=${ip}/32`,
        `=max-limit=${toMaxLimit(limits)}`,
        `=priority=${toPriority(limits)}`,
        ...(activeParentQueue ? [`=parent=${activeParentQueue}`] : []),
        `=comment=${tag}`,
      ]);
      // Read on the way out, on the connection already in hand — no extra
      // round-trip, and the caller gets to record which device this actually was
      // rather than leaving it blank for the presence sweeper to fill in later.
      return { queueId: added[0].ret, mac: await readMacFor(conn, ip) };
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
      return { bytes: up + down, maxLimit: rows[0]["max-limit"] || "", priority: rows[0].priority || "" };
    });
  } catch (err) {
    console.error("MikroTik readQueueState failed:", err.message);
    return undefined;
  }
}

// Housekeeping: remove grants the router is still holding for sessions that
// have ended.
//
// Every grant carries our tag ("bulsu-wifi:session-107"), so an ip-binding or
// queue whose tag names a session that is no longer active is a leak — and a
// bypassed ip-binding is not a harmless leftover: whoever DHCP hands that
// address to next gets the network for free, without ever logging in. They
// accumulate whenever revokeAccess() couldn't reach the router at the moment a
// session ended, and from sessions predating revoke entirely.
//
// `resolveActiveTags` is handed every tag found on the router and answers with
// the subset still live; everything else is removed. Doing it in that order —
// router first, then the database — is what makes this safe to run against a
// live system. Reading the database first would let a login that lands in
// between produce a grant this pass has no record of, and its access would be
// torn down seconds after it was granted.
//
// Untagged objects are never touched: the hand-made `portal-server` binding
// that keeps the laptop out from behind its own captive portal is exactly such
// an object, and removing it would take the portal off the network.
async function reapOrphanGrants(resolveActiveTags) {
  if (!ENABLED) return 0;
  const tagOf = (value) => {
    const text = String(value || "");
    return text.startsWith(TAG_PREFIX) ? text.slice(TAG_PREFIX.length) : null;
  };
  try {
    return await withConnection(async (conn) => {
      // tag -> the router objects carrying it
      const grants = new Map();
      const add = (tag, key, id) => {
        if (!grants.has(tag)) grants.set(tag, { bindings: [], queues: [], addresses: [] });
        grants.get(tag)[key].push(id);
      };

      if (ACCESS_MODE === "hotspot_ip_binding") {
        const bindings = await conn.write("/ip/hotspot/ip-binding/print", []).catch(() => []);
        for (const binding of bindings) {
          const tag = tagOf(binding.comment);
          if (tag) add(tag, "bindings", binding[".id"]);
        }
      } else {
        const entries = await conn.write("/ip/firewall/address-list/print", ["?list=bulsu-authorized"]).catch(() => []);
        for (const entry of entries) {
          const tag = tagOf(entry.comment);
          if (tag) add(tag, "addresses", entry[".id"]);
        }
      }

      const queues = await conn.write("/queue/simple/print", []).catch(() => []);
      for (const queue of queues) {
        // Match on either field: the queue is created with the tag as both its
        // name and its comment, and an admin editing one in WinBox shouldn't
        // make the grant invisible to this sweep.
        const tag = tagOf(queue.comment) || tagOf(queue.name);
        if (tag) add(tag, "queues", queue[".id"]);
      }

      if (!grants.size) return 0;
      // A throw here (database down) propagates before anything is removed.
      const active = await resolveActiveTags([...grants.keys()]);

      let removed = 0;
      for (const [tag, objects] of grants) {
        if (active.has(tag)) continue;
        for (const id of objects.queues) await conn.write("/queue/simple/remove", [`=.id=${id}`]).catch(() => {});
        for (const id of objects.bindings) await conn.write("/ip/hotspot/ip-binding/remove", [`=.id=${id}`]).catch(() => {});
        for (const id of objects.addresses) await conn.write("/ip/firewall/address-list/remove", [`=.id=${id}`]).catch(() => {});
        console.log(`MikroTik reaped orphan grant ${TAG_PREFIX}${tag}.`);
        removed++;
      }
      return removed;
    });
  } catch (err) {
    console.error("MikroTik reapOrphanGrants failed:", err.message);
    return 0;
  }
}

// Presence: who is actually on the network right now.
//
// Nothing in `sessions` could ever answer that before — a phone that turns its
// WiFi off says nothing to the backend, so its row stayed 'active' until an
// admin killed it by hand. The router does know, from two tables that mean
// different things and are deliberately unioned here:
//
//   * the WiFi registration table — every associated wireless client. This is
//     the authoritative signal for phones, and it survives a device sitting
//     idle with its screen off, which is exactly when a traffic-based guess
//     would wrongly declare it gone.
//   * the bridge host table — every MAC the bridge has heard from recently, on
//     any port. It covers what the registration table cannot: the portal laptop
//     wired into ether2, which is associated with no WiFi at all and must never
//     be swept. Its entries age out on their own (bridge ageing-time, 5m by
//     default), so a device that left drops off this list too.
//
// ARP and the DHCP leases are NOT presence signals — a stale ARP entry for a
// phone that left hours ago is exactly what this deployment had sitting on it.
// They serve only as the address book that maps a session's stored IP to the
// MAC the two tables above are keyed by.
//
// Returns { liveMacs, macByIp } — or null when the router is unreachable, which
// callers MUST treat as "no information", never as "nobody is connected".
async function readNetworkPresence() {
  if (!ENABLED) return null;
  const upper = (value) => String(value || "").trim().toUpperCase();
  try {
    return await withConnection(async (conn) => {
      const liveMacs = new Set();

      // wifiwave2 (`/interface/wifi`, what the hAP ax2 runs) and the legacy
      // wireless stack are mutually exclusive — the absent one answers "no such
      // command", a per-command miss rather than a router outage. Swallow it
      // here so the catch below can't mistake it for one.
      for (const path of ["/interface/wifi/registration-table/print", "/interface/wireless/registration-table/print"]) {
        const rows = await conn.write(path, []).catch(() => []);
        for (const row of rows) if (row["mac-address"]) liveMacs.add(upper(row["mac-address"]));
      }

      const hosts = await conn.write("/interface/bridge/host/print", []).catch(() => []);
      for (const host of hosts) {
        // local=true is the bridge's own interface MAC, not a client.
        if (host.local !== "true" && host["mac-address"]) liveMacs.add(upper(host["mac-address"]));
      }

      const macByIp = new Map();
      const learn = (ip, mac) => {
        if (ip && mac) macByIp.set(normalizeIp(ip), upper(mac));
      };
      const arp = await conn.write("/ip/arp/print", []).catch(() => []);
      for (const entry of arp) learn(entry.address, entry["mac-address"]);
      // Leases are read second so a live lease wins over an ARP entry that may
      // predate the address being handed to somebody else.
      const leases = await conn.write("/ip/dhcp-server/lease/print", []).catch(() => []);
      for (const lease of leases) learn(lease.address, lease["mac-address"]);

      return { liveMacs, macByIp };
    });
  } catch (err) {
    console.error("MikroTik readNetworkPresence failed:", err.message);
    return null;
  }
}

// The client range the parent queue should shape, as "192.168.88.0/24".
//
// Read off the router rather than derived from MIKROTIK_HOST: the netmask is not
// ours to assume, and the router already holds the answer. The DHCP network is
// the better of the two sources — it is stated in exactly the form the queue
// target wants — with the bridge's own address as the fallback, masked down to
// its network. Returns null when neither answers, which leaves the parent
// uncreated rather than shaping a range we guessed at.
async function resolveClientSubnet(conn) {
  if (CLIENT_SUBNET) return CLIENT_SUBNET;

  const networks = await conn.write("/ip/dhcp-server/network/print", []).catch(() => []);
  for (const net of networks) {
    if (net.address && net.address.includes("/")) return net.address;
  }

  const addresses = await conn.write("/ip/address/print", []).catch(() => []);
  for (const entry of addresses) {
    // `network` is what RouterOS computed for that interface; prefer it over
    // masking the address ourselves. Skip the WAN side — a client subnet the
    // router reaches the internet through is not one we should be shaping.
    if (entry.disabled === "true" || !entry.address || !entry.address.includes("/")) continue;
    const [addr, bits] = entry.address.split("/");
    if (!isGrantableIp(addr)) continue;
    if (entry.network) return `${entry.network}/${bits}`;
  }

  return null;
}

// Creates, updates or removes the queue every client queue hangs under, and
// hangs the existing ones under it.
//
// `mbps` is the ceiling to enforce, straight from Settings → Network. 0 (or
// blank, or unset) means no parent at all, which is how this ran before the
// setting existed — and switching back to it has to unwind cleanly rather than
// leaving orphaned children pointing at a queue that is about to go.
//
// Never throws and never blocks anything: a router that is unreachable leaves
// activeParentQueue as it was and the next sweep tries again. Returns the name
// when a parent is in place, null when there is deliberately none.
async function ensureParentQueue(mbps) {
  if (!ENABLED) return null;
  try {
    return await withConnection(async (conn) => {
      const queues = await conn.write("/queue/simple/print", []).catch(() => []);
      const byName = queues.find((q) => q.name === PARENT_QUEUE_NAME);

      // Never adopt a queue somebody else made. The same refusal isOursToReuse()
      // applies to ip-bindings, and for the same reason: adopting it would mean
      // deleting it later on a change that was never theirs to make.
      if (byName && byName.comment !== PARENT_TAG) {
        console.warn(
          `MikroTik ensureParentQueue refused — a queue named "${PARENT_QUEUE_NAME}" already exists ` +
          `with comment "${byName.comment || ""}". Leaving it untouched; no parent will be applied.`
        );
        activeParentQueue = null;
        return null;
      }

      // Our client queues, by the tag grantAccess writes. The parent is excluded
      // by name — it carries the prefix too, and a queue cannot parent itself.
      const children = queues.filter(
        (q) => q.name !== PARENT_QUEUE_NAME &&
          (String(q.comment || "").startsWith(TAG_PREFIX) || String(q.name || "").startsWith(TAG_PREFIX))
      );

      const wanted = Number(mbps) > 0 ? Number(mbps) : 0;

      if (!wanted) {
        // Detach before removing, or RouterOS is left holding children that name
        // a parent which no longer exists.
        for (const child of children) {
          if (child.parent && child.parent !== "none") {
            await conn.write("/queue/simple/set", [`=.id=${child[".id"]}`, "=parent=none"]).catch(() => {});
          }
        }
        if (byName) {
          await conn.write("/queue/simple/remove", [`=.id=${byName[".id"]}`]).catch(() => {});
        }
        activeParentQueue = null;
        return null;
      }

      const maxLimit = `${wanted}M/${wanted}M`;
      let parentId = byName?.[".id"];

      if (!byName) {
        const subnet = await resolveClientSubnet(conn);
        if (!subnet) {
          console.warn(
            "MikroTik ensureParentQueue skipped — could not determine the client subnet from the " +
            "router's DHCP networks or interface addresses. Set MIKROTIK_CLIENT_SUBNET to name it."
          );
          activeParentQueue = null;
          return null;
        }
        const added = await conn.write("/queue/simple/add", [
          `=name=${PARENT_QUEUE_NAME}`,
          `=target=${subnet}`,
          `=max-limit=${maxLimit}`,
          `=comment=${PARENT_TAG}`,
        ]);
        parentId = added[0].ret;
      } else if (!maxLimitMatches(byName["max-limit"], { upMbps: wanted, downMbps: wanted })) {
        await conn.write("/queue/simple/set", [`=.id=${parentId}`, `=max-limit=${maxLimit}`]);
      }

      // RouterOS matches simple queues top-down and a child must sit after its
      // parent. A queue added just now lands at the bottom, below every client
      // queue already there, so without this the adoption below has nothing
      // valid to attach to.
      await conn.write("/queue/simple/move", [`=numbers=${parentId}`, "=destination=0"]).catch(() => {});

      for (const child of children) {
        if (child.parent !== PARENT_QUEUE_NAME) {
          await conn
            .write("/queue/simple/set", [`=.id=${child[".id"]}`, `=parent=${PARENT_QUEUE_NAME}`])
            .catch(() => {});
        }
      }

      activeParentQueue = PARENT_QUEUE_NAME;
      return PARENT_QUEUE_NAME;
    });
  } catch (err) {
    console.error("MikroTik ensureParentQueue failed:", err.message);
    return activeParentQueue;
  }
}

// Re-applies a role's ceiling and priority to a queue that already exists, so an admin
// editing Settings → Network takes effect on sessions that are already live
// rather than only on the next login. Best-effort like everything else here:
// a failure just means the old ceiling stands until the next tick.
async function setQueueLimit(queueId, limits) {
  if (!ENABLED) return false;
  try {
    return await withConnection(async (conn) => {
      await conn.write("/queue/simple/set", [`=.id=${queueId}`, `=max-limit=${toMaxLimit(limits)}`, `=priority=${toPriority(limits)}`]);
      return true;
    });
  } catch (err) {
    console.error("MikroTik setQueueLimit failed:", err.message);
    return false;
  }
}

module.exports = { grantAccess, revokeAccess, readQueueState, readClientMac, readNetworkPresence, reapOrphanGrants, setQueueLimit, toMaxLimit, toPriority, maxLimitMatches, queueMatchesLimits, isOursToReuse, isRouterAddress, DEFAULT_QUEUE_PRIORITY, PARENT_QUEUE_NAME, ensureParentQueue, ENABLED };
