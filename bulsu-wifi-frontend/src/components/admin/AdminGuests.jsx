import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Ban, X, Printer } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";

const PAGE_SIZE = 20;
const GUEST_PORTAL = import.meta.env.VITE_GUEST_PORTAL || "http://localhost:5173/guest";

export default function AdminGuests() {
  const [guests, setGuests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [defaultDataGb, setDefaultDataGb] = useState(1);
  const [form, setForm] = useState({ duration_minutes: 60, data_limit_gb: 1 });
  const [generating, setGenerating] = useState(false);
  const [newGuest, setNewGuest] = useState(null);
  const [confirm, setConfirm] = useState(null);

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
    try {
      const res = await adminApi.post("/admin/guests", form);
      setNewGuest(res.data);
      fetchGuests(1);
      setPage(1);
    } finally {
      setGenerating(false);
    }
  };

  const doRevoke = async () => {
    const id = confirm.id;
    setConfirm(null);
    await adminApi.patch(`/admin/guests/${id}/revoke`);
    fetchGuests(page);
  };

  const handlePrint = () => {
    const qrUrl = `${GUEST_PORTAL}?token=${newGuest.qr_code}`;
    const win = window.open("", "_blank");
    win.document.write(`
      <html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:32px">
        <h2 style="margin-bottom:4px">BulSU Guest Wi-Fi</h2>
        <p style="color:#888;margin-bottom:16px;font-size:13px">Scan to connect — valid for ${form.duration_minutes} min / ${newGuest.data_limit_gb} GB</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}" />
        <p style="font-size:11px;color:#aaa;margin-top:12px">Expires: ${new Date(newGuest.expires_at).toLocaleString()}</p>
        <script>window.onload=()=>window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["Guest Name", "Data Limit", "Created", "Expires", "Status", "Actions"];
  const rows = guests.map((g) => (
    <>
      <td className="px-4 py-2 text-gray-800">{g.guest_name || <span className="text-gray-400 italic">Pending</span>}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{g.data_limit_gb ? `${g.data_limit_gb} GB` : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{new Date(g.created_at).toLocaleString()}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{new Date(g.expires_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
          g.status === "active" ? "bg-green-50 text-green-700 border-green-200"
          : g.status === "used" ? "bg-gray-100 text-gray-500 border-gray-200"
          : "bg-red-50 text-red-600 border-red-200"
        }`}>{g.status}</span>
      </td>
      <td className="px-4 py-2">
        {g.status === "active" && (
          <button onClick={() => setConfirm({ id: g.id, label: `Revoke this guest QR code?` })}
            className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline">
            <Ban size={12} /> Revoke
          </button>
        )}
      </td>
    </>
  ));

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Guest Access</h2>

      {/* Generate form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-1">Generate Guest QR Code</p>
        <p className="text-xs text-gray-400 mb-4">No name or password needed — the guest will enter their name after scanning.</p>
        <form onSubmit={handleGenerate} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Duration (minutes)</label>
            <input type="number" min={5} max={480} value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              className="border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-32" />
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

      {/* New QR display */}
      {newGuest && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-gray-700">Guest QR Code Ready</p>
          <p className="text-xs text-gray-400">Guest will enter their name after scanning.</p>
          <div className="p-3 border-2 border-pink-200 rounded-2xl">
            <QRCodeSVG value={`${GUEST_PORTAL}?token=${newGuest.qr_code}`} size={180} />
          </div>
          <div className="text-center space-y-0.5">
            <p className="text-xs text-gray-500">Duration: <span className="font-medium">{form.duration_minutes} min</span></p>
            <p className="text-xs text-gray-500">Data Limit: <span className="font-medium">{newGuest.data_limit_gb} GB</span></p>
            <p className="text-xs text-gray-400">Expires: {new Date(newGuest.expires_at).toLocaleString()}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-xs bg-pink-50 text-pink-600 border border-pink-200 rounded-lg px-3 py-1.5 hover:bg-pink-100 transition">
              <Printer size={12} /> Print QR
            </button>
            <button onClick={() => setNewGuest(null)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:underline">
              <X size={12} /> Dismiss
            </button>
          </div>
        </div>
      )}

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        emptyText="No guest codes issued yet."
        emptyHint="Generate a QR code above to grant a guest temporary Wi-Fi access." />

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doRevoke} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
