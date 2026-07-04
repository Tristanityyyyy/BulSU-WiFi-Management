import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Ban, X } from "lucide-react";
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
  const [form, setForm] = useState({ guest_name: "", duration_minutes: 60 });
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

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["Guest Name", "Created", "Expires", "Status", "Actions"];
  const rows = guests.map((g) => (
    <>
      <td className="px-4 py-2 text-gray-800">{g.guest_name}</td>
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
            <button onClick={() => setConfirm({ id: g.id, label: `Revoke access for ${g.guest_name}?` })}
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
        <p className="text-sm font-semibold text-gray-700 mb-4">Generate Guest QR Code</p>
        <form onSubmit={handleGenerate} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Guest Name</label>
            <input value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
              placeholder="e.g. John Doe"
              className="border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-48"
              required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Duration (minutes)</label>
            <input type="number" min={5} max={480} value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
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
          <p className="text-sm font-semibold text-gray-700">QR Code for {newGuest.guest_name}</p>
          <div className="p-3 border-2 border-pink-200 rounded-2xl">
            <QRCodeSVG value={`${GUEST_PORTAL}?token=${newGuest.qr_code}`} size={180} />
          </div>
          <p className="text-xs text-gray-400">Expires: {new Date(newGuest.expires_at).toLocaleString()}</p>
          <button onClick={() => setNewGuest(null)} className="inline-flex items-center gap-1 text-xs text-pink-500 hover:underline">
            <X size={12} /> Dismiss
          </button>
        </div>
      )}

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        emptyText="No guest codes issued yet."
        emptyHint="Generate a QR code above to grant a guest temporary Wi-Fi access." />

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doRevoke} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
