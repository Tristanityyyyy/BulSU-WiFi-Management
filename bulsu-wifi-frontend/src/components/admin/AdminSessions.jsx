import { useEffect, useState } from "react";
import { Download, WifiOff, Trash2 } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import SuccessDialog from "../ui/SuccessDialog";
import ErrorDialog from "../ui/ErrorDialog";

const PAGE_SIZE = 20;

const TABS = [
  { key: "student", label: "Student" },
  { key: "faculty", label: "Faculty" },
  { key: "staff",   label: "Staff" },
  { key: "guest",   label: "Guest" },
];

function downloadXlsx(data, filename) {
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Statuses arrive as stored: "force-disconnected", "data_limit". Underscores read
// as word breaks, and only the first letter is capitalised — "Force-disconnected",
// not "Force-Disconnected", so the value stays recognisably the one in the filter.
const formatStatus = (status) =>
  String(status ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function StatusBadge({ status }) {
  const map = {
    active: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900",
    ended: "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-wine-700",
    "force-disconnected": "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900",
    timeout: "bg-orange-50 dark:bg-orange-950/30 text-orange-600 border-orange-200",
  };
  return (
    <span className={`inline-block whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium border ${map[status] ?? "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400"}`}>
      {formatStatus(status)}
    </span>
  );
}

export default function AdminSessions() {
  const [tab, setTab] = useState("student");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [logoutReason, setLogoutReason] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  const isGuest = tab === "guest";

  const fetchSessions = async (p = page) => {
    setLoading(true);
    try {
      const endpoint = isGuest ? "/admin/sessions/guests" : "/admin/sessions";
      const params = { page: p, limit: PAGE_SIZE, date_from: dateFrom, date_to: dateTo, status };
      if (!isGuest) { params.role = tab; params.logout_reason = logoutReason; }
      const res = await adminApi.get(endpoint, { params });
      setRows(res.data.sessions);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); fetchSessions(1); }, [tab, dateFrom, dateTo, status, logoutReason]);
  useEffect(() => { fetchSessions(page); }, [page]);

  const handleExport = async () => {
    const endpoint = isGuest ? "/admin/sessions/guests/export" : "/admin/sessions/export";
    const params = { date_from: dateFrom, date_to: dateTo, status };
    if (!isGuest) { params.role = tab; params.logout_reason = logoutReason; }
    const res = await adminApi.get(endpoint, { params, responseType: "blob" });
    downloadXlsx(res.data, `${tab}-sessions-${Date.now()}.xlsx`);
  };

  const doConfirmedAction = async () => {
    const { id, isGuest: wasGuest, action, name } = confirm;
    setConfirm(null);
    setActionError("");
    try {
      if (action === "delete") {
        await adminApi.delete(wasGuest ? `/admin/sessions/guests/${id}` : `/admin/sessions/${id}`);
        setSuccess(`${name}'s session log has been deleted.`);
        // Removing the last row of a page would otherwise leave the table empty
        // on a page that no longer exists — step back instead of reloading it.
        if (rows.length === 1 && page > 1) { setPage(page - 1); return; }
      } else {
        await adminApi.patch(wasGuest ? `/admin/sessions/guests/${id}/disconnect` : `/admin/sessions/${id}/disconnect`);
        setSuccess(`${name} has been disconnected from the network.`);
      }
      fetchSessions(page);
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          (action === "delete" ? "Failed to delete session." : "Failed to disconnect session.")
      );
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const userCols = ["Name", "ID / Number", "MAC Address", "IP Address", "Login", "Logout", "Duration", "Status", "Reason", "Actions"];
  const guestCols = ["Guest Name", "MAC Address", "IP Address", "Login", "Logout", "Duration", "Status", "Actions"];

  const userRows = rows.map((s) => (
    <>
      <td className="px-4 py-2 text-gray-800 dark:text-gray-100 whitespace-nowrap">{s.full_name}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.student_number ?? "—"}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.mac_address}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.ip_address}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.login_time ? new Date(s.login_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.logout_time ? new Date(s.logout_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.duration_minutes != null ? `${s.duration_minutes} min` : "—"}</td>
      <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.logout_reason ?? "—"}</td>
      <td className="px-4 py-2">
        {s.status === "active" ? (
          <button onClick={() => setConfirm({
              id: s.id, isGuest: false, action: "disconnect", name: s.full_name,
              title: "Force-disconnect this session?",
              label: `${s.full_name} will be dropped from the network immediately and will have to log in again.`,
              confirmLabel: "Disconnect",
            })}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
            <WifiOff size={12} /> Disconnect
          </button>
        ) : (
          <button onClick={() => setConfirm({
              id: s.id, isGuest: false, action: "delete", name: s.full_name,
              title: "Delete this session log?",
              label: `${s.full_name}'s session from ${s.login_time ? new Date(s.login_time).toLocaleString() : "an earlier date"} will be removed from the logs. This can't be undone.`,
              confirmLabel: "Delete",
            })}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
            <Trash2 size={12} /> Delete
          </button>
        )}
      </td>
    </>
  ));

  const guestRows = rows.map((s) => (
    <>
      <td className="px-4 py-2 text-gray-800 dark:text-gray-100 whitespace-nowrap">{s.guest_name}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.mac_address}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.ip_address}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.login_time ? new Date(s.login_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.logout_time ? new Date(s.logout_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.duration_minutes != null ? `${s.duration_minutes} min` : "—"}</td>
      <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
      <td className="px-4 py-2">
        {s.status === "active" ? (
          <button onClick={() => setConfirm({
              id: s.id, isGuest: true, action: "disconnect", name: `Guest ${s.guest_name}`,
              title: "Force-disconnect this guest?",
              label: `${s.guest_name} will be dropped from the network immediately.`,
              confirmLabel: "Disconnect",
            })}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
            <WifiOff size={12} /> Disconnect
          </button>
        ) : (
          <button onClick={() => setConfirm({
              id: s.id, isGuest: true, action: "delete", name: `Guest ${s.guest_name}`,
              title: "Delete this session log?",
              label: `${s.guest_name}'s session from ${s.login_time ? new Date(s.login_time).toLocaleString() : "an earlier date"} will be removed from the logs. This can't be undone.`,
              confirmLabel: "Delete",
            })}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
            <Trash2 size={12} /> Delete
          </button>
        )}
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Session Logs</h2>
        <button onClick={handleExport}
          className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
          <Download size={14} /> Export Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === t.key ? "bg-pink-600 text-white shadow" : "bg-white dark:bg-wine-900 border border-pink-200 dark:border-pink-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="force-disconnected">Force-Disconnected</option>
          <option value="timeout">Timeout</option>
        </select>
        {!isGuest && (
          <select value={logoutReason} onChange={(e) => setLogoutReason(e.target.value)}
            className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
            <option value="">All Reasons</option>
            <option value="user_logout">User Logout</option>
            <option value="timeout">Timeout</option>
            <option value="force_disconnect">Force Disconnect</option>
            <option value="data_limit">Data Limit</option>
          </select>
        )}
      </div>

      <AdminTable
        columns={isGuest ? guestCols : userCols}
        rows={isGuest ? guestRows : userRows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPage={setPage}
        maxHeight="60vh"
        emptyText={`No ${tab} sessions found.`}
        emptyHint="Try adjusting the date range or status filter."
      />

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.label}
          confirmLabel={confirm.confirmLabel}
          onConfirm={doConfirmedAction}
          onCancel={() => setConfirm(null)}
        />
      )}
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
