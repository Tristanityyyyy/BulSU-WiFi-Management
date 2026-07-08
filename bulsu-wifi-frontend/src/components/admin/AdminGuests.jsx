import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { QrCode, Ban, Printer, Download, Pencil, Trash2, Eye } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "../ui/Modal";

const PAGE_SIZE = 20;
const GUEST_PORTAL = import.meta.env.VITE_GUEST_PORTAL || "http://localhost:5173/guest";

const isGuestExpired = (g) => g.status === "expired" || new Date(g.expires_at) <= new Date();
const guestToken = (g) => g.token || g.qr_code;

const toLocalInputValue = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const printGuestQr = (guest) => {
  const qrUrl = `${GUEST_PORTAL}?token=${guestToken(guest)}`;
  const win = window.open("", "_blank");
  win.document.write(`
    <html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:32px">
      <h2 style="margin-bottom:4px">BulSU Guest Wi-Fi</h2>
      <p style="color:#888;margin-bottom:16px;font-size:13px">Scan to connect — ${guest.data_limit_gb} GB, valid ${new Date(guest.starts_at).toLocaleString()} to ${new Date(guest.expires_at).toLocaleString()}</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}" />
      <p style="font-size:11px;color:#aaa;margin-top:12px">Expires: ${new Date(guest.expires_at).toLocaleString()}</p>
      <script>window.onload=()=>window.print()</script>
    </body></html>
  `);
  win.document.close();
};

function QrModal({ guest, title, subtitle, onClose }) {
  const qrCanvasRef = useRef(null);

  const handleDownload = () => {
    const canvas = qrCanvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `guest-qr-${guestToken(guest)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div>
          <p className="text-base font-semibold text-gray-900">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div ref={qrCanvasRef} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm animate-pop-in">
          <QRCodeCanvas value={`${GUEST_PORTAL}?token=${guestToken(guest)}`} size={180} />
        </div>
        <div className="w-full grid grid-cols-2 gap-2 text-left">
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Starts</p>
            <p className="text-xs font-medium text-gray-700 mt-0.5">{new Date(guest.starts_at).toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Expires</p>
            <p className="text-xs font-medium text-gray-700 mt-0.5">{new Date(guest.expires_at).toLocaleString()}</p>
          </div>
          <div className="col-span-2 bg-pink-50 border border-pink-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-pink-400 uppercase tracking-wide">Data Limit</p>
            <p className="text-xs font-semibold text-pink-700 mt-0.5">{guest.data_limit_gb} GB</p>
          </div>
        </div>
        <div className="w-full flex gap-2">
          <button onClick={handleDownload}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-pink-50 text-pink-600 border border-pink-200 rounded-xl px-3 py-2.5 hover:bg-pink-100 transition">
            <Download size={13} /> Download
          </button>
          <button onClick={() => printGuestQr(guest)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-pink-50 text-pink-600 border border-pink-200 rounded-xl px-3 py-2.5 hover:bg-pink-100 transition">
            <Printer size={13} /> Print
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditGuestModal({ guest, onClose, onSaved }) {
  const [startsAt, setStartsAt] = useState(toLocalInputValue(guest.starts_at));
  const [expiresAt, setExpiresAt] = useState(toLocalInputValue(guest.expires_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminApi.put(`/admin/guests/${guest.id}`, { starts_at: startsAt, expires_at: expiresAt });
      onSaved();
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
      subtitle="Adjust when this guest pass starts and expires."
      icon={<Pencil size={16} />}
    >
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Start Time</label>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" required />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">End Time</label>
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" required />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 disabled:opacity-60 disabled:shadow-none transition">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
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
    return { starts_at: toLocalInputValue(now), expires_at: toLocalInputValue(later), data_limit_gb: 1 };
  });
  const [generating, setGenerating] = useState(false);
  const [newGuest, setNewGuest] = useState(null);
  const [viewGuest, setViewGuest] = useState(null);
  const [editGuest, setEditGuest] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [generateError, setGenerateError] = useState("");
  const [actionError, setActionError] = useState("");

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
      setGenerateError(err.response?.data?.message || err.message || "Failed to generate QR code.");
    } finally {
      setGenerating(false);
    }
  };

  const doConfirmedAction = async () => {
    const { id, action } = confirm;
    setConfirm(null);
    setActionError("");
    try {
      if (action === "revoke") await adminApi.patch(`/admin/guests/${id}/revoke`);
      if (action === "delete") await adminApi.delete(`/admin/guests/${id}`);
      fetchGuests(page);
    } catch (err) {
      setActionError(err.response?.data?.message || `Failed to ${action} guest.`);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["Data Limit", "Starts", "Expires", "Status", "Actions"];
  const rows = guests.map((g) => {
    const expired = isGuestExpired(g);
    return (
      <>
        <td className="px-4 py-2 text-xs text-gray-500">{g.data_limit_gb ? `${g.data_limit_gb} GB` : "—"}</td>
        <td className="px-4 py-2 text-xs text-gray-500">{new Date(g.starts_at).toLocaleString()}</td>
        <td className="px-4 py-2 text-xs text-gray-500">{new Date(g.expires_at).toLocaleString()}</td>
        <td className="px-4 py-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
            g.status === "active" ? "bg-green-50 text-green-700 border-green-200"
            : g.status === "used" ? "bg-gray-100 text-gray-500 border-gray-200"
            : "bg-red-50 text-red-600 border-red-200"
          }`}>{g.status}</span>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-3 flex-nowrap items-center">
            <button onClick={() => setViewGuest(g)}
              className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline shrink-0">
              <Eye size={12} /> View
            </button>
            <button onClick={() => setEditGuest(g)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline shrink-0">
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => g.status === "active" && setConfirm({ id: g.id, action: "revoke", label: "Revoke this guest QR code?" })}
              disabled={g.status !== "active"}
              title={g.status !== "active" ? "Only active guest codes can be revoked" : undefined}
              className={`inline-flex items-center gap-1 text-xs shrink-0 ${g.status === "active" ? "text-red-600 hover:underline" : "text-gray-300 cursor-not-allowed"}`}>
              <Ban size={12} /> Revoke
            </button>
            <button
              onClick={() => expired && setConfirm({ id: g.id, action: "delete", label: "Delete this guest code? This cannot be undone." })}
              disabled={!expired}
              title={!expired ? "Only expired guest codes can be deleted" : undefined}
              className={`inline-flex items-center gap-1 text-xs shrink-0 ${expired ? "text-red-600 hover:underline" : "text-gray-300 cursor-not-allowed"}`}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </td>
      </>
    );
  });

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Guest Access</h2>

      {/* Generate form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-1">Generate Guest QR Code</p>
        <p className="text-xs text-gray-400 mb-4">No name or password needed — the guest will enter their name after scanning.</p>
        {generateError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{generateError}</p>
        )}
        <form onSubmit={handleGenerate} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Start Time</label>
            <input type="datetime-local" value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              className="border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">End Time</label>
            <input type="datetime-local" value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              className="border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Data Limit (GB)
              <span className="ml-1 text-gray-400 font-normal">(default: {defaultDataGb} GB from Settings)</span>
            </label>
            <input type="number" min={0.1} step={0.1} value={form.data_limit_gb}
              onChange={(e) => setForm({ ...form, data_limit_gb: parseFloat(e.target.value) })}
              className="border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-32" />
          </div>
          <button type="submit" disabled={generating}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl px-5 py-2 text-sm font-semibold shadow-md disabled:opacity-60 transition">
            <QrCode size={15} />
            {generating ? "Generating…" : "Generate QR"}
          </button>
        </form>
      </div>

      {actionError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{actionError}</p>
      )}

      {newGuest && (
        <QrModal guest={newGuest} title="Guest QR Code Ready" subtitle="Guest will enter their name after scanning."
          onClose={() => setNewGuest(null)} />
      )}

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        colWidths={["110px", null, null, "110px", "320px"]}
        emptyText="No guest codes issued yet."
        emptyHint="Generate a QR code above to grant a guest temporary Wi-Fi access." />

      {viewGuest && (
        <QrModal guest={viewGuest} title="Guest QR Code"
          onClose={() => setViewGuest(null)} />
      )}

      {editGuest && (
        <EditGuestModal
          guest={editGuest}
          onClose={() => setEditGuest(null)}
          onSaved={() => { setEditGuest(null); fetchGuests(page); }}
        />
      )}

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doConfirmedAction} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
