// Recognising a device by where it sits on the network, rather than by anything
// it types.
//
// A captive portal hands out two things at login: access, and a window that the
// phone's OS closes seconds later. The session view the user actually keeps is
// the one they open in their real browser afterwards — a separate storage
// sandbox, with no token in it and no way to be given one by the window that
// had it. So the browser is identified as a *device* instead.
//
// The credential is network position: you are the device holding that lease, and
// the router agrees it is associated right now. That is precisely the trust the
// hotspot already extends to the address when it routes its packets, and what
// the login path leans on when it treats a repeat login from a live session's
// address as that device reconnecting rather than a new one.
//
// Both session kinds — accounts (`sessions`) and guest passes (`guest_sessions`)
// — identify their devices this way, so the check lives here rather than in
// either route file.

const { readNetworkPresence, readClientMac } = require("./routeros");
const { normalizeIp, isGrantableIp } = require("./ip");

// The address this request came from, or null if it isn't one the router could
// plausibly hold a lease for. Loopback (the portal laptop's own browser) has no
// lease and no router footprint, so there is no device there to recognise.
function callerAddress(req) {
  const ip = normalizeIp(req.ip);
  return isGrantableIp(ip) ? ip : null;
}

// Does the router still agree that `ip` belongs to the device which recorded
// `recordedMac` when its session began?
//
// This is what makes leaning on the address safe: DHCP handing it to somebody
// else changes the MAC, and the match fails, so a recycled lease cannot inherit
// the previous holder's session.
//
// When the router can't be reached the check degrades to the address alone. That
// is deliberate — the alternative is that a router hiccup locks every connected
// user out of their own session view — and it still requires the caller to
// actually hold that address on the LAN.
async function addressStillHeldBy(ip, recordedMac) {
  const presence = await readNetworkPresence();
  if (!presence) return true;

  const current = presence.macByIp.get(ip) || null;
  const recorded = recordedMac ? String(recordedMac).toUpperCase() : null;
  return !!current && presence.liveMacs.has(current) && (!recorded || recorded === current);
}

// The MAC of whoever is asking, or null when the router cannot say.
//
// Sits between callerAddress() and the session lookup: the address alone is a
// weak name for a device, because DHCP reassigns it. A phone that drops the
// Wi-Fi and rejoins is very often the same device on a different lease, and
// keying a lookup on the address alone tells that phone it isn't recognised —
// which is exactly the moment a user goes looking for their own figures.
async function callerMac(req) {
  const ip = callerAddress(req);
  if (!ip) return null;
  const mac = await readClientMac(ip);
  return mac ? String(mac).toUpperCase() : null;
}

// Finds this request's session, by address first and by MAC second.
//
// `byAddress` and `byMac` are the two lookups the caller supplies, because the
// two session kinds live in different tables; everything else about the
// decision is the same for both and belongs here.
//
// The address match is tried first and is the cheap path — it needs no router
// round-trip — and it still carries the MAC cross-check that makes leaning on
// an address safe. Only when it misses do we pay for the router lookup, so a
// device that never changed lease costs exactly what it always did.
//
// A MAC match needs no cross-check: it *is* the identity the cross-check was
// protecting, and a caller cannot present a MAC of their choosing — it is read
// from the router's own ARP and lease tables for the address the packet
// actually arrived from.
async function findSessionForCaller(req, { byAddress, byMac }) {
  const ip = callerAddress(req);
  if (!ip) return null;

  const onAddress = await byAddress(ip);
  if (onAddress && (await addressStillHeldBy(ip, onAddress.mac_address))) return onAddress;

  const mac = await callerMac(req);
  if (!mac) return null;
  return (await byMac(mac)) || null;
}

module.exports = { callerAddress, addressStillHeldBy, callerMac, findSessionForCaller };
