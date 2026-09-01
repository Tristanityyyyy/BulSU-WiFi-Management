const crypto = require("crypto");

// The voucher code printed on a guest slip — the whole of a guest credential.
//
// A phone joined to the hotspot usually shows the OS sign-in sheet rather than
// a real browser, and that sheet is a restricted WebView: the camera API is
// absent over plain HTTP whatever the permissions say, and even a photo-capture
// file input is not guaranteed. Something typeable is the only guest path that
// works everywhere, which is why it is the only one left.
//
// The alphabet drops 0/O/1/I/L — the characters people misread off a poster and
// mistype back. 8 characters over 31 symbols is ~8.5e11 combinations, which is
// far too sparse to walk through against a live window that is measured in
// hours; the attempt throttle in routes/guestRoutes.js is what closes the rest.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

function generateGuestCode() {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

// What a guest typed, reduced to what is stored. Case, spaces and the display
// dash are all noise — a guest copying "k7p4-m2qb" off a poster means the same
// thing as "K7P4M2QB", and telling them otherwise is a support call.
function normalizeGuestCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

// How the code is shown: split in half so the eye can hold it. Only ever for
// display — never store or compare this form.
function formatGuestCode(code) {
  const c = normalizeGuestCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

// True if a string could be a code at all. Lets the lookup skip the code column
// for anything token-shaped, and lets the client validate before a round trip.
function isGuestCodeShaped(raw) {
  const c = normalizeGuestCode(raw);
  return c.length === CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch));
}

module.exports = { ALPHABET, CODE_LENGTH, generateGuestCode, normalizeGuestCode, formatGuestCode, isGuestCodeShaped };
