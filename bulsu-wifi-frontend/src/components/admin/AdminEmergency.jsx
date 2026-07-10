import { useEffect, useState } from "react";
import { Siren, PowerOff } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";
import Toast from "../ui/Toast";
import useEmergencyActivation from "./emergency/useEmergencyActivation";
import ActivateEmergencyModal from "./emergency/ActivateEmergencyModal";
import { TARGET_TYPES } from "./emergency/targetHelpers";

const PAGE_SIZE = 20;

export default function AdminEmergency() {
  const [priorities, setPriorities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // List filters/sort
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [sortKey, setSortKey] = useState("activated_at");
  const [sortDir, setSortDir] = useState("desc");

  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState("");

  const fetchPriorities = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/emergency", {
        params: { page: p, limit: PAGE_SIZE, search, status: statusFilter, target_type: targetTypeFilter, sort: sortKey, dir: sortDir },
      });
      setPriorities(res.data.priorities);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPriorities(1); setPage(1); }, [search, statusFilter, targetTypeFilter, sortKey, sortDir]);
  useEffect(() => { fetchPriorities(page); }, [page]);

  const emergency = useEmergencyActivation({
    onActivated: (toastMessage) => { fetchPriorities(1); setPage(1); setToast(toastMessage); },
    onNeedsConfirm: (c) => setConfirm(c),
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const doConfirmedAction = async () => {
    const c = confirm;
    setConfirm(null);
    if (c.action === "activate") { await emergency.activate(); return; }
    if (c.action === "deactivate-single") await adminApi.patch(`/admin/emergency/${c.id}/deactivate`);
    if (c.action === "deactivate-batch") await adminApi.patch(`/admin/emergency/batch/${c.batchId}/deactivate`);
    fetchPriorities(page);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = [
    { key: "target_label", label: "Target" },
    "Reason",
    "Activated By",
    { key: "activated_at", label: "Activated At" },
    { key: "status", label: "Status" },
    "Actions",
  ];
  const rows = priorities.map((p) => (
    <>
      <td className="px-4 py-2 text-gray-800 dark:text-gray-100 text-sm">
        {p.target_label}
        {p.user_count > 1 && (
          <span className="ml-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-wine-800 rounded-full px-1.5 py-0.5">{p.user_count}</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm">{p.reason}</td>
      <td className="px-4 py-2 text-gray-600 dark:text-gray-300 text-xs">{p.activated_by_name}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{new Date(p.activated_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
          p.status === "active" ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900" : "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-wine-700"
        }`}>{p.status}</span>
      </td>
      <td className="px-4 py-2">
        {p.status === "active" && (
          <button onClick={() => setConfirm(p.batch_id
            ? { action: "deactivate-batch", batchId: p.batch_id, label: `Deactivate emergency priority for ${p.target_label} (${p.user_count} users)?` }
            : { action: "deactivate-single", id: p.id, label: `Deactivate emergency priority for ${p.target_label}?` })}
            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
            <PowerOff size={12} /> Deactivate
          </button>
        )}
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      {/* Urgent header banner */}
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl px-5 py-4 flex items-start gap-3">
        <Siren size={22} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Emergency Priority Mode</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
            Activating priority grants elevated bandwidth and session persistence to a student, faculty, staff, guest,
            section, or course. Use only for critical situations. All activations are logged.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Priority List</h2>
        <button onClick={emergency.openModal}
          className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
          <Siren size={13} /> Activate Priority
        </button>
      </div>

      {/* List filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search target or reason…"
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white dark:bg-wine-900 min-w-[200px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
        <select value={targetTypeFilter} onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="">All Target Types</option>
          {TARGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        colWidths={[null, null, "140px", "170px", "90px", "140px"]}
        sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
        emptyText="No emergency priorities found."
        emptyHint="Activate priority above when a critical situation requires elevated access." />

      <ActivateEmergencyModal emergency={emergency} />

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doConfirmedAction} onCancel={() => setConfirm(null)} />}
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
