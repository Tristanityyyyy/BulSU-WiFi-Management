import { useEffect, useState } from "react";
import { Save, CheckCircle2, Plus, Pencil, Trash2 } from "lucide-react";
import adminApi from "./adminApi";
import LoadingSpinner from "../ui/LoadingSpinner";

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

function RoleTable({ title, settings, onChange, columns }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide mb-4">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-medium text-gray-400 pb-2 w-24">Role</th>
              {columns.map((col) => (
                <th key={col.key} className="text-left text-xs font-medium text-gray-400 pb-2 px-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ROLES.map((role) => (
              <tr key={role}>
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
                          className="border border-pink-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-20"
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
    </div>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [courseForm, setCourseForm] = useState({ code: "" });
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [sectionForm, setSectionForm] = useState({ name: "", course_id: "" });
  const [editingSectionId, setEditingSectionId] = useState(null);

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
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminApi.put("/admin/settings", settings);
      setSaved(true);
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

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCourseId) {
        await adminApi.put(`/admin/settings/catalog/courses/${editingCourseId}`, { code: courseForm.code.trim() });
      } else {
        await adminApi.post("/admin/settings/catalog/courses", { code: courseForm.code.trim() });
      }
      setCourseForm({ code: "" });
      setEditingCourseId(null);
      await refreshCatalog();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save course.");
    }
  };

  const handleCourseDelete = async (id) => {
    if (!window.confirm("Delete this course and its sections?")) return;
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
      setSectionForm({ name: "", course_id: "" });
      setEditingSectionId(null);
      await refreshCatalog();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save section.");
    }
  };

  const handleSectionDelete = async (id) => {
    if (!window.confirm("Delete this section?")) return;
    try {
      await adminApi.delete(`/admin/settings/catalog/sections/${id}`);
      await refreshCatalog();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete section.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size={40} className="text-pink-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <h2 className="text-base font-semibold text-gray-800">Settings</h2>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
      {saved && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={14} className="text-green-600 shrink-0" /> Settings saved.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <RoleTable
          title="Bandwidth Limits"
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "bandwidth_upload", label: "Upload", unit: "Mbps" },
            { key: "bandwidth_download", label: "Download", unit: "Mbps" },
          ]}
        />

        <RoleTable
          title="Data Cap per Session"
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "data_cap_gb", label: "Data Cap", unit: "GB", step: 0.1 },
          ]}
        />
        <p className="text-xs text-gray-400 -mt-2 px-1">Set to 0 for unlimited.</p>

        <RoleTable
          title="Session Timeout"
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "session_timeout", label: "Timeout", unit: "min" },
          ]}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide">Courses</p>
            </div>
            <form onSubmit={handleCourseSubmit} className="space-y-2">
              <input
                value={courseForm.code}
                onChange={(e) => setCourseForm({ code: e.target.value })}
                placeholder="Course code (e.g. BSIT)"
                className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
              <button type="submit" className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3 py-2 text-sm font-semibold">
                <Plus size={14} /> {editingCourseId ? "Update Course" : "Add Course"}
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {(catalog.courses || []).map((course) => (
                <div key={course.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-700">{course.code || course.name}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditingCourseId(course.id); setCourseForm({ code: course.code || course.name }); }} className="text-gray-500 hover:text-pink-600">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => handleCourseDelete(course.id)} className="text-gray-500 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide">Sections</p>
            </div>
            <form onSubmit={handleSectionSubmit} className="space-y-2">
              <input
                value={sectionForm.name}
                onChange={(e) => setSectionForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Section name"
                className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
              <select
                value={sectionForm.course_id}
                onChange={(e) => setSectionForm((prev) => ({ ...prev, course_id: e.target.value }))}
                className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              >
                <option value="">Select course</option>
                {(catalog.courses || []).map((course) => (
                  <option key={course.id} value={course.id}>{course.code || course.name}</option>
                ))}
              </select>
              <button type="submit" className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3 py-2 text-sm font-semibold">
                <Plus size={14} /> {editingSectionId ? "Update Section" : "Add Section"}
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {(catalog.sections || []).map((section) => {
                const course = (catalog.courses || []).find((item) => item.id === section.course_id);
                return (
                  <div key={section.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-sm text-gray-700">{section.name}</p>
                      <p className="text-xs text-gray-400">{course ? (course.code || course.name) : "Unassigned course"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setEditingSectionId(section.id); setSectionForm({ name: section.name, course_id: String(section.course_id) }); }} className="text-gray-500 hover:text-pink-600">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleSectionDelete(section.id)} className="text-gray-500 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md disabled:opacity-60 transition">
          <Save size={15} />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
