import { useEffect, useRef, useState } from "react";
import { UserPlus, Upload, Download, ShieldOff, ShieldCheck, WifiOff, Pencil, CheckCircle2, AlertTriangle } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";
import LoadingSpinner from "../ui/LoadingSpinner";
import Modal from "../ui/Modal";

const PAGE_SIZE = 20;

const humanize = (value) => (value || "").split("_").filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEnrollment, setFilterEnrollment] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [modal, setModal] = useState(null);
  const [csvState, setCsvState] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [csvResult, setCsvResult] = useState(null);
  const [importRole, setImportRole] = useState("student");
  const [templateRole, setTemplateRole] = useState("student");
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const fileRef = useRef();

  const fetchUsers = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/users", {
        params: { page: p, limit: PAGE_SIZE, search, status: filterStatus, enrollment_status: filterEnrollment, role: filterRole },
      });
      setUsers(res.data.users);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    adminApi.get("/admin/settings/catalog").then((res) => setCatalog(res.data));
  }, []);

  useEffect(() => { fetchUsers(1); setPage(1); }, [search, filterStatus, filterEnrollment, filterRole]);
  useEffect(() => { fetchUsers(page); }, [page]);

  const doAction = async () => {
    const { action, userId } = confirm;
    setConfirm(null);
    if (action === "block") await adminApi.patch(`/admin/users/${userId}/block`);
    if (action === "unblock") await adminApi.patch(`/admin/users/${userId}/unblock`);
    if (action === "disconnect") await adminApi.post(`/admin/users/${userId}/disconnect`);
    fetchUsers(page);
  };

  const parseCsvLine = (line) => {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    values.push(current);
    return values;
  };

  // Course/section/school-year/semester/enrollment_status only appear in the student template —
  // the faculty/staff template omits them, so only these three are ever required.
  const requiredHeaders = ["student_number", "full_name", "birth_date"];

  // course_code only exists in the student template; faculty/staff templates are byte-identical
  // to each other, so this can only distinguish student vs. non-student — not faculty vs. staff.
  const deriveDefaultRole = (header) =>
    header.includes("course_code") ? "student" : (templateRole !== "student" ? templateRole : "faculty");

  const buildRowsFromTable = (header, dataRows) => {
    const missing = requiredHeaders.filter((h) => !header.includes(h));
    if (missing.length) {
      alert(`Template mismatch. Missing columns: ${missing.join(", ")}`);
      return null;
    }
    const idx = (name) => header.indexOf(name);
    return dataRows.map((values) => ({
      student_number: values[idx("student_number")]?.trim() || "",
      full_name: values[idx("full_name")]?.trim() || "",
      birth_date: values[idx("birth_date")]?.trim() || "",
      course_code: values[idx("course_code")]?.trim() || "",
      section_name: values[idx("section_name")]?.trim() || "",
      school_year: values[idx("school_year")]?.trim() || "",
      semester: values[idx("semester")]?.trim() || "",
      enrollment_status: values[idx("enrollment_status")]?.trim() || "",
    }));
  };

  const processCsvFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result.replace(/^\uFEFF/, "").trim();
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length < 2) {
        alert("File must contain a header row and at least one data row.");
        return;
      }
      const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
      const dataRows = lines.slice(1).map((line) => parseCsvLine(line));
      const rows = buildRowsFromTable(header, dataRows);
      if (!rows) return;
      setImportRole(deriveDefaultRole(header));
      setCsvRows(rows);
      setCsvState("preview");
    };
    reader.readAsText(file);
  };

  const processXlsxFile = (file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await adminApi.post("/admin/users/parse-xlsx", ev.target.result, {
          headers: { "Content-Type": "application/octet-stream" },
        });
        const header = res.data.header.map((h) => h.trim().toLowerCase());
        const rows = buildRowsFromTable(header, res.data.rows);
        if (!rows) return;
        setImportRole(deriveDefaultRole(header));
        setCsvRows(rows);
        setCsvState("preview");
      } catch (err) {
        alert(err.response?.data?.message || "Failed to read the Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      processXlsxFile(file);
    } else {
      processCsvFile(file);
    }
  };

  const confirmCsvImport = async () => {
    setCsvState("importing");
    try {
      const res = await adminApi.post("/admin/users/csv-import", { rows: csvRows, role: importRole });
      setCsvResult(res.data);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.invalid_rows) {
        setCsvResult({ rejected: true, message: err.response.data.message, invalid_rows: err.response.data.invalid_rows });
      } else {
        setCsvResult({ success: 0, failed: csvRows.length, message: err.response?.data?.message || "Import failed." });
      }
    } finally {
      setCsvState("done");
    }
  };

  const resetCsv = () => { setCsvState(null); setCsvRows([]); setCsvResult(null); setImportRole("student"); fileRef.current.value = ""; };

  const downloadCsvTemplate = async () => {
    try {
      const res = await adminApi.get("/admin/users/csv-template", { params: { role: templateRole }, responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${templateRole}_template.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download template:", err);
      alert("Failed to download template. Check console for details.");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const courseMap = Object.fromEntries((catalog.courses || []).map((course) => [String(course.id), course.code || course.name]));
  const sectionMap = Object.fromEntries((catalog.sections || []).map((section) => [String(section.id), section.name]));

  const isImportRowValid = (row) => {
    if (importRole !== "student") return true;
    if (!row.course_code && !row.section_name) return true;
    if (!row.course_code) return false;
    const course = (catalog.courses || []).find((c) => (c.code || c.name || "").trim().toUpperCase() === row.course_code.trim().toUpperCase());
    if (!course) return false;
    if (!row.section_name) return true;
    return (catalog.sections || []).some((s) => s.course_id === course.id && (s.name || "").trim().toUpperCase() === row.section_name.trim().toUpperCase());
  };
  const invalidCsvRowCount = importRole === "student" ? csvRows.filter((r) => !isImportRowValid(r)).length : 0;

  const columns = ["Student No.", "Name", "Course/Section", "Enrollment", "Status", "Actions"];
  const rows = users.map((u) => {
    const courseLabel = courseMap[String(u.course_id)] || (u.course_id ? `#${u.course_id}` : "—");
    const sectionLabel = sectionMap[String(u.section_id)] || "";
    const courseSection = sectionLabel ? `${courseLabel} / ${sectionLabel}` : courseLabel;
    return (
      <>
        <td className="px-4 py-2 text-gray-700 dark:text-gray-300 font-mono text-xs">{u.student_number}</td>
        <td className="px-4 py-2 text-gray-800 dark:text-gray-100">{u.full_name}</td>
        <td className="px-4 py-2 text-gray-600 dark:text-gray-300 text-xs">{courseSection}</td>
        <td className="px-4 py-2">
          {u.enrollment_status ? (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.enrollment_status === "enrolled" ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900" : "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400"}`}>
              {humanize(u.enrollment_status)}
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          )}
        </td>
        <td className="px-4 py-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.status === "active" ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900" : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900"}`}>
            {humanize(u.status)}
          </span>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-3 flex-wrap items-center">
            {u.status === "active" ? (
              <button onClick={() => setConfirm({ action: "block", userId: u.id, label: `Block ${u.full_name}?` })}
                className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline">
                <ShieldOff size={12} />Block
              </button>
            ) : (
              <button onClick={() => setConfirm({ action: "unblock", userId: u.id, label: `Unblock ${u.full_name}?` })}
                className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
                <ShieldCheck size={12} />Unblock
              </button>
            )}
            <button onClick={() => setConfirm({ action: "disconnect", userId: u.id, label: `Force-disconnect ${u.full_name}?` })}
              className="inline-flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 hover:underline">
              <WifiOff size={12} />Disconnect
            </button>
            <button onClick={() => setModal(u)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:underline">
              <Pencil size={12} />Edit
            </button>
          </div>
        </td>
      </>
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Users</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setModal("add")}
            className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
            <UserPlus size={14} /> Add User
          </button>
          <div className="inline-flex items-center rounded-xl border border-pink-200 dark:border-pink-900 bg-white dark:bg-wine-900 shadow overflow-hidden">
            <select value={templateRole} onChange={(e) => setTemplateRole(e.target.value)}
              className="text-xs font-semibold text-pink-700 dark:text-pink-300 pl-3 pr-1 py-2 bg-transparent focus:outline-none capitalize">
              {["student", "faculty", "staff"].map((r) => (
                <option key={r} value={r} className="capitalize">{r}</option>
              ))}
            </select>
            <button onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 text-pink-700 dark:text-pink-300 text-xs font-semibold pl-2 pr-4 py-2 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition border-l border-pink-100 dark:border-pink-900/60">
              <Download size={14} /> Download Template
            </button>
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 bg-white dark:bg-wine-900 border border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300 text-xs font-semibold px-4 py-2 rounded-xl shadow hover:bg-pink-50 dark:hover:bg-pink-950/40 transition">
            <Upload size={14} /> Import File
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileSelected} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student no., name…"
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white dark:bg-wine-900 min-w-[200px]"
        />
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Roles</option>
          <option value="student">Student</option>
          <option value="faculty">Faculty</option>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={filterEnrollment} onChange={(e) => setFilterEnrollment(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Enrollment</option>
          <option value="enrolled">Enrolled</option>
          <option value="not_enrolled">Not Enrolled</option>
        </select>
      </div>

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        emptyText="No users found."
        emptyHint="Try a different search term or adjust the filters above." />

      {/* Import Preview */}
      {csvState === "preview" && (
        <Modal
          onClose={resetCsv}
          size="xl"
          title="Import Preview"
          subtitle={`${csvRows.length} row${csvRows.length === 1 ? "" : "s"} detected — review before importing.`}
          icon={<Upload size={17} />}
          footer={
            <div className="flex gap-3">
              <button onClick={resetCsv} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
              <button onClick={confirmCsvImport} disabled={importRole === "student" && invalidCsvRowCount > 0}
                className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none hover:from-pink-700 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition">
                Import {csvRows.length} rows
              </button>
            </div>
          }
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Import these as:</span>
            <div className="inline-flex rounded-xl border border-pink-200 dark:border-pink-900 overflow-hidden">
              {["student", "faculty", "staff"].map((r) => (
                <button key={r} type="button" onClick={() => setImportRole(r)}
                  className={`px-3 py-1 text-xs font-medium capitalize transition ${importRole === r ? "bg-pink-600 text-white" : "bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {importRole === "student" && invalidCsvRowCount > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">
              {invalidCsvRowCount} row(s) below reference a course or section that isn't registered in the system (highlighted in red). The import will be rejected until these are fixed.
            </p>
          )}
          {importRole !== "student" && (
            <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 border border-gray-200 dark:border-wine-700 rounded-xl px-3 py-2 mb-3">
              Course/Section are ignored for {importRole} imports.
            </p>
          )}
          <div className="overflow-auto max-h-[45vh] border border-pink-100 dark:border-pink-900/60 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-pink-50 dark:bg-pink-950/40 sticky top-0">
                <tr>{["Student No.", "Name", "Birth Date", "Course Code", "Section Name", "School Year", "Semester", "Enrollment"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 50).map((r, i) => {
                  const invalid = importRole === "student" && !isImportRowValid(r);
                  return (
                    <tr key={i} className={`border-b border-pink-50 ${invalid ? "bg-red-50 dark:bg-red-950/30" : ""}`}>
                      <td className="px-3 py-1.5 font-mono">{r.student_number}</td>
                      <td className="px-3 py-1.5">{r.full_name}</td>
                      <td className="px-3 py-1.5">{r.birth_date}</td>
                      <td className={`px-3 py-1.5 ${invalid ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>{r.course_code}</td>
                      <td className={`px-3 py-1.5 ${invalid ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>{r.section_name}</td>
                      <td className="px-3 py-1.5">{r.school_year}</td>
                      <td className="px-3 py-1.5">{r.semester}</td>
                      <td className="px-3 py-1.5">{r.enrollment_status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {csvState === "importing" && (
        <Modal showClose={false}>
          <div className="flex flex-col items-center gap-4 py-2">
            <LoadingSpinner size={36} className="text-pink-400" />
            <p className="text-sm text-gray-600 dark:text-gray-300">Importing users…</p>
          </div>
        </Modal>
      )}

      {csvState === "done" && csvResult && (
        <Modal size="md" onClose={() => { resetCsv(); fetchUsers(1); }} showClose={false}>
          <div className="text-center flex flex-col max-h-full">
            {csvResult.rejected ? (
              <>
                <div className="flex justify-center mb-3">
                  <span className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/60 flex items-center justify-center animate-pop-in">
                    <AlertTriangle size={26} className="text-red-500" strokeWidth={1.8} />
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Import Rejected</p>
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{csvResult.message}</p>
                <div className="overflow-auto max-h-[35vh] text-left border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70">
                  {csvResult.invalid_rows.map((r, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <span className="font-mono text-gray-500 dark:text-gray-400">Row {r.row}</span>
                      {r.student_number && <span className="text-gray-500 dark:text-gray-400"> ({r.student_number})</span>}
                      <span className="block text-red-700 dark:text-red-300">{r.reason}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-3">
                  <span className={`w-14 h-14 rounded-full border flex items-center justify-center animate-pop-in ${
                    csvResult.failed === 0 ? "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/60" : "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/60"
                  }`}>
                    {csvResult.failed === 0
                      ? <CheckCircle2 size={26} className="text-green-600 dark:text-green-400" strokeWidth={1.8} />
                      : <AlertTriangle size={26} className="text-orange-500 dark:text-orange-400" strokeWidth={1.8} />}
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Import Complete</p>
                <p className="text-sm text-green-700 dark:text-green-300">{csvResult.success} rows imported successfully.</p>
                {csvResult.failed > 0 && <p className="text-sm text-red-600 dark:text-red-400">{csvResult.failed} rows failed.</p>}
                {csvResult.message && <p className="text-sm text-red-600 dark:text-red-400">{csvResult.message}</p>}
              </>
            )}
            <button onClick={() => { resetCsv(); fetchUsers(1); }}
              className="mt-5 w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none shrink-0 transition">
              Done
            </button>
          </div>
        </Modal>
      )}

      {modal && <UserFormModal user={modal === "add" ? null : modal} courses={catalog.courses} sections={catalog.sections} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchUsers(page); }} />}
      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doAction} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

const USER_ROLES = ["student", "faculty", "staff"];

function UserFormModal({ user, courses, sections, onClose, onSaved }) {
  const isAdminAccount = user?.role === "admin";
  const [form, setForm] = useState({
    student_number: user?.student_number ?? "",
    full_name: user?.full_name ?? "",
    role: USER_ROLES.includes(user?.role) ? user.role : "",
    course_id: user?.course_id ?? "",
    section_id: user?.section_id ?? "",
    enrollment_status: user?.enrollment_status ?? "enrolled",
    birthdate: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isStudentRole = form.role === "student";
  const sectionOptions = (sections || []).filter((section) => String(section.course_id) === String(form.course_id));

  const handleCourseChange = (courseId) => {
    setForm({ ...form, course_id: courseId, section_id: "" });
  };

  // Role is picked first. Course/Section only apply to students, so switching to faculty/staff
  // locks (and clears) them; switching to student unlocks them for picking.
  const handleRoleChange = (role) => {
    setForm({
      ...form,
      role,
      course_id: role === "student" ? form.course_id : "",
      section_id: role === "student" ? form.section_id : "",
      enrollment_status: role === "student" ? (form.enrollment_status || "enrolled") : "",
    });
  };

  // Derive password: LastName (before the comma) + YYYY + MM + DD
  const derivedPassword = (() => {
    if (user) return null; // edit mode — no password change
    const lastName = form.full_name.split(",")[0].trim();
    if (!lastName || !form.birthdate) return null;
    const [yyyy, mm, dd] = form.birthdate.split("-");
    return `${lastName}${yyyy}${mm}${dd}`;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user && !derivedPassword) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        course_id: form.course_id ? Number(form.course_id) : null,
        section_id: form.section_id ? Number(form.section_id) : null,
      };
      if (isAdminAccount) delete payload.role;
      if (user) {
        await adminApi.put(`/admin/users/${user.id}`, payload);
      } else {
        await adminApi.post("/admin/users", { ...payload, password: derivedPassword });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Save failed.");
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title={user ? "Edit User" : "Add User"}
      subtitle={user ? "Update this account's details." : "Create a new account for a student, faculty or staff member."}
      icon={user ? <Pencil size={16} /> : <UserPlus size={17} />}
    >
      {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Student Number</label>
            <input type="text" value={form.student_number} onChange={(e) => setForm({ ...form, student_number: e.target.value })}
              className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
              Full Name
              <span className="ml-1 font-normal text-gray-400 dark:text-gray-500">(Last, First Middle)</span>
            </label>
            <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="e.g. Dela Cruz, Juan Miguel"
              className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
          {!isAdminAccount && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Role</label>
                <select value={form.role} onChange={(e) => handleRoleChange(e.target.value)} required
                  className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 capitalize">
                  <option value="" disabled>Select role</option>
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role} className="capitalize">
                      {role[0].toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                  Course {!isStudentRole && <span className="font-normal text-gray-400 dark:text-gray-500">(students only)</span>}
                </label>
                <select value={form.course_id} onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:bg-gray-100 dark:disabled:bg-wine-800 disabled:cursor-not-allowed" disabled={!isStudentRole}>
                  <option value="">Select course</option>
                  {(courses || []).map((course) => (
                    <option key={course.id} value={course.id}>{course.code || course.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Section</label>
                <select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                  className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:bg-gray-100 dark:disabled:bg-wine-800 disabled:cursor-not-allowed" required={isStudentRole && !!form.course_id} disabled={!isStudentRole || !form.course_id}>
                  <option value="">Select section</option>
                  {sectionOptions.map((section) => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
              </div>
              {isStudentRole && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Enrollment Status</label>
                  <select value={form.enrollment_status} onChange={(e) => setForm({ ...form, enrollment_status: e.target.value })}
                    className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
                    <option value="enrolled">Enrolled</option>
                    <option value="not_enrolled">Not Enrolled</option>
                  </select>
                </div>
              )}
            </>
          )}

          {!user && (
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Birthdate</label>
              <input type="date" value={form.birthdate} onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
                className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
              {derivedPassword && (
                <div className="mt-2 bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Generated password</p>
                  <p className="text-sm font-mono font-semibold text-pink-700 dark:text-pink-300">{derivedPassword}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Share this with the user so they can log in.</p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
            <button type="submit" disabled={saving || (!user && !derivedPassword)}
              className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-60 disabled:shadow-none transition">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
    </Modal>
  );
}
