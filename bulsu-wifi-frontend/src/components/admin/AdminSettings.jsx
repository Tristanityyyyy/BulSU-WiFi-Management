import { Fragment, useEffect, useState } from "react";
import { Save, Plus, Pencil, Trash2, Gauge, Database, Timer, GraduationCap, Users2, X, SunMoon, Sun, Moon, Monitor } from "lucide-react";
import adminApi from "./adminApi";
import { useTheme } from "../../theme";
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

const NAV_GROUPS = [
  {
    label: "Network",
    items: [
      { key: "bandwidth", label: "Bandwidth Limits", icon: Gauge },
      { key: "datacap", label: "Data Caps", icon: Database },
      { key: "timeout", label: "Session Timeout", icon: Timer },
    ],
  },
  {
    label: "Catalog",
    items: [
      { key: "courses", label: "Courses", icon: GraduationCap },
      { key: "sections", label: "Sections", icon: Users2 },
    ],
  },
  {
    label: "Appearance",
    items: [
      { key: "display", label: "Display", icon: SunMoon },
    ],
  },
];

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun, desc: "Always bright" },
  { value: "dark", label: "Dark", icon: Moon, desc: "Always dimmed" },
  { value: "system", label: "System", icon: Monitor, desc: "Follows your device" },
];

const NETWORK_SECTIONS = ["bandwidth", "datacap", "timeout"];

function SectionCard({ icon, title, hint, children }) {
  return (
    <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-5 h-full">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/60 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="pt-0.5">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">{title}</p>
          {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
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
            <tr className="border-b border-slate-100 dark:border-wine-800/70">
              <th className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide pb-2 w-24">Role</th>
              {columns.map((col) => (
                <th key={col.key} className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide pb-2 px-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-wine-800/60">
            {ROLES.map((role) => (
              <tr key={role} className="hover:bg-slate-50/60 dark:hover:bg-wine-800/40 transition-colors">
                <td className="py-2.5 pr-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{ROLE_LABELS[role]}</span>
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
                          className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-20 transition"
                        />
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{col.unit}</span>
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
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState(DEFAULTS);
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("bandwidth");
  const [courseForm, setCourseForm] = useState({ code: "" });
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [sectionForm, setSectionForm] = useState({ name: "", course_id: "" });
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionCourseFilter, setSectionCourseFilter] = useState("");
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

  const isNetworkSection = NETWORK_SECTIONS.includes(activeSection);
  const visibleSections = (catalog.sections || []).filter(
    (s) => !sectionCourseFilter || String(s.course_id) === sectionCourseFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Settings</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Configure network limits per role and manage the course catalog.</p>
        </div>
        {(isNetworkSection || dirty) && (
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unsaved changes
              </span>
            )}
            <button type="submit" form="settings-form" disabled={saving || !dirty}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl px-4 py-2 text-xs font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-50 disabled:shadow-none transition">
              <Save size={14} />
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 md:items-start">
        {/* Inner settings navigation */}
        <nav className="w-full md:w-60 shrink-0 md:sticky md:top-4 bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-2 flex md:flex-col gap-1 overflow-x-auto">
          {NAV_GROUPS.map((group) => (
            <Fragment key={group.label}>
              <p className="hidden md:block px-3 pt-3 pb-1 first:pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                {group.label}
              </p>
              {group.items.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" onClick={() => setActiveSection(key)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                    activeSection === key
                      ? "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-900"
                      : "text-gray-600 dark:text-gray-300 border border-transparent hover:bg-slate-50 dark:hover:bg-wine-800/40"
                  }`}>
                  <Icon size={15} className={activeSection === key ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-gray-500"} />
                  {label}
                </button>
              ))}
            </Fragment>
          ))}
        </nav>

        {/* Active section content */}
        <div className="flex-1 min-w-0 w-full">
          {isNetworkSection && (
            <form id="settings-form" onSubmit={handleSave}>
              {activeSection === "bandwidth" && (
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
              )}
              {activeSection === "datacap" && (
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
              )}
              {activeSection === "timeout" && (
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
              )}
            </form>
          )}

          {activeSection === "display" && (
            <SectionCard icon={<SunMoon size={16} />} title="Display" hint="Choose how the admin console looks. Saved on this device only.">
              <div className="grid grid-cols-3 gap-3">
                {THEME_OPTIONS.map(({ value, label, icon: Icon, desc }) => (
                  <button key={value} type="button" onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition ${
                      theme === value
                        ? "border-pink-300 dark:border-pink-800 bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 ring-1 ring-pink-200 dark:ring-pink-900"
                        : "border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 hover:border-slate-300 dark:hover:border-wine-700 hover:bg-slate-50 dark:hover:bg-wine-800/40"
                    }`}>
                    <Icon size={20} className={theme === value ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-gray-500"} />
                    {label}
                    <span className={`text-[11px] font-normal ${theme === value ? "text-pink-500/80 dark:text-pink-400/70" : "text-gray-400 dark:text-gray-500"}`}>{desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                Changes apply immediately. The student portal keeps its own look and is not affected.
              </p>
            </SectionCard>
          )}

          {activeSection === "courses" && (
            <SectionCard icon={<GraduationCap size={16} />} title="Courses" hint="Course codes available for student accounts.">
              <form onSubmit={handleCourseSubmit} className="flex gap-2">
                <input
                  value={courseForm.code}
                  onChange={(e) => setCourseForm({ code: e.target.value })}
                  placeholder="Course code (e.g. BSIT)"
                  className="flex-1 min-w-0 border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                />
                <button type="submit" className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition shrink-0">
                  {editingCourseId ? <Pencil size={13} /> : <Plus size={13} />}
                  {editingCourseId ? "Update" : "Add"}
                </button>
                {editingCourseId && (
                  <button type="button" onClick={cancelCourseEdit}
                    className="inline-flex items-center justify-center border border-slate-200 dark:border-wine-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-wine-800/40 rounded-xl px-2.5 transition shrink-0" aria-label="Cancel edit">
                    <X size={14} />
                  </button>
                )}
              </form>
              <div className="mt-3 space-y-1.5">
                {(catalog.courses || []).length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No courses yet — add your first course above.</p>
                )}
                {(catalog.courses || []).map((course) => (
                  <div key={course.id}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2 border transition ${
                      editingCourseId === course.id ? "border-pink-300 dark:border-pink-800 bg-pink-50/60 dark:bg-pink-950/30 ring-1 ring-pink-200 dark:ring-pink-900" : "border-slate-100 dark:border-wine-800/70 hover:border-slate-200 dark:hover:border-wine-700 hover:bg-slate-50/60 dark:hover:bg-wine-800/40"
                    }`}>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{course.code || course.name}</span>
                    <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => { setEditingCourseId(course.id); setCourseForm({ code: course.code || course.name }); }}
                        className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition" aria-label="Edit course">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => setConfirmDelete({ type: "course", id: course.id, label: `Delete ${course.code || course.name} and all of its sections? This cannot be undone.` })}
                        className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition" aria-label="Delete course">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {activeSection === "sections" && (
            <SectionCard icon={<Users2 size={16} />} title="Sections" hint="Class sections grouped under a course.">
              <form onSubmit={handleSectionSubmit} className="flex gap-2">
                <input
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Section name"
                  className="flex-1 min-w-0 border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                />
                <select
                  value={sectionForm.course_id}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, course_id: e.target.value }))}
                  className="w-28 shrink-0 border border-slate-200 dark:border-wine-800 rounded-xl px-2 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                >
                  <option value="">Course</option>
                  {(catalog.courses || []).map((course) => (
                    <option key={course.id} value={course.id}>{course.code || course.name}</option>
                  ))}
                </select>
                <button type="submit" className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition shrink-0">
                  {editingSectionId ? <Pencil size={13} /> : <Plus size={13} />}
                  {editingSectionId ? "Update" : "Add"}
                </button>
                {editingSectionId && (
                  <button type="button" onClick={cancelSectionEdit}
                    className="inline-flex items-center justify-center border border-slate-200 dark:border-wine-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-wine-800/40 rounded-xl px-2.5 transition shrink-0" aria-label="Cancel edit">
                    <X size={14} />
                  </button>
                )}
              </form>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                  {visibleSections.length} section{visibleSections.length === 1 ? "" : "s"}
                </p>
                <select
                  value={sectionCourseFilter}
                  onChange={(e) => setSectionCourseFilter(e.target.value)}
                  className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                >
                  <option value="">All courses</option>
                  {(catalog.courses || []).map((course) => (
                    <option key={course.id} value={course.id}>{course.code || course.name}</option>
                  ))}
                </select>
              </div>
              <div className="mt-2 space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {visibleSections.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
                    {sectionCourseFilter ? "No sections under this course yet." : "No sections yet — add one and assign it to a course."}
                  </p>
                )}
                {visibleSections.map((section) => {
                  const course = (catalog.courses || []).find((item) => item.id === section.course_id);
                  return (
                    <div key={section.id}
                      className={`group flex items-center justify-between rounded-xl px-3 py-1.5 border transition ${
                        editingSectionId === section.id ? "border-pink-300 dark:border-pink-800 bg-pink-50/60 dark:bg-pink-950/30 ring-1 ring-pink-200 dark:ring-pink-900" : "border-slate-100 dark:border-wine-800/70 hover:border-slate-200 dark:hover:border-wine-700 hover:bg-slate-50/60 dark:hover:bg-wine-800/40"
                      }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{section.name}</p>
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-wine-800 text-slate-500 dark:text-gray-400 shrink-0">
                          {course ? (course.code || course.name) : "Unassigned"}
                        </span>
                      </div>
                      <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                        <button type="button" onClick={() => { setEditingSectionId(section.id); setSectionForm({ name: section.name, course_id: String(section.course_id) }); }}
                          className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition" aria-label="Edit section">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => setConfirmDelete({ type: "section", id: section.id, label: `Delete section ${section.name}? This cannot be undone.` })}
                          className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition" aria-label="Delete section">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </div>
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
