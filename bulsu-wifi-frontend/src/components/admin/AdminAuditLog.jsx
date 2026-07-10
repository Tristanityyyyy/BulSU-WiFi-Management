import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  { value: "CREATED", label: "Created" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "UNBLOCKED", label: "Unblocked" },
  { value: "RESTORE", label: "Restored" },
];

const EXPORT_RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
  { days: 60, label: "Last 60 days" },
];

const ACTION_BADGE = {
  CREATED: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900",
  UPDATE: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  DELETE: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900",
  BLOCKED: "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900",
  UNBLOCKED: "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-900",
  RESTORE: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900",
};

const ACTION_DOT = {
  CREATED: "bg-green-500",
  UPDATE: "bg-blue-500",
  DELETE: "bg-red-500",
  BLOCKED: "bg-orange-500",
  UNBLOCKED: "bg-teal-500",
  RESTORE: "bg-purple-500",
};

function downloadXlsx(data, filename) {
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/audit-log", {
        params: { page: p, limit: PAGE_SIZE, action, date_from: dateFrom, date_to: dateTo },
      });
      setRows(res.data.logs);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); fetchLogs(1); }, [action, dateFrom, dateTo]);
  useEffect(() => { fetchLogs(page); }, [page]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleExport = async (days) => {
    setExportOpen(false);
    const res = await adminApi.get("/admin/audit-log/export", { params: { days }, responseType: "blob" });
    downloadXlsx(res.data, `audit-log-last-${days}-days-${Date.now()}.xlsx`);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns = ["Time", "Admin", "Action", "Target", "Description"];
  const tableRows = rows.map((log) => (
    <>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
      <td className="px-4 py-2 text-gray-800 dark:text-gray-100">{log.admin_name}</td>
      <td className="px-4 py-2">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${ACTION_BADGE[log.action] ?? "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400"}`}>
          {log.action}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{log.target_name || "—"}</td>
      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{log.description}</td>
    </>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Audit Log</h2>
        <div className="relative" ref={exportRef}>
          <button onClick={() => setExportOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
            <Download size={14} /> Export <ChevronDown size={13} />
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-wine-900 border border-slate-200 dark:border-wine-800 rounded-xl shadow-lg overflow-hidden z-10">
              {EXPORT_RANGES.map((r) => (
                <button key={r.days} onClick={() => handleExport(r.days)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition">
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {ACTION_OPTIONS.map((opt) => (
          <span key={opt.value} className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className={`w-2.5 h-2.5 rounded-full ${ACTION_DOT[opt.value]}`} />
            {opt.label}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" />
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Actions</option>
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <AdminTable
        columns={columns}
        rows={tableRows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPage={setPage}
        emptyText="No audit log entries found."
        emptyHint="Try adjusting the date range or action filter."
      />
    </div>
  );
}
