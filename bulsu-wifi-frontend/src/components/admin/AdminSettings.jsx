import { useEffect, useState } from "react";
import { Save, Plus, Pencil, Trash2, Gauge, Database, Timer, GraduationCap, Users2, X } from "lucide-react";
import adminApi from "./adminApi";
import LoadingSpinner from "../ui/LoadingSpinner";
import Toast from "../ui/Toast";
import ConfirmDialog from "./ConfirmDialog";

const ROLES = ["student", "faculty", "staff", "guest"];
const ROLE_LABELS = { student: "Student", faculty: "Faculty", staff: "Staff", guest: "Guest" };

const DEFAULTS = {
  bandwidth_upload_student: 2,   bandwidth_download_student: 5,
  bandwidth_upload_faculty: 5,   bandwidth_download_faculty: 10,
  bandwidth_upload_staff: 5,     bandwidth_download_staff: 10,
  bandwidth_upload_guest: 1,     bandwidth_download_guest: 2,
  data_cap_gb_student: 1,        data_cap_gb_faculty: 0,
  data_cap_gb_staff: 0,          data_cap_gb_guest: 0.5,
  session_timeout_student: 120,  session_timeout_faculty: 240,
  session_timeout_staff: 240,    session_timeout_guest: 60,
};

function SectionCard({ icon, title, hint, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 h-full">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 text-pink-600 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="pt-0.5">
          <p className="text-sm font-semibold text-gray-800 leading-tight">{title}</p>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function RoleTable({ icon, title, hint, settings, onChange, columns }) {
  return (
    <SectionCard icon={icon} title={title} hint={hint}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide pb-2 w-24">Role</th>
              {columns.map((col) => (
                <th key={col.key} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide pb-2 px-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ROLES.map((role) => (
              <tr key={role} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-2.5 pr-2">
                  <span className="text-xs font-semibold text-gray-700">{ROLE_LABELS[role]}</span>
                </td>
                {columns.map((col) => {
                  const key = `${col.key}_${role}`;
                  return (
                    <td key={key} className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={col.step || 1}
                          value={settings[key] ?? ""}
                          onChange={(e) => onChange(key, e.target.value)}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-20 transition"
                        />
                        <span className="text-xs text-gray-400 shrink-0">{col.unit}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [courseForm, setCourseForm] = useState({ code: "" });
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [sectionForm, setSectionForm] = useState({ name: "", course_id: "" });
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    Promise.all([
      adminApi.get("/admin/settings"),
      adminApi.get("/admin/settings/catalog"),
    ])
      .then(([settingsRes, catalogRes]) => {
        setSettings({ ...DEFAULTS, ...settingsRes.data });
        setCatalog(catalogRes.data || { courses: [], sections: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminApi.put("/admin/settings", settings);
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const refreshCatalog = async () => {
    const res = await adminApi.get("/admin/settings/catalog");
    setCatalog(res.data || { courses: [], sections: [] });
  };

  const cancelCourseEdit = () => { setEditingCourseId(null); setCourseForm({ code: "" }); };
  const cancelSectionEdit = () => { setEditingSectionId(null); setSectionForm({ name: "", course_id: "" }); };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCourseId) {
        await adminApi.put(`/admin/settings/catalog/courses/${editingCourseId}`, { code: courseForm.code.trim() });
      } else {
        await adminApi.post("/admin/settings/catalog/courses", { code: courseForm.code.trim() });
      }
      cancelCourseEdit();
      await refreshCatalog();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save course.");
    }
  };

  const handleCourseDelete = async (id) => {
    try {
      await adminApi.delete(`/admin/settings/catalog/courses/${id}`);
      await refreshCatalog();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete course.");
    }
  };

  const handleSectionSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSectionId) {
        await adminApi.put(`/admin/settings/catalog/sections/${editingSectionId}`, { name: sectionForm.name.trim(), course_id: sectionForm.course_id });
      } else {
        await adminApi.post("/admin/settings/catalog/sections", { name: sectionForm.name.trim(), course_id: sectionForm.course_id });
      }
      cancelSectionEdit();
      await refreshCatalog();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save section.");
    }
  };

  const handleSectionDelete = async (id) => {
    try {
      await adminApi.delete(`/admin/settings/catalog/sections/${id}`);
      await refreshCatalog();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete section.");
    }
  };

  const doConfirmedDelete = async () => {
    const { type, id } = confirmDelete;
    setConfirmDelete(null);
    if (type === "course") await handleCourseDelete(id);
    if (type === "section") await handleSectionDelete(id);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size={40} className="text-pink-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Settings</h2>
          <p className="text-xs text-gray-400 mt-0.5">Configure network limits per role and manage the course catalog.</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unsaved changes
            </span>
          )}
          <button type="submit" form="settings-form" disabled={saving || !dirty}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl px-4 py-2 text-xs font-semibold shadow-md shadow-pink-200 disabled:opacity-50 disabled:shadow-none transition">
            <Save size={14} />
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>
        </div>
      )}

      <form id="settings-form" onSubmit={handleSave} className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="lg:col-span-2">
          <RoleTable
            icon={<Gauge size={16} />}
            title="Bandwidth Limits"
            hint="Maximum upload and download speed per connected device."
            settings={settings}
            onChange={handleChange}
            columns={[
              { key: "bandwidth_upload", label: "Upload", unit: "Mbps" },
              { key: "bandwidth_download", label: "Download", unit: "Mbps" },
            ]}
          />
        </div>

        <RoleTable
          icon={<Database size={16} />}
          title="Data Cap per Session"
          hint="Data allowance per session — 0 means unlimited."
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "data_cap_gb", label: "Data Cap", unit: "GB", step: 0.1 },
          ]}
        />

        <RoleTable
          icon={<Timer size={16} />}
          title="Session Timeout"
          hint="How long a session stays active before re-login."
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "session_timeout", label: "Timeout", unit: "min" },
          ]}
        />
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard icon={<GraduationCap size={16} />} title="Courses" hint="Course codes available for student accounts.">
            <form onSubmit={handleCourseSubmit} className="flex gap-2">
              <input
                value={courseForm.code}
                onChange={(e) => setCourseForm({ code: e.target.value })}
                placeholder="Course code (e.g. BSIT)"
                className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              />
              <button type="submit" className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition shrink-0">
                {editingCourseId ? <Pencil size={13} /> : <Plus size={13} />}
                {editingCourseId ? "Update" : "Add"}
              </button>
              {editingCourseId && (
                <button type="button" onClick={cancelCourseEdit}
                  className="inline-flex items-center justify-center border border-slate-200 text-gray-400 hover:text-gray-600 hover:bg-slate-50 rounded-xl px-2.5 transition shrink-0" aria-label="Cancel edit">
                  <X size={14} />
                </button>
              )}
            </form>
            <div className="mt-3 space-y-1.5">
              {(catalog.courses || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No courses yet — add your first course above.</p>
              )}
              {(catalog.courses || []).map((course) => (
                <div key={course.id}
                  className={`group flex items-center justify-between rounded-xl px-3 py-2 border transition ${
                    editingCourseId === course.id ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/60"
                  }`}>
                  <span className="text-sm font-medium text-gray-700">{course.code || course.name}</span>
                  <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => { setEditingCourseId(course.id); setCourseForm({ code: course.code || course.name }); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition" aria-label="Edit course">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete({ type: "course", id: course.id, label: `Delete ${course.code || course.name} and all of its sections? This cannot be undone.` })}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition" aria-label="Delete course">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard icon={<Users2 size={16} />} title="Sections" hint="Class sections grouped under a course.">
            <form onSubmit={handleSectionSubmit} className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Section name"
                  className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                />
                <select
                  value={sectionForm.course_id}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, course_id: e.target.value }))}
                  className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                >
                  <option value="">Select course</option>
                  {(catalog.courses || []).map((course) => (
                    <option key={course.id} value={course.id}>{course.code || course.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition">
                  {editingSectionId ? <Pencil size={13} /> : <Plus size={13} />}
                  {editingSectionId ? "Update Section" : "Add Section"}
                </button>
                {editingSectionId && (
                  <button type="button" onClick={cancelSectionEdit}
                    className="inline-flex items-center gap-1 border border-slate-200 text-gray-400 hover:text-gray-600 hover:bg-slate-50 rounded-xl px-3 py-2 text-xs font-medium transition">
                    <X size={13} /> Cancel
                  </button>
                )}
              </div>
            </form>
            <div className="mt-3 space-y-1.5">
              {(catalog.sections || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No sections yet — add one and assign it to a course.</p>
              )}
              {(catalog.sections || []).map((section) => {
                const course = (catalog.courses || []).find((item) => item.id === section.course_id);
                return (
                  <div key={section.id}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2 border transition ${
                      editingSectionId === section.id ? "border-pink-300 bg-pink-50/60 ring-1 ring-pink-200" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/60"
                    }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{section.name}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                        {course ? (course.code || course.name) : "Unassigned"}
                      </span>
                    </div>
                    <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                      <button type="button" onClick={() => { setEditingSectionId(section.id); setSectionForm({ name: section.name, course_id: String(section.course_id) }); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition" aria-label="Edit section">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => setConfirmDelete({ type: "section", id: section.id, label: `Delete section ${section.name}? This cannot be undone.` })}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition" aria-label="Delete section">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
      </div>

      {saved && <Toast message="Settings saved successfully." onDismiss={() => setSaved(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete from catalog"
          message={confirmDelete.label}
          confirmLabel="Delete"
          onConfirm={doConfirmedDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
