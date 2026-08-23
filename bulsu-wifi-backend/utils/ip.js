// The backend listens on a dual-stack socket, so an IPv4 client reaches Express as
// an IPv4-mapped IPv6 address — `req.ip` is "::ffff:192.168.88.253", not
// "192.168.88.253". RouterOS rejects that form outright, so every grantAccess()
// call for a real WiFi client failed and was swallowed by its own catch, leaving
// active_queues and data_usage permanently empty while logins looked fine.
//
// Normalising here rather than at each call site keeps the router API, the
// ip_address columns and the "same device reconnecting" lookup in authRoutes all
// speaking the same spelling of an address.

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV4_MAPPED = /^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/i;

// "::ffff:192.168.88.253" -> "192.168.88.253", "::1" -> "127.0.0.1".
// Anything else is returned untouched — a genuine IPv6 client stays IPv6 so it
// fails the isGrantableIp() check below loudly instead of being mangled into
// something that looks valid.
function normalizeIp(ip) {
  if (!ip) return ip;
  const value = String(ip).trim();
  const mapped = value.match(IPV4_MAPPED);
  if (mapped) return mapped[1];
  if (value === "::1") return "127.0.0.1";
  return value;
}

// Whether the router could plausibly hold a lease for this address. Loopback is
// excluded on purpose: an admin testing from the laptop's own browser arrives as
// ::1, and RouterOS would happily accept 127.0.0.1 as syntactically valid and
// leave a junk ip-binding + queue behind for a client that isn't on the WiFi.
function isGrantableIp(ip) {
  const value = normalizeIp(ip);
  if (!value || !IPV4.test(value)) return false;
  const octets = value.split(".").map(Number);
  if (octets.some((o) => o > 255)) return false;
  return octets[0] !== 127 && octets[0] !== 0;
}

module.exports = { normalizeIp, isGrantableIp };
