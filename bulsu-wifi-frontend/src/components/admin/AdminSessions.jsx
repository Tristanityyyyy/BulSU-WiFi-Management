import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";

const PAGE_SIZE = 20;

const TABS = [
  { key: "student", label: "Student" },
  { key: "faculty", label: "Faculty" },
  { key: "staff",   label: "Staff" },
  { key: "guest",   label: "Guest" },
];

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]).join(",");
  const lines = rows.map((r) => Object.values(r).map((v) => `"${v ?? ""}"`).join(","));
  return [headers, ...lines].join("\n");
}

function downloadCSV(data, filename) {
  const blob = new Blob([data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }) {
  const map = {
    active: "bg-green-50 text-green-700 border-green-200",
    ended: "bg-gray-100 text-gray-500 border-gray-200",
    "force-disconnected": "bg-red-50 text-red-600 border-red-200",
    timeout: "bg-orange-50 text-orange-600 border-orange-200",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
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
    const res = await adminApi.get(endpoint, { params });
    downloadCSV(toCSV(res.data), `${tab}-sessions-${Date.now()}.csv`);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const userCols = ["Name", "ID / Number", "MAC Address", "IP Address", "Login", "Logout", "Duration", "Status", "Reason"];
  const guestCols = ["Guest Name", "MAC Address", "IP Address", "Login", "Logout", "Duration", "Status"];

  const userRows = rows.map((s) => (
    <>
      <td className="px-4 py-2 text-gray-800">{s.full_name}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{s.student_number ?? "—"}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600">{s.mac_address}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600">{s.ip_address}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{s.login_time ? new Date(s.login_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{s.logout_time ? new Date(s.logout_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-600">{s.duration_minutes != null ? `${s.duration_minutes} min` : "—"}</td>
      <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
      <td className="px-4 py-2 text-xs text-gray-500">{s.logout_reason ?? "—"}</td>
    </>
  ));

  const guestRows = rows.map((s) => (
    <>
      <td className="px-4 py-2 text-gray-800">{s.guest_name}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600">{s.mac_address}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600">{s.ip_address}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{s.login_time ? new Date(s.login_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{s.logout_time ? new Date(s.logout_time).toLocaleString() : "—"}</td>
      <td className="px-4 py-2 text-xs text-gray-600">{s.duration_minutes != null ? `${s.duration_minutes} min` : "—"}</td>
      <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
    </>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Session Logs</h2>
        <button onClick={handleExport}
          className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === t.key ? "bg-pink-600 text-white shadow" : "bg-white border border-pink-200 text-gray-600 hover:bg-pink-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="force-disconnected">Force-Disconnected</option>
          <option value="timeout">Timeout</option>
        </select>
        {!isGuest && (
          <select value={logoutReason} onChange={(e) => setLogoutReason(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400">
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
        emptyText={`No ${tab} sessions found.`}
        emptyHint="Try adjusting the date range or status filter."
      />
    </div>
  );
}
