require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { RouterOSAPI } = require("node-routeros");

// Reads the router's live configuration and writes an as-built markdown document,
// plus a drift check against what mikrotik-captive-portal-setup.md and
// mikrotik-wan-uplink-setup.md assume.
//
// STRICTLY READ-ONLY: every command below is a /print. Nothing is added, set or
// removed. Safe to run against a production router at any time.
//
//   node scripts/exportMikrotikConfig.js              # writes ../mikrotik-current-config.md
//   node scripts/exportMikrotikConfig.js --stdout     # prints instead of writing
//   node scripts/exportMikrotikConfig.js --out=x.md   # writes somewhere else
//
// Regenerate rather than hand-edit the output: router config drifts, and a stale
// as-built doc is worse than none.

const STDOUT = process.argv.includes("--stdout");
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT_PATH = outArg
  ? path.resolve(outArg.slice("--out=".length))
  : path.resolve(__dirname, "../../mikrotik-current-config.md");

// The portal host the walled garden has to allow. Taken from FRONTEND_URL so this
// keeps matching the backend's own idea of where the frontend lives.
const PORTAL_HOST =
  (process.env.FRONTEND_URL || "")
    .split(",")
    .map((u) => u.trim())
    .map((u) => {
      try { return new URL(u).hostname; } catch { return null; }
    })
    .find((h) => h && h !== "localhost" && h !== "127.0.0.1") || null;

const QUERIES = [
  ["System", "/system/resource/print", ["board-name", "version", "uptime", "architecture-name"]],
  ["Identity", "/system/identity/print", ["name"]],
  ["Clock", "/system/clock/print", ["date", "time", "time-zone-name"]],
  ["NTP client", "/system/ntp/client/print", ["enabled", "servers", "status"]],
  ["Interfaces", "/interface/print", ["name", "type", "running", "disabled", "comment"]],
  ["Interface lists", "/interface/list/member/print", ["list", "interface"]],
  ["Bridge ports", "/interface/bridge/port/print", ["bridge", "interface", "disabled"]],
  ["WiFi", "/interface/wifi/print", ["name", "configuration.ssid", "disabled", "running"]],
  ["IP addresses", "/ip/address/print", ["address", "interface", "disabled"]],
  ["DHCP client (WAN)", "/ip/dhcp-client/print", ["interface", "address", "gateway", "status", "disabled"]],
  ["PPPoE client", "/interface/pppoe-client/print", ["name", "interface", "running", "disabled"]],
  ["DHCP server", "/ip/dhcp-server/print", ["name", "interface", "address-pool", "disabled"]],
  ["Routes", "/ip/route/print", ["dst-address", "gateway", "active", "static"]],
  ["DNS", "/ip/dns/print", ["servers", "dynamic-servers", "allow-remote-requests"]],
  ["DNS static entries", "/ip/dns/static/print", ["name", "regexp", "type", "address", "disabled"]],
  ["Hotspot servers", "/ip/hotspot/print", ["name", "interface", "profile", "address-pool", "disabled"]],
  ["Hotspot profiles", "/ip/hotspot/profile/print", ["name", "hotspot-address", "login-by", "html-directory"]],
  ["Walled garden (host)", "/ip/hotspot/walled-garden/print", ["dst-host", "action", "disabled", "comment"]],
  ["Walled garden (IP)", "/ip/hotspot/walled-garden/ip/print", ["dst-address", "dst-port", "protocol", "action", "disabled"]],
  ["Hotspot IP bindings", "/ip/hotspot/ip-binding/print", ["address", "mac-address", "type", "comment", "disabled"]],
  ["Hotspot active", "/ip/hotspot/active/print", ["address", "mac-address", "user", "uptime"]],
  ["Simple queues", "/queue/simple/print", ["name", "target", "max-limit", "bytes", "comment", "disabled"]],
  ["Firewall NAT", "/ip/firewall/nat/print", ["chain", "action", "src-address", "dst-address", "out-interface", "out-interface-list", "comment", "disabled"]],
  ["Firewall filter", "/ip/firewall/filter/print", ["chain", "action", "src-address", "dst-address", "in-interface-list", "connection-state", "comment", "disabled"]],
  ["Address lists", "/ip/firewall/address-list/print", ["list", "address", "comment", "disabled"]],
  ["IP services", "/ip/service/print", ["name", "port", "address", "disabled"]],
  ["Users", "/user/print", ["name", "group", "disabled"]],
  ["IPv6 settings", "/ipv6/settings/print", ["disable-ipv6", "forward"]],
  ["IPv6 addresses", "/ipv6/address/print", ["address", "interface"]],
];

const pick = (row, keys) => {
  const out = {};
  for (const k of keys) if (row[k] !== undefined && row[k] !== "") out[k] = row[k];
  return out;
};

// Markdown table from an array of flat objects, columns unioned across rows.
function toTable(rows) {
  if (!rows.length) return "_(none)_\n";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => String(v).replace(/\|/g, "\\|");
  return [
    `| ${cols.join(" | ")} |`,
    `|${cols.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${cols.map((c) => esc(r[c] ?? "")).join(" | ")} |`),
  ].join("\n") + "\n";
}

function runChecks(data) {
  const findings = [];
  const add = (level, text) => findings.push({ level, text });
  const get = (label) => data[label] || [];

  const hasWan =
    get("DHCP client (WAN)").some((r) => r.status === "bound" && r.disabled !== "true") ||
    get("PPPoE client").some((r) => r.running === "true") ||
    get("Routes").some((r) => r["dst-address"] === "0.0.0.0/0" && r.active === "true");

  const catchAll = get("DNS static entries").filter((r) => r.regexp && r.disabled !== "true");
  if (catchAll.length && hasWan) {
    add("FAIL", "A catch-all DNS entry is active **and** there is a live WAN — every internet domain resolves to the router. Users will log in and reach nothing. See Part B of the WAN doc.");
  } else if (catchAll.length) {
    add("INFO", "Catch-all DNS entry present. Correct while there is no WAN; must be deleted before an uplink is connected.");
  } else if (!hasWan) {
    add("WARN", "No catch-all DNS entry and no WAN — captive-portal detection domains will not resolve, so the login popup may not appear on its own.");
  }

  const bridgedWan = get("Bridge ports").filter((r) => r.interface === "ether1" && r.disabled !== "true");
  if (bridgedWan.length) {
    add("FAIL", "`ether1` is a bridge port. If the ISP is on ether1, hotspot clients share layer 2 with it and bypass the portal entirely. See A2 of the WAN doc.");
  }

  const ipv6 = get("IPv6 settings")[0];
  if (ipv6 && ipv6["disable-ipv6"] !== "true") {
    add(hasWan ? "FAIL" : "WARN", "IPv6 is not disabled. The hotspot, walled garden and IP bindings are IPv4-only, so IPv6 traffic bypasses the portal and is never metered.");
  }
  if (get("IPv6 addresses").length) {
    add("WARN", `${get("IPv6 addresses").length} IPv6 address(es) still configured.`);
  }

  const hotspots = get("Hotspot servers").filter((r) => r.disabled !== "true");
  if (!hotspots.length) add("FAIL", "No enabled Hotspot server — nothing intercepts unauthenticated clients.");

  if (PORTAL_HOST) {
    const wg = get("Walled garden (IP)").filter((r) => r.disabled !== "true");
    for (const port of ["5173", "5000"]) {
      const ok = wg.some((r) => String(r["dst-address"] || "").includes(PORTAL_HOST) && String(r["dst-port"] || "").includes(port));
      if (!ok) add("WARN", `No walled-garden entry found for ${PORTAL_HOST}:${port} — the portal may not load before login.`);
    }
  } else {
    add("INFO", "FRONTEND_URL has no LAN host, so the walled garden could not be checked against it.");
  }

  const api = get("IP services").find((r) => r.name === "api");
  if (!api || api.disabled === "true") {
    add("FAIL", "The `api` service is disabled — the backend cannot grant access or meter usage.");
  } else if (!api.address) {
    add(hasWan ? "FAIL" : "WARN", "`api` has no Available From restriction — anything that can reach the router can attempt the admin credentials stored in the backend .env.");
  }

  for (const svc of ["telnet", "ftp"]) {
    const s = get("IP services").find((r) => r.name === svc);
    if (s && s.disabled !== "true") add("WARN", `\`${svc}\` service is enabled and unused.`);
  }

  if (hasWan) {
    const masq = get("Firewall NAT").some((r) => r.action === "masquerade" && r.disabled !== "true");
    if (!masq) add("FAIL", "No enabled masquerade rule — authorized clients will not reach the internet.");
    const ntp = get("NTP client")[0];
    if (!ntp || ntp.enabled !== "true") add("INFO", "NTP client is off; the router clock will drift.");
  }

  // Grants the backend created but never cleaned up — usually a session that ended
  // while the router was unreachable.
  const staleQueues = get("Simple queues").filter((r) => String(r.comment || "").startsWith("bulsu-wifi:"));
  const staleBindings = get("Hotspot IP bindings").filter((r) => String(r.comment || "").startsWith("bulsu-wifi:"));
  add("INFO", `${staleQueues.length} bulsu-wifi queue(s) and ${staleBindings.length} tagged ip-binding(s) currently on the router.`);

  return { findings, hasWan };
}

// Exported so the report logic can be exercised without a router in reach.
module.exports = { toTable, runChecks, QUERIES };

if (require.main !== module) return;

(async () => {
  if (!process.env.MIKROTIK_HOST) {
    console.error("MIKROTIK_HOST is not set in .env — nothing to connect to.");
    process.exit(1);
  }
  const conn = new RouterOSAPI({
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD || "",
    port: Number(process.env.MIKROTIK_PORT) || 8728,
    timeout: 10,
  });

  try {
    await conn.connect();
  } catch (err) {
    console.error(`Could not reach the router at ${process.env.MIKROTIK_HOST}: ${err.message}`);
    console.error("Check the laptop is on the router's LAN (ether2, static 192.168.88.5) and that IP > Services > api is enabled.");
    process.exit(1);
  }

  const data = {};
  const errors = [];
  for (const [label, cmd, keys] of QUERIES) {
    try {
      const rows = await conn.write(cmd);
      data[label] = rows.map((r) => pick(r, keys));
    } catch (err) {
      data[label] = [];
      errors.push(`${label} (\`${cmd}\`): ${err.message}`);
    }
  }
  await conn.close().catch(() => {});

  const { findings, hasWan } = runChecks(data);
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const board = data["System"][0] || {};
  const identity = (data["Identity"][0] || {}).name || "(unnamed)";

  const order = { FAIL: 0, WARN: 1, INFO: 2 };
  const icon = { FAIL: "🔴", WARN: "🟡", INFO: "🔵" };

  const md = [
    `# MikroTik — Current Configuration (as built)`,
    ``,
    `**Generated:** ${stamp} by \`bulsu-wifi-backend/scripts/exportMikrotikConfig.js\``,
    `**Router:** ${identity} — ${board["board-name"] || "?"}, RouterOS ${board.version || "?"}, up ${board.uptime || "?"}`,
    `**Read from:** ${process.env.MIKROTIK_HOST}:${process.env.MIKROTIK_PORT || 8728}`,
    `**WAN uplink:** ${hasWan ? "present" : "**none detected**"}`,
    ``,
    `> Generated from the live router. Do not hand-edit — re-run the script instead.`,
    `> Setup procedure lives in \`mikrotik-captive-portal-setup.md\` and`,
    `> \`mikrotik-wan-uplink-setup.md\`; this file records what is actually on the device.`,
    ``,
    `---`,
    ``,
    `## Configuration review`,
    ``,
    findings.length
      ? findings
          .sort((a, b) => order[a.level] - order[b.level])
          .map((f) => `- ${icon[f.level]} **${f.level}** — ${f.text}`)
          .join("\n")
      : "_No checks produced output._",
    ``,
    errors.length ? `\n### Commands that failed\n\n${errors.map((e) => `- ${e}`).join("\n")}\n` : "",
    `---`,
    ``,
    `## Full configuration`,
    ``,
    ...QUERIES.map(([label]) => `### ${label}\n\n${toTable(data[label])}`),
  ].join("\n");

  if (STDOUT) {
    console.log(md);
  } else {
    fs.writeFileSync(OUT_PATH, md);
    console.log(`Wrote ${OUT_PATH}`);
    const fails = findings.filter((f) => f.level === "FAIL").length;
    const warns = findings.filter((f) => f.level === "WARN").length;
    console.log(`Review: ${fails} FAIL, ${warns} WARN — see the "Configuration review" section.`);
  }
  process.exit(0);
})();
