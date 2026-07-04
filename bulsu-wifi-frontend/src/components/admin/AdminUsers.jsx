import { useEffect, useRef, useState } from "react";
import { UserPlus, Upload, ShieldOff, ShieldCheck, WifiOff, Pencil, CheckCircle2, AlertTriangle } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";
import LoadingSpinner from "../ui/LoadingSpinner";

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEnrollment, setFilterEnrollment] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [modal, setModal] = useState(null);
  const [csvState, setCsvState] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [csvResult, setCsvResult] = useState(null);
  const fileRef = useRef();

  const fetchUsers = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/users", {
        params: { page: p, limit: PAGE_SIZE, search, status: filterStatus, enrollment_status: filterEnrollment },
      });
      setUsers(res.data.users);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(1); setPage(1); }, [search, filterStatus, filterEnrollment]);
  useEffect(() => { fetchUsers(page); }, [page]);

  const doAction = async () => {
    const { action, userId } = confirm;
    setConfirm(null);
    if (action === "block") await adminApi.patch(`/admin/users/${userId}/block`);
    if (action === "unblock") await adminApi.patch(`/admin/users/${userId}/unblock`);
    if (action === "disconnect") await adminApi.post(`/admin/users/${userId}/disconnect`);
    fetchUsers(page);
  };

  const handleCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.trim().split("\n").slice(1);
      const rows = lines.map((l) => {
        const [student_number, full_name, course_section, enrollment_status] = l.split(",").map((s) => s.trim());
        return { student_number, full_name, course_section, enrollment_status };
      });
      setCsvRows(rows);
      setCsvState("preview");
    };
    reader.readAsText(file);
  };

  const confirmCsvImport = async () => {
    setCsvState("importing");
    try {
      const res = await adminApi.post("/admin/users/csv-import", { rows: csvRows });
      setCsvResult(res.data);
    } catch {
      setCsvResult({ success: 0, failed: csvRows.length });
    } finally {
      setCsvState("done");
    }
  };

  const resetCsv = () => { setCsvState(null); setCsvRows([]); setCsvResult(null); fileRef.current.value = ""; };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns = ["Student No.", "Name", "Course/Section", "Enrollment", "Status", "Actions"];
  const rows = users.map((u) => (
    <>
      <td className="px-4 py-2 text-gray-700 font-mono text-xs">{u.student_number}</td>
      <td className="px-4 py-2 text-gray-800">{u.full_name}</td>
      <td className="px-4 py-2 text-gray-600 text-xs">{u.course_section}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.enrollment_status === "enrolled" ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500"}`}>
          {u.enrollment_status}
        </span>
      </td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.status === "active" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
          {u.status}
        </span>
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-3 flex-wrap items-center">
          {u.status === "active" ? (
            <button onClick={() => setConfirm({ action: "block", userId: u.id, label: `Block ${u.full_name}?` })}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline">
              <ShieldOff size={12} />Block
            </button>
          ) : (
            <button onClick={() => setConfirm({ action: "unblock", userId: u.id, label: `Unblock ${u.full_name}?` })}
              className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
              <ShieldCheck size={12} />Unblock
            </button>
          )}
          <button onClick={() => setConfirm({ action: "disconnect", userId: u.id, label: `Force-disconnect ${u.full_name}?` })}
            className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline">
            <WifiOff size={12} />Disconnect
          </button>
          <button onClick={() => setModal(u)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline">
            <Pencil size={12} />Edit
          </button>
        </div>
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Users</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setModal("add")}
            className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
            <UserPlus size={14} /> Add User
          </button>
          <label className="inline-flex items-center gap-1.5 bg-white border border-pink-200 text-pink-700 text-xs font-semibold px-4 py-2 rounded-xl shadow hover:bg-pink-50 transition cursor-pointer">
            <Upload size={14} /> Import CSV
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student no., name…"
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white min-w-[200px]"
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={filterEnrollment} onChange={(e) => setFilterEnrollment(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Enrollment</option>
          <option value="enrolled">Enrolled</option>
          <option value="not_enrolled">Not Enrolled</option>
        </select>
      </div>

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        emptyText="No users found."
        emptyHint="Try a different search term or adjust the filters above." />

      {/* CSV Preview */}
      {csvState === "preview" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <p className="font-semibold text-gray-800 mb-3">CSV Preview — {csvRows.length} rows</p>
            <div className="overflow-auto flex-1 border border-pink-100 rounded-xl mb-4">
              <table className="w-full text-xs">
                <thead className="bg-pink-50">
                  <tr>{["Student No.", "Name", "Course/Section", "Enrollment"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-gray-600 font-semibold">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b border-pink-50">
                      <td className="px-3 py-1.5 font-mono">{r.student_number}</td>
                      <td className="px-3 py-1.5">{r.full_name}</td>
                      <td className="px-3 py-1.5">{r.course_section}</td>
                      <td className="px-3 py-1.5">{r.enrollment_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button onClick={resetCsv} className="flex-1 border border-pink-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={confirmCsvImport} className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2 text-sm font-semibold shadow-md hover:from-pink-700 hover:to-rose-600">
                Import {csvRows.length} rows
              </button>
            </div>
          </div>
        </div>
      )}

      {csvState === "importing" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4">
            <LoadingSpinner size={36} className="text-pink-400" />
            <p className="text-sm text-gray-600">Importing…</p>
          </div>
        </div>
      )}

      {csvState === "done" && csvResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="flex justify-center mb-3">
              {csvResult.failed === 0
                ? <CheckCircle2 size={44} className="text-green-600" strokeWidth={1.5} />
                : <AlertTriangle size={44} className="text-orange-500" strokeWidth={1.5} />}
            </div>
            <p className="font-semibold text-gray-800 mb-1">Import Complete</p>
            <p className="text-sm text-green-700">{csvResult.success} rows imported successfully.</p>
            {csvResult.failed > 0 && <p className="text-sm text-red-600">{csvResult.failed} rows failed.</p>}
            <button onClick={() => { resetCsv(); fetchUsers(1); }}
              className="mt-4 w-full bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2 text-sm font-semibold shadow-md">
              Done
            </button>
          </div>
        </div>
      )}

      {modal && <UserFormModal user={modal === "add" ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchUsers(page); }} />}
      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doAction} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

function UserFormModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    student_number: user?.student_number ?? "",
    full_name: user?.full_name ?? "",
    course_section: user?.course_section ?? "",
    enrollment_status: user?.enrollment_status ?? "enrolled",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (user) {
        await adminApi.put(`/admin/users/${user.id}`, form);
      } else {
        await adminApi.post("/admin/users", form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Save failed.");
      setSaving(false);
    }
  };

  const fields = [
    { key: "student_number", label: "Student Number", type: "text" },
    { key: "full_name", label: "Full Name", type: "text" },
    { key: "course_section", label: "Course / Section", type: "text" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <p className="font-semibold text-gray-800 mb-4">{user ? "Edit User" : "Add User"}</p>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map(({ key, label, type }) => (
            <div key={key}>
              <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
              <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Enrollment Status</label>
            <select value={form.enrollment_status} onChange={(e) => setForm({ ...form, enrollment_status: e.target.value })}
              className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
              <option value="enrolled">Enrolled</option>
              <option value="not_enrolled">Not Enrolled</option>
            </select>
          </div>
          {!user && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-pink-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2 text-sm font-semibold shadow-md disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
