import { useEffect, useRef, useState } from "react";
import { UserPlus, Upload, Download, ShieldOff, ShieldCheck, Pencil, Trash2, RotateCcw, KeyRound, GraduationCap } from "lucide-react";
import adminApi from "./adminApi";
import * as usersApi from "./users/usersApi";
import UserFormModal from "./users/UserFormModal";
import PermanentDeleteModal from "./users/PermanentDeleteModal";
import ResetPasswordModal from "./users/ResetPasswordModal";
import useCsvImport from "./users/useCsvImport";
import CsvImportModal from "./users/CsvImportModal";
import useEnrollmentTransition from "./users/useEnrollmentTransition";
import EnrollmentTransitionModal from "./users/EnrollmentTransitionModal";
import SingleTransitionModal from "./users/SingleTransitionModal";
import useUserList from "./users/useUserList";
import useTrashList from "./users/useTrashList";
import UserFilterBar from "./users/UserFilterBar";
import AdminTable from "./AdminTable";
import SelectAllHeader from "./SelectAllHeader";
import ConfirmDialog from "./ConfirmDialog";

const PAGE_SIZE = 20;

const humanize = (value) => (value || "").split("_").filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");

const VIEWS = [
  { key: "active", label: "Active Users" },
  { key: "trash", label: "Trash" },
];

export default function AdminUsers() {
  const [view, setView] = useState("active");
  const userList = useUserList({ pageSize: PAGE_SIZE });
  const trashList = useTrashList({ pageSize: PAGE_SIZE, active: view === "trash" });
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [bulkPermanentDeleteOpen, setBulkPermanentDeleteOpen] = useState(false);
  const [permanentDeleteError, setPermanentDeleteError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [modal, setModal] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const fileRef = useRef();
  const transitionFileRef = useRef();
  const csv = useCsvImport({
    catalog,
    onImported: () => userList.fetchUsers(1),
    onReset: () => { if (fileRef.current) fileRef.current.value = ""; },
  });
  const transition = useEnrollmentTransition({
    onCommitted: () => userList.fetchUsers(userList.page),
    onReset: () => { if (transitionFileRef.current) transitionFileRef.current.value = ""; },
  });

  useEffect(() => {
    adminApi.get("/admin/settings/catalog").then((res) => setCatalog(res.data));
  }, []);

  const doAction = async () => {
    const { action, userId } = confirm;
    setConfirm(null);
    if (action === "block") await usersApi.blockUser(userId);
    if (action === "unblock") await usersApi.unblockUser(userId);
    if (action === "bulk-trash") {
      const count = userList.selection.selected.size;
      await usersApi.bulkDelete([...userList.selection.selected]);
      userList.selection.clear();
      setSuccessMessage(`${count} user(s) moved to trash.`);
      userList.fetchUsers(userList.page);
      return;
    }
    if (action === "trash-one") {
      await usersApi.bulkDelete([userId]);
      setSuccessMessage("User moved to trash.");
      userList.fetchUsers(userList.page);
      return;
    }
    if (action === "restore") {
      await usersApi.restoreUser(userId);
      setSuccessMessage("User restored.");
      trashList.fetchTrash(trashList.trashPage);
      return;
    }
    if (action === "bulk-restore") {
      const count = trashList.selection.selected.size;
      await usersApi.bulkRestore([...trashList.selection.selected]);
      trashList.selection.clear();
      setSuccessMessage(`${count} user(s) restored.`);
      trashList.fetchTrash(trashList.trashPage);
      return;
    }
    userList.fetchUsers(userList.page);
  };

  const totalPages = Math.ceil(userList.total / PAGE_SIZE);
  const trashTotalPages = Math.ceil(trashList.trashTotal / PAGE_SIZE);
  const courseMap = Object.fromEntries((catalog.courses || []).map((course) => [String(course.id), course.code || course.name]));
  const sectionMap = Object.fromEntries((catalog.sections || []).map((section) => [String(section.id), section.name]));

  const allOnPageSelected = userList.users.length > 0 && userList.users.every((u) => userList.selection.selected.has(u.id));
  const columns = [
    { render: () => <SelectAllHeader checked={allOnPageSelected} onChange={() => userList.selection.toggleAllOnPage(userList.users)} /> },
    "Student No.", "Name", "Course/Section", "Enrollment", "Status", "Actions",
  ];
  const rows = userList.users.map((u) => {
    const courseLabel = courseMap[String(u.course_id)] || (u.course_id ? `#${u.course_id}` : "—");
    const sectionLabel = sectionMap[String(u.section_id)] || "";
    const courseSection = sectionLabel ? `${courseLabel} / ${sectionLabel}` : courseLabel;
    return (
      <>
        <td className="px-4 py-2">
          <input type="checkbox" checked={userList.selection.selected.has(u.id)} onChange={() => userList.selection.toggle(u.id)}
            className="rounded border-gray-300" aria-label={`Select ${u.full_name}`} />
        </td>
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
            <button onClick={() => setModal(u)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:underline">
              <Pencil size={12} />Edit
            </button>
            {u.role === "student" && (
              <button onClick={() => setTransitionTarget(u)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:underline">
                <GraduationCap size={12} />Transition
              </button>
            )}
            <button onClick={() => setResetPasswordTarget(u)}
              disabled={!!u.must_change_password}
              title={u.must_change_password ? "This user already has a default password pending change." : undefined}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline">
              <KeyRound size={12} />Reset Password
            </button>
            <button onClick={() => setConfirm({ action: "trash-one", userId: u.id, label: `Move ${u.full_name} to trash? They can be restored within 30 days before being permanently deleted.` })}
              className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline">
              <Trash2 size={12} />Delete
            </button>
          </div>
        </td>
      </>
    );
  });

  const trashAllOnPageSelected = trashList.trashUsers.length > 0 && trashList.trashUsers.every((u) => trashList.selection.selected.has(u.id));
  const trashColumns = [
    { render: () => <SelectAllHeader checked={trashAllOnPageSelected} onChange={() => trashList.selection.toggleAllOnPage(trashList.trashUsers)} /> },
    "Student No.", "Name", "Role", "Deleted On", "Days Remaining", "Actions",
  ];
  const trashRows = trashList.trashUsers.map((u) => (
    <>
      <td className="px-4 py-2">
        <input type="checkbox" checked={trashList.selection.selected.has(u.id)} onChange={() => trashList.selection.toggle(u.id)}
          className="rounded border-gray-300" aria-label={`Select ${u.full_name}`} />
      </td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 font-mono text-xs">{u.student_number}</td>
      <td className="px-4 py-2 text-gray-800 dark:text-gray-100">{u.full_name}</td>
      <td className="px-4 py-2 text-gray-600 dark:text-gray-300 text-xs capitalize">{u.role}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{new Date(u.deleted_at).toLocaleString()}</td>
      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{u.days_remaining} day{u.days_remaining === 1 ? "" : "s"}</td>
      <td className="px-4 py-2">
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={() => setConfirm({ action: "restore", userId: u.id, label: `Restore ${u.full_name}?` })}
            className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
            <RotateCcw size={12} />Restore
          </button>
          <button onClick={() => setPermanentDeleteTarget(u)}
            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline">
            <Trash2 size={12} />Delete Forever
          </button>
        </div>
      </td>
    </>
  ));

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
            <select value={csv.templateRole} onChange={(e) => csv.setTemplateRole(e.target.value)}
              className="text-xs font-semibold text-pink-700 dark:text-pink-300 pl-3 pr-1 py-2 bg-transparent focus:outline-none capitalize">
              {["student", "faculty", "staff"].map((r) => (
                <option key={r} value={r} className="capitalize">{r}</option>
              ))}
            </select>
            <button onClick={csv.downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 text-pink-700 dark:text-pink-300 text-xs font-semibold pl-2 pr-4 py-2 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition border-l border-pink-100 dark:border-pink-900/60">
              <Download size={14} /> Download Template
            </button>
          </div>
          <button onClick={() => { if (fileRef.current) fileRef.current.value = ""; fileRef.current?.click(); }}
            className="inline-flex items-center gap-1.5 bg-white dark:bg-wine-900 border border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300 text-xs font-semibold px-4 py-2 rounded-xl shadow hover:bg-pink-50 dark:hover:bg-pink-950/40 transition">
            <Upload size={14} /> Import File
          </button>
          <div className="inline-flex items-center rounded-xl border border-pink-200 dark:border-pink-900 bg-white dark:bg-wine-900 shadow overflow-hidden">
            <button onClick={transition.downloadTemplate}
              className="inline-flex items-center gap-1.5 text-pink-700 dark:text-pink-300 text-xs font-semibold pl-3 pr-2 py-2 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition">
              <Download size={14} /> Transition Template
            </button>
            <button onClick={() => { if (transitionFileRef.current) transitionFileRef.current.value = ""; transitionFileRef.current?.click(); }}
              className="inline-flex items-center gap-1.5 text-pink-700 dark:text-pink-300 text-xs font-semibold pl-2 pr-4 py-2 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition border-l border-pink-100 dark:border-pink-900/60">
              <GraduationCap size={14} /> New Semester
            </button>
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={csv.handleFileSelected} />
      <input ref={transitionFileRef} type="file" accept=".xlsx" className="hidden" onChange={transition.handleFileSelected} />

      {/* Filters */}
      {view === "active" && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <UserFilterBar
          search={userList.search} onSearchChange={userList.setSearch}
          role={userList.filterRole} onRoleChange={userList.setFilterRole}
          status={userList.filterStatus} onStatusChange={userList.setFilterStatus}
          enrollment={userList.filterEnrollment} onEnrollmentChange={userList.setFilterEnrollment}
          course={userList.filterCourse} onCourseChange={(v) => { userList.setFilterCourse(v); userList.setFilterSection(""); }}
          section={userList.filterSection} onSectionChange={userList.setFilterSection}
          catalog={catalog}
        />
        <div className="flex flex-wrap items-center gap-2">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition ${
                view === v.key ? "bg-pink-600 text-white shadow" : "bg-white dark:bg-wine-900 border border-pink-200 dark:border-pink-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"
              }`}>
              {v.label}
            </button>
          ))}
          <button disabled={userList.selection.selected.size === 0}
            onClick={() => setConfirm({ action: "bulk-trash", label: `Move ${userList.selection.selected.size} user(s) to trash? They can be restored within 30 days before being permanently deleted.` })}
            className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium px-3 py-2 rounded-xl shadow transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-pink-600">
            <Trash2 size={14} /> Move to Trash{userList.selection.selected.size > 0 ? ` (${userList.selection.selected.size})` : ""}
          </button>
        </div>
      </div>
      )}

      {view === "active" && (
        <AdminTable columns={columns} rows={rows} loading={userList.loading} page={userList.page} totalPages={totalPages} onPage={userList.setPage}
          emptyText="No users found."
          emptyHint="Try a different search term or adjust the filters above." />
      )}

      {view === "trash" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <UserFilterBar
              search={trashList.trashSearch} onSearchChange={trashList.setTrashSearch}
              role={trashList.trashFilterRole} onRoleChange={trashList.setTrashFilterRole}
              course={trashList.trashFilterCourse} onCourseChange={(v) => { trashList.setTrashFilterCourse(v); trashList.setTrashFilterSection(""); }}
              section={trashList.trashFilterSection} onSectionChange={trashList.setTrashFilterSection}
              catalog={catalog}
            />
            <div className="flex flex-wrap items-center gap-2">
              {VIEWS.map((v) => (
                <button key={v.key} onClick={() => setView(v.key)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition ${
                    view === v.key ? "bg-pink-600 text-white shadow" : "bg-white dark:bg-wine-900 border border-pink-200 dark:border-pink-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"
                  }`}>
                  {v.label}
                </button>
              ))}
              <button disabled={trashList.selection.selected.size === 0}
                onClick={() => setConfirm({ action: "bulk-restore", label: `Restore ${trashList.selection.selected.size} user(s)?` })}
                className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium px-3 py-2 rounded-xl shadow transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-pink-600">
                <RotateCcw size={14} /> Restore Selected{trashList.selection.selected.size > 0 ? ` (${trashList.selection.selected.size})` : ""}
              </button>
              <button disabled={trashList.selection.selected.size === 0}
                onClick={() => setBulkPermanentDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-2 rounded-xl shadow transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-600">
                <Trash2 size={14} /> Delete Forever{trashList.selection.selected.size > 0 ? ` (${trashList.selection.selected.size})` : ""}
              </button>
            </div>
          </div>

          <AdminTable columns={trashColumns} rows={trashRows} loading={trashList.trashLoading} page={trashList.trashPage} totalPages={trashTotalPages} onPage={trashList.setTrashPage}
            emptyText="Trash is empty." />
        </>
      )}

      <CsvImportModal csv={csv} />
      <EnrollmentTransitionModal t={transition} />
      {transitionTarget && (
        <SingleTransitionModal
          student={transitionTarget}
          catalog={catalog}
          onClose={() => setTransitionTarget(null)}
          onDone={() => {
            setTransitionTarget(null);
            userList.fetchUsers(userList.page);
            setSuccessMessage("Student transitioned successfully.");
          }}
        />
      )}

      {modal && (
        <UserFormModal
          user={modal === "add" ? null : modal}
          courses={catalog.courses}
          sections={catalog.sections}
          onClose={() => setModal(null)}
          onSaved={() => {
            const wasAdd = modal === "add";
            setModal(null);
            userList.fetchUsers(userList.page);
            if (wasAdd) setSuccessMessage("User created successfully.");
          }}
          onError={(message) => setErrorMessage(message)}
        />
      )}
      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doAction} onCancel={() => setConfirm(null)} />}
      {successMessage && (
        <ConfirmDialog
          title="Success"
          message={successMessage}
          confirmLabel="OK"
          danger={false}
          onConfirm={() => setSuccessMessage("")}
          onCancel={() => setSuccessMessage("")}
        />
      )}
      {errorMessage && (
        <ConfirmDialog
          title="Unable to save"
          message={errorMessage}
          confirmLabel="OK"
          onConfirm={() => setErrorMessage("")}
          onCancel={() => setErrorMessage("")}
        />
      )}
      {resetPasswordTarget && (
        <ResetPasswordModal
          user={resetPasswordTarget}
          onClose={() => setResetPasswordTarget(null)}
          onReset={() => userList.fetchUsers(userList.page)}
        />
      )}
      {permanentDeleteTarget && (
        <PermanentDeleteModal
          user={permanentDeleteTarget}
          onClose={() => setPermanentDeleteTarget(null)}
          onDeleted={() => {
            setPermanentDeleteTarget(null);
            trashList.fetchTrash(trashList.trashPage);
            setSuccessMessage("User permanently deleted.");
          }}
          onError={(message) => setPermanentDeleteError(message)}
        />
      )}
      {bulkPermanentDeleteOpen && (
        <PermanentDeleteModal
          ids={[...trashList.selection.selected]}
          onClose={() => setBulkPermanentDeleteOpen(false)}
          onDeleted={() => {
            const count = trashList.selection.selected.size;
            setBulkPermanentDeleteOpen(false);
            trashList.selection.clear();
            trashList.fetchTrash(trashList.trashPage);
            setSuccessMessage(`${count} user(s) permanently deleted.`);
          }}
          onError={(message) => setPermanentDeleteError(message)}
        />
      )}
      {permanentDeleteError && (
        <ConfirmDialog
          title="Unable to delete"
          message={permanentDeleteError}
          confirmLabel="OK"
          onConfirm={() => setPermanentDeleteError("")}
          onCancel={() => setPermanentDeleteError("")}
        />
      )}
    </div>
  );
}
