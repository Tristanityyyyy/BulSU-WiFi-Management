import { useEffect, useState } from "react";
import { Ticket, Ban, Printer, Pencil, Trash2, Eye } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import AlertBanner from "../ui/AlertBanner";
import ConfirmDialog from "../ui/ConfirmDialog";
import SuccessDialog from "../ui/SuccessDialog";
import ErrorDialog from "../ui/ErrorDialog";
import Modal from "../ui/Modal";

const PAGE_SIZE = 20;

const isGuestExpired = (g) => g.status === "expired" || new Date(g.expires_at) <= new Date();

// The voucher code is the whole pass. Split in half for the eye; the portal
// strips the dash back out. See bulsu-wifi-backend/utils/guestCode.js.
const guestCode = (g) => g.code || "";

// How many the pass admits and how many have come in. Passes issued before
// seats existed carry neither column, and they were all passes of one.
const guestSeats = (g) => Number(g.max_uses ?? 1);
const guestUsed = (g) => Number(g.uses ?? (g.status === "used" ? 1 : 0));
const guestSeatsLeft = (g) => Math.max(0, guestSeats(g) - guestUsed(g));
const formatGuestCode = (code) => (code && code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);


// A voucher is only usable if the address printed on it means something on the
// guest's phone, and the browser cannot test that for itself: every address the
// panel might name answers fine from the machine serving the portal — including
// one on an interface that is unplugged, because the OS keeps handing a
// disconnected adapter's own IP back to loopback. So ask the server which
// addresses are actually live (GET /api/admin/portal-address) and check the
// panel's host against them.
//
// This is the failure that reaches a guest standing at the desk: they type the
// address off the slip and nothing answers. Saying so here — before the voucher
// is printed — is the only place it can still be cheap to fix.
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1", ""];
const isIpv4 = (host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

function useUnreachableHostWarning() {
  const host = window.location.hostname;
  // Loopback needs nothing from the server to be certain about.
  const [warning, setWarning] = useState(
    LOOPBACK_HOSTS.includes(host)
      ? "This code names localhost, which on a guest's phone means the phone itself — it can never open. " +
          "Open the admin panel at the portal's network address (e.g. 192.168.88.5:5173) and generate it again."
      : ""
  );

  useEffect(() => {
    // A name rather than an address is somebody's DNS to answer for, not ours.
    if (LOOPBACK_HOSTS.includes(host) || !isIpv4(host)) return;

    let cancelled = false;
    adminApi
      .get("/admin/portal-address")
      .then(({ data }) => {
        const live = data?.addresses || [];
        if (cancelled || !live.length || live.includes(host)) return;
        setWarning(
          `This code names ${host}, but the portal is not reachable there right now — its live addresses are ` +
            `${live.join(", ")}. A guest typing that address would reach nothing. Open the panel at one of those and issue the voucher again.`
        );
      })
      .catch(() => {
        // Can't tell — better to say nothing than to cry wolf over a hiccup.
      });
    return () => {
      cancelled = true;
    };
  }, [host]);

  return warning;
}

const toLocalInputValue = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// The address a guest types the voucher into — the host the panel is open at,
// without a path, because that is what fits on a slip and is where the portal
// answers.
const portalHostLabel = () => (typeof window !== "undefined" ? window.location.host : "");

// The slip a guest is handed at the desk. Two things have to survive being read
// off paper by someone standing in a corridor: where to go, and what to type.
// Everything else on it is small print.
const printGuestVoucher = (guest) => {
  const win = window.open("", "_blank");
  if (!win) return;
  const seats = guestSeats(guest);
  win.document.write(`
    <html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:32px;text-align:center">
      <h2 style="margin:0 0 2px">BulSU Guest Wi-Fi</h2>
      <p style="color:#888;margin:0 0 20px;font-size:13px">Connect to <b>BULSU-WIFI</b>, then open your browser</p>
      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px">Go to</p>
      <p style="margin:0 0 20px;font-family:monospace;font-size:22px;font-weight:700">${portalHostLabel()}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px">Enter this code</p>
      <p style="margin:0;padding:12px 22px;border:2px dashed #999;border-radius:12px;font-family:monospace;font-size:34px;font-weight:700;letter-spacing:5px">${formatGuestCode(guestCode(guest))}</p>
      <p style="margin:18px 0 0;font-size:13px;color:#444">
        ${guest.data_limit_gb} GB${seats > 1 ? " each" : ""}
        ${seats > 1 ? `&nbsp;·&nbsp; <b>${seats} guests</b> may use this voucher — one connection each` : ""}
      </p>
      <p style="font-size:11px;color:#aaa;margin-top:10px">Valid ${new Date(guest.starts_at).toLocaleString()} — ${new Date(guest.expires_at).toLocaleString()}</p>
      <script>window.onload=()=>window.print()</script>
    </body></html>
  `);
  win.document.close();
};

function VoucherModal({ guest, title, subtitle, onClose }) {
  const warning = useUnreachableHostWarning();

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div>
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <AlertBanner message={warning} />
        {/* The voucher itself, at the size it will be read at. This is the whole
            credential now, so it gets the room a QR code would have taken. */}
        <div className="w-full bg-white dark:bg-wine-900 border-2 border-dashed border-pink-300 dark:border-pink-800 rounded-2xl px-4 py-5 animate-pop-in">
          <p className="text-[10px] font-semibold text-pink-400 uppercase tracking-wider">Voucher code</p>
          <p className="text-3xl sm:text-4xl font-bold font-mono tracking-[0.15em] text-pink-700 dark:text-pink-300 mt-1 select-all">
            {formatGuestCode(guestCode(guest))}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Enter at <span className="font-mono font-semibold text-gray-700 dark:text-gray-300 select-all">{portalHostLabel()}</span>
          </p>
        </div>
        <div className="w-full grid grid-cols-2 gap-2 text-left">
          <div className="bg-slate-50 dark:bg-wine-900 border border-slate-100 dark:border-wine-800/70 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Starts</p>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5">{new Date(guest.starts_at).toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 dark:bg-wine-900 border border-slate-100 dark:border-wine-800/70 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Expires</p>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5">{new Date(guest.expires_at).toLocaleString()}</p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/60 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-pink-400 uppercase tracking-wide">Data Limit</p>
            <p className="text-xs font-semibold text-pink-700 dark:text-pink-300 mt-0.5">
              {guest.data_limit_gb} GB{guestSeats(guest) > 1 ? " each" : ""}
            </p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/60 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-pink-400 uppercase tracking-wide">Guests</p>
            <p className="text-xs font-semibold text-pink-700 dark:text-pink-300 mt-0.5">
              {guestSeatsLeft(guest)} of {guestSeats(guest)} left
            </p>
          </div>
        </div>
        <button onClick={() => printGuestVoucher(guest)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2.5 hover:bg-pink-100 transition">
          <Printer size={13} /> Print voucher
        </button>
      </div>
    </Modal>
  );
}

function EditGuestModal({ guest, onClose, onSaved }) {
  const [startsAt, setStartsAt] = useState(toLocalInputValue(guest.starts_at));
  const [expiresAt, setExpiresAt] = useState(toLocalInputValue(guest.expires_at));
  const [maxUses, setMaxUses] = useState(guestSeats(guest));
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setConfirmSave(true);
  };

  const saveWindow = async () => {
    setConfirmSave(false);
    setSaving(true);
    setError("");
    try {
      await adminApi.put(`/admin/guests/${guest.id}`, { starts_at: startsAt, expires_at: expiresAt, max_uses: maxUses });
      onSaved("Guest access window updated.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update.");
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title="Edit Guest Access Window"
      subtitle="Adjust when this guest pass runs, and how many guests it admits."
      icon={<Pencil size={16} />}
    >
      {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Start Time</label>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
            className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" required />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">End Time</label>
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" required />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Guests</label>
          <input type="number" min={Math.max(1, guestUsed(guest))} max={200} step={1} value={maxUses}
            onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" />
          {/* Raising this reopens a pass that had filled; it cannot go below the
              number already admitted, and the server refuses that too. */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            {guestUsed(guest) > 0
              ? `${guestUsed(guest)} already used — this cannot go lower.`
              : "Nobody has used this pass yet."}
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-60 disabled:shadow-none transition">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {confirmSave && (
        <ConfirmDialog
          title="Save this access window?"
          message={`${guest.guest_name || "This guest"}'s pass will only work between the times you set. A guest currently online outside the new window is dropped at the next sweep.`}
          confirmLabel="Save Window"
          danger={false}
          onConfirm={saveWindow}
          onCancel={() => setConfirmSave(false)}
        />
      )}
    </Modal>
  );
}

export default function AdminGuests() {
  const [guests, setGuests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [defaultDataGb, setDefaultDataGb] = useState(1);
  const [form, setForm] = useState(() => {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60000);
    return { starts_at: toLocalInputValue(now), expires_at: toLocalInputValue(later), data_limit_gb: 1, max_uses: 1 };
  });
  const [generating, setGenerating] = useState(false);
  const [newGuest, setNewGuest] = useState(null);
  const [viewGuest, setViewGuest] = useState(null);
  const [editGuest, setEditGuest] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [generateError, setGenerateError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchGuests = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/guests", { params: { page: p, limit: PAGE_SIZE } });
      setGuests(res.data.guests);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  // Pull the default guest data limit from settings
  useEffect(() => {
    adminApi.get("/admin/settings").then((res) => {
      const gb = parseFloat(res.data.guest_data_limit_gb) || 1;
      setDefaultDataGb(gb);
      setForm((f) => ({ ...f, data_limit_gb: gb }));
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchGuests(page); }, [page]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setGenerateError("");
    try {
      const res = await adminApi.post("/admin/guests", form);
      setNewGuest(res.data);
      fetchGuests(1);
      setPage(1);
    } catch (err) {
      setGenerateError(err.response?.data?.message || err.message || "Failed to generate voucher.");
    } finally {
      setGenerating(false);
    }
  };

  const doConfirmedAction = async () => {
    const { id, action } = confirm;
    setConfirm(null);
    setActionError("");
    try {
      if (action === "revoke") {
        const res = await adminApi.patch(`/admin/guests/${id}/revoke`);
        // The code is revoked either way, but the device may still be online if
        // the router was unreachable — report that instead of a clean success.
        if (res.data?.warning) setActionError(res.data.warning);
        else setSuccess("Guest voucher revoked.");
      }
      if (action === "delete") {
        await adminApi.delete(`/admin/guests/${id}`);
        setSuccess("Guest code deleted.");
      }
      fetchGuests(page);
    } catch (err) {
      setActionError(err.response?.data?.message || `Failed to ${action} guest.`);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["Data Limit", "Guests", "Starts", "Expires", "Status", "Actions"];
  const rows = guests.map((g) => {
    const expired = isGuestExpired(g);
    return (
      <>
        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
          {g.data_limit_gb ? `${g.data_limit_gb} GB${guestSeats(g) > 1 ? " ea." : ""}` : "—"}
        </td>
        {/* Used against total, not places left: an admin scanning the list wants
            to see take-up, and "0 of 20" would read as an empty pass rather than
            an untouched one. */}
        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {guestUsed(g)} / {guestSeats(g)}
        </td>
        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{new Date(g.starts_at).toLocaleString()}</td>
        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{new Date(g.expires_at).toLocaleString()}</td>
        <td className="px-4 py-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
            g.status === "active" ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900"
            : g.status === "used" ? "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-wine-700"
            : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900"
          }`}>{g.status}</span>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-3 flex-nowrap items-center">
            <button onClick={() => setViewGuest(g)}
              className="inline-flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 hover:underline shrink-0">
              <Eye size={12} /> View
            </button>
            <button onClick={() => setEditGuest(g)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:underline shrink-0">
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => g.status === "active" && setConfirm({ id: g.id, action: "revoke", label: "Revoke this guest voucher?" })}
              disabled={g.status !== "active"}
              title={g.status !== "active" ? "Only active guest codes can be revoked" : undefined}
              className={`inline-flex items-center gap-1 text-xs shrink-0 ${g.status === "active" ? "text-red-600 dark:text-red-400 hover:underline" : "text-gray-300 dark:text-wine-700 cursor-not-allowed"}`}>
              <Ban size={12} /> Revoke
            </button>
            <button
              onClick={() => expired && setConfirm({ id: g.id, action: "delete", label: "Delete this guest code? This cannot be undone." })}
              disabled={!expired}
              title={!expired ? "Only expired guest codes can be deleted" : undefined}
              className={`inline-flex items-center gap-1 text-xs shrink-0 ${expired ? "text-red-600 dark:text-red-400 hover:underline" : "text-gray-300 dark:text-wine-700 cursor-not-allowed"}`}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </td>
      </>
    );
  });

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Guest Access</h2>

      {/* Generate form */}
      <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-5">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Generate Guest Voucher</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">No name or password needed — the guest enters their name after the voucher.</p>
        {generateError && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">{generateError}</p>
        )}
        <form onSubmit={handleGenerate} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Start Time</label>
            <input type="datetime-local" value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              className="border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">End Time</label>
            <input type="datetime-local" value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              className="border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
              Data Limit (GB)
              <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal">(default: {defaultDataGb} GB from Settings)</span>
            </label>
            <input type="number" min={0.1} step={0.1} value={form.data_limit_gb}
              onChange={(e) => setForm({ ...form, data_limit_gb: parseFloat(e.target.value) })}
              className="border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-32" />
          </div>
          {/* One pass, several visitors. The limit above is per guest, not shared,
              which is the thing an admin has to know before typing 20 here. */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
              Guests
              <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal">(each gets their own {form.data_limit_gb || defaultDataGb} GB)</span>
            </label>
            <input type="number" min={1} max={200} step={1} value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-24" />
          </div>
          <button type="submit" disabled={generating}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl px-5 py-2 text-sm font-semibold shadow-md disabled:opacity-60 transition">
            <Ticket size={15} />
            {generating ? "Generating…" : "Generate voucher"}
          </button>
        </form>
      </div>

      {newGuest && (
        <VoucherModal guest={newGuest} title="Guest Voucher Ready"
          subtitle={guestSeats(newGuest) > 1
            ? `Up to ${guestSeats(newGuest)} guests can use this voucher — each enters their own name.`
            : "Guest enters this code, then their name."}
          onClose={() => setNewGuest(null)} />
      )}

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        colWidths={["110px", null, null, "110px", "320px"]}
        emptyText="No guest codes issued yet."
        emptyHint="Generate a voucher above to grant a guest temporary Wi-Fi access." />

      {viewGuest && (
        <VoucherModal guest={viewGuest} title="Guest Voucher"
          onClose={() => setViewGuest(null)} />
      )}

      {editGuest && (
        <EditGuestModal
          guest={editGuest}
          onClose={() => setEditGuest(null)}
          onSaved={(message) => { setEditGuest(null); fetchGuests(page); setSuccess(message); }}
        />
      )}

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doConfirmedAction} onCancel={() => setConfirm(null)} />}
      {success && <SuccessDialog message={success} onClose={() => setSuccess("")} />}
      {actionError && (
        <ErrorDialog
          title="That didn't work"
          message={actionError}
          onClose={() => setActionError("")}
        />
      )}
    </div>
  );
}
