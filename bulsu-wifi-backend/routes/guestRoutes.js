const express = require("express");
const router = express.Router();
const db = require("../db");
const { grantAccess } = require("../utils/routeros");
const { normalizeIp } = require("../utils/ip");
const { callerAddress, addressStillHeldBy } = require("../utils/device");
const { getRoleBandwidth } = require("../utils/settings");
const { isGuestCodeShaped, normalizeGuestCode } = require("../utils/guestCode");

// A guest pass is a voucher code and nothing else. It used to also carry a long
// token for a QR code to encode; that route is gone, and with it the only
// reason a pass ever had two names.
//
// Anything not shaped like a voucher is refused without a query — there is no
// second column left for it to match, so asking the database would only be a
// slower way to reach the same answer.
async function findGuestByVoucher(voucher, columns) {
  if (!isGuestCodeShaped(voucher)) return null;
  const [[guest]] = await db.query(
    `SELECT ${columns} FROM guests WHERE code = ? LIMIT 1`,
    [normalizeGuestCode(voucher)]
  );
  return guest || null;
}

// How many places are left on a voucher, and how to say so when there are none.
// A one-seat voucher is the ordinary case and deserves the ordinary words —
// being told a voucher of one is "full" reads like a system fault rather than a
// code somebody else already used.
const seatsLeft = (guest) => Math.max(0, Number(guest.max_uses || 1) - Number(guest.uses || 0));

function passFullMessage(guest) {
  const seats = Number(guest.max_uses || 1);
  return seats <= 1
    ? "This voucher has already been used."
    : `This voucher is full — all ${seats} places have been taken.`;
}

// A short code is short enough to be worth guessing at, which the 48-character
// token never was. The window it protects is hours long, so the cost of a guess
// is what has to carry it: a device gets a small number of misses before the
// endpoint stops answering.
//
// Only a *miss* counts. An expired or already-used pass is a correct answer
// about a real row, and the guest holding it will retry — charging them for
// that would lock out the very person the code belongs to. In memory on
// purpose: this is one process guarding one desk, and a restart clearing it is
// the right trade against a table to migrate and prune.
const MISS_WINDOW_MS = 10 * 60 * 1000;
const MISS_LIMIT = 10;
const misses = new Map();

function missKey(req) {
  return callerAddress(req) || normalizeIp(req.ip) || "unknown";
}

function tooManyMisses(req) {
  const key = missKey(req);
  const entry = misses.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > MISS_WINDOW_MS) {
    misses.delete(key);
    return false;
  }
  return entry.count >= MISS_LIMIT;
}

function noteMiss(req) {
  const key = missKey(req);
  const entry = misses.get(key);
  if (!entry || Date.now() - entry.firstAt > MISS_WINDOW_MS) {
    misses.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count++;
}

function clearMisses(req) {
  misses.delete(missKey(req));
}

// Nothing above expires on its own, so drop entries once their window has
// closed rather than letting one key per visiting device accumulate forever.
setInterval(() => {
  const cutoff = Date.now() - MISS_WINDOW_MS;
  for (const [key, entry] of misses) if (entry.firstAt < cutoff) misses.delete(key);
}, MISS_WINDOW_MS).unref();

// Which active guest session, if any, belongs to the device making this request
// — the guest-pass counterpart of recognizeDevice() in sessionRoutes.js, sharing
// the same check (utils/device.js). null means "not recognised".
async function recognizeGuestDevice(req) {
  const ip = callerAddress(req);
  if (!ip) return null;

  const [[session]] = await db.query(
    `SELECT gs.id, gs.guest_name, gs.mac_address, gs.status, gs.bytes_used,
            g.data_limit_gb, g.expires_at
       FROM guest_sessions gs JOIN guests g ON g.id = gs.guest_id
      WHERE gs.status = 'active' AND gs.ip_address = ?
      ORDER BY gs.id DESC LIMIT 1`,
    [ip]
  );
  if (!session) return null;
  if (!(await addressStillHeldBy(ip, session.mac_address))) return null;
  return session;
}

// GET /api/guest/token-status?token=...
// Read-only check — does NOT create a session or consume the voucher. The
// query parameter keeps its old name so a link already in circulation still
// resolves; what it carries is a voucher code.
router.get("/token-status", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: "A code is required." });
    if (tooManyMisses(req))
      return res.status(429).json({ message: "Too many incorrect codes. Please wait a few minutes, or ask the desk for a new pass." });

    const guest = await findGuestByVoucher(token, "status, starts_at, expires_at, max_uses, uses");

    if (!guest) {
      noteMiss(req);
      return res.status(404).json({ message: "That code was not recognised." });
    }
    clearMisses(req);

    // Out of places is the same answer as spent — the client already knows how
    // to handle it — but carry the seat count so it can say which one happened.
    if (guest.status === "used" || seatsLeft(guest) === 0)
      return res.json({ status: "used", maxUses: Number(guest.max_uses || 1) });
    // 'expired' covers both a lapsed window and an admin revoking the code early.
    if (guest.status === "expired") return res.json({ status: "expired" });
    if (new Date(guest.expires_at) < new Date()) return res.json({ status: "expired" });
    if (new Date(guest.starts_at) > new Date()) return res.json({ status: "not_started", startsAt: guest.starts_at });

    res.json({ status: "active", seatsLeft: seatsLeft(guest), maxUses: Number(guest.max_uses || 1) });
  } catch (err) {
    console.error("GET /guest/token-status failed:", err);
    res.status(500).json({ message: "Unable to check this voucher right now. Please try again." });
  }
});

// POST /api/guest/verify
// Creates the guest session and marks the token as used
router.post("/verify", async (req, res) => {
  // Same normalisation as the student login — see utils/ip.js.
  const clientIp = normalizeIp(req.ip);
  try {
    // `qrCode` keeps its old name for compatibility; it carries a voucher code.
    const { qrCode, guestName } = req.body;
    if (!qrCode || !guestName) return res.status(400).json({ message: "A code and a name are required." });
    if (tooManyMisses(req))
      return res.status(429).json({ message: "Too many incorrect codes. Please wait a few minutes, or ask the desk for a new pass." });

    const guest = await findGuestByVoucher(qrCode, "*");

    if (!guest) {
      noteMiss(req);
      return res.status(404).json({ message: "That code was not recognised." });
    }
    clearMisses(req);
    if (guest.status === "used" || seatsLeft(guest) === 0)
      return res.status(400).json({ message: passFullMessage(guest) });
    // An admin can revoke a code while its window is still open — status carries that.
    if (guest.status === "expired") return res.status(400).json({ message: "This voucher is no longer valid." });
    if (new Date(guest.expires_at) < new Date()) return res.status(400).json({ message: "This voucher has expired." });
    if (new Date(guest.starts_at) > new Date())
      return res.status(400).json({ message: `This voucher is not active yet. It becomes available at ${new Date(guest.starts_at).toLocaleString()}.` });

    // Claim one seat atomically — the check above is a read, so two near-
    // simultaneous POSTs (a double-tap on mobile, or the last place on a pass
    // being taken by two people at once) would both pass it and create two
    // sessions and two router grants where only one place existed.
    const [claim] = await db.query(
      "UPDATE guests SET uses = uses + 1 WHERE id = ? AND status = 'active' AND uses < max_uses",
      [guest.id]
    );
    if (!claim.affectedRows) return res.status(400).json({ message: passFullMessage(guest) });

    // Taking the last place closes the pass. Kept separate from the claim so
    // that claim stays a single conditional update, which is what makes it
    // race-safe; this one is idempotent, so a concurrent claimant running it
    // too changes nothing.
    await db.query("UPDATE guests SET status = 'used' WHERE id = ? AND uses >= max_uses", [guest.id]);

    let guestSessionId;
    try {
      const [inserted] = await db.query(
        "INSERT INTO guest_sessions (guest_id, guest_name, mac_address, ip_address, login_time, status) VALUES (?,?,NULL,?,NOW(),'active')",
        [guest.id, guestName, clientIp]
      );
      guestSessionId = inserted.insertId;
    } catch (err) {
      // Give the seat back rather than burning it on a failed attempt —
      // otherwise the guest's retry is turned away from a place they never got.
      // Reopen the pass only if this claim is what closed it, and never revive
      // one an admin expired in the meantime.
      await db
        .query(
          `UPDATE guests
              SET uses = GREATEST(uses - 1, 0),
                  status = IF(status = 'used', 'active', status)
            WHERE id = ?`,
          [guest.id]
        )
        .catch(() => {});
      throw err;
    }

    // Open the real MikroTik gate + start metering this guest. Best-effort,
    // exactly like the student login (authRoutes): a null return (router down
    // or MIKROTIK_HOST unset) must never block the guest from connecting.
    // Isolated from the response path on purpose — the token is already spent, so
    // a throw here (router library, or the metering columns missing because
    // scripts/addGuestSessionMetering.js hasn't been run) must not 500 and cost
    // the guest their code. The meter's self-heal picks the session up instead.
    try {
      const limits = await getRoleBandwidth("guest");
      const granted = await grantAccess(clientIp, guestSessionId, "guest", limits);
      if (granted) {
        await db.query(
          "UPDATE guest_sessions SET queue_id=?, last_bytes=0, bytes_used=0, mac_address=COALESCE(?, mac_address) WHERE id=?",
          [granted.queueId, granted.mac, guestSessionId]
        );
      }
    } catch (err) {
      console.error("Guest router grant failed (session kept, meter will retry):", err.message);
    }

    res.json({
      guest: {
        name: guestName,
        expiresAt: guest.expires_at,
        dataLimitGb: guest.data_limit_gb,
      },
    });
  } catch (err) {
    console.error("POST /guest/verify failed:", err);
    res.status(500).json({ message: "Unable to connect right now. Please try again." });
  }
});

// GET /api/guest/me — this device's own guest session, with no voucher needed.
//
// A guest is worse off than an account holder without this. Their credential is
// a voucher code, and connecting spends a place on it. So when the captive-
// portal window closes — which it does, seconds after connecting — the guest
// has no way back in at all. Entering the voucher again gets "already been
// used", and the slip itself is back at the registration desk they may no
// longer be standing at. The session is live and running its data down, and
// they cannot see any of it.
//
// Recognising the device closes that off: the same address-plus-MAC check the
// account side uses (utils/device.js), against the guest session rather than a
// user one. Nothing here spends a token, creates a session, or extends one — it
// reads back a session the caller's own device is already holding.
//
// 404 means "not recognised", which the portal shows as "ask at the desk".
router.get("/me", async (req, res) => {
  try {
    const session = await recognizeGuestDevice(req);
    if (!session) return res.status(404).json({ message: "This device isn't connected." });

    res.json({
      guestName: session.guest_name,
      status: session.status,
      bytesUsed: Number(session.bytes_used || 0),
      dataLimitMb: session.data_limit_gb > 0 ? session.data_limit_gb * 1024 : null, // null = unlimited
      expiresAt: session.expires_at,
      recognizedDevice: true,
    });
  } catch (err) {
    console.error("GET /guest/me failed:", err);
    res.status(500).json({ message: "Unable to load this device's session." });
  }
});

// GET /api/guest/session-status?token=...
// Polled by the guest dashboard after connecting so it reflects reality — a
// data-cap or admin cutoff ends the session server-side, and the client needs
// to see that instead of counting down forever. Keyed off the voucher (no JWT
// for guests); returns the latest session tied to it.
router.get("/session-status", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: "A code is required." });

    // Same either-form pass as everywhere else, resolved to its row first so
    // the join below does not have to know which column matched.
    const guest = await findGuestByVoucher(token, "id");
    if (!guest) return res.status(404).json({ message: "No session found for this code." });

    const [[row]] = await db.query(
      `SELECT gs.status, gs.bytes_used, g.data_limit_gb, g.expires_at
         FROM guest_sessions gs
         JOIN guests g ON g.id = gs.guest_id
        WHERE g.id = ?
        ORDER BY gs.id DESC LIMIT 1`,
      [guest.id]
    );
    if (!row) return res.status(404).json({ message: "No session found for this code." });

    res.json({
      status: row.status, // 'active' | 'timeout' | 'data_limit' | 'force-disconnected' | 'ended'
      bytesUsed: Number(row.bytes_used || 0),
      dataLimitMb: row.data_limit_gb > 0 ? row.data_limit_gb * 1024 : null, // null = unlimited
      expiresAt: row.expires_at,
    });
  } catch (err) {
    console.error("GET /guest/session-status failed:", err);
    res.status(500).json({ message: "Unable to load session status." });
  }
});

module.exports = router;
