import { useEffect, useState } from "react";
import { Siren, PowerOff } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";

const PAGE_SIZE = 20;

export default function AdminEmergency() {
  const [priorities, setPriorities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activateModal, setActivateModal] = useState(false);
  const [form, setForm] = useState({ user_id: "", reason: "" });
  const [activating, setActivating] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState(null);

  const fetchPriorities = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/emergency", { params: { page: p, limit: PAGE_SIZE } });
      setPriorities(res.data.priorities);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPriorities(page); }, [page]);

  const handleActivate = async (e) => {
    e.preventDefault();
    setFormError("");
    setActivating(true);
    try {
      await adminApi.post("/admin/emergency", form);
      setActivateModal(false);
      setForm({ user_id: "", reason: "" });
      fetchPriorities(1);
      setPage(1);
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to activate.");
      setActivating(false);
    }
  };

  const doDeactivate = async () => {
    const id = confirm.id;
    setConfirm(null);
    await adminApi.patch(`/admin/emergency/${id}/deactivate`);
    fetchPriorities(page);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["User ID", "Reason", "Activated By", "Activated At", "Status", "Actions"];
  const rows = priorities.map((p) => (
    <>
      <td className="px-4 py-2 text-gray-800">{p.user_id}</td>
      <td className="px-4 py-2 text-gray-700 text-sm">{p.reason}</td>
      <td className="px-4 py-2 text-gray-600 text-xs">{p.activated_by}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{new Date(p.activated_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
          p.status === "active" ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-100 text-gray-500 border-gray-200"
        }`}>{p.status}</span>
      </td>
      <td className="px-4 py-2">
        {p.status === "active" && (
          <button onClick={() => setConfirm({ id: p.id, label: `Deactivate emergency priority for user ${p.user_id}?` })}
            className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline font-medium">
            <PowerOff size={12} /> Deactivate
          </button>
        )}
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      {/* Urgent header banner */}
      <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <Siren size={22} className="text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Emergency Priority Mode</p>
          <p className="text-xs text-red-600 mt-0.5">
            Activating priority grants a user elevated bandwidth and session persistence. Use only for critical situations.
            All activations are logged.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Priority List</h2>
        <button onClick={() => setActivateModal(true)}
          className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
          <Siren size={13} /> Activate Priority
        </button>
      </div>

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        emptyText="No active emergency priorities."
        emptyHint="Activate priority for a user when a critical situation requires elevated access." />

      {/* Activate modal */}
      {activateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border-t-4 border-red-500">
            <p className="font-semibold text-gray-800 mb-1">Activate Emergency Priority</p>
            <p className="text-xs text-red-600 mb-4">This action is logged and should only be used in critical situations.</p>
            {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{formError}</p>}
            <form onSubmit={handleActivate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">User ID</label>
                <input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  placeholder="User ID"
                  className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                  required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Describe the emergency situation…"
                  rows={3}
                  className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setActivateModal(false); setFormError(""); }}
                  className="flex-1 border border-pink-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={activating}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2 text-sm font-semibold shadow-md disabled:opacity-60 transition">
                  {activating ? "Activating…" : "Activate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doDeactivate} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
