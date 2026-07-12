import { useState } from "react";
import { Plus, Pencil, Trash2, GraduationCap, Users2, CalendarRange, Layers, X } from "lucide-react";
import adminApi from "../adminApi";
import ConfirmDialog from "../ConfirmDialog";
import SectionCard from "./SectionCard";

// Courses / sections / school years / semesters tabs — full catalog CRUD. Owns its
// own edit-form and delete-confirmation state since nothing outside this tab needs it.
export default function CatalogSettingsSection({ activeSection, catalog, onCatalogChange, onError, settings, onSettingsChange }) {
  const [courseForm, setCourseForm] = useState({ code: "", name: "" });
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [sectionForm, setSectionForm] = useState({ name: "", course_id: "" });
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionCourseFilter, setSectionCourseFilter] = useState("");
  const [schoolYearForm, setSchoolYearForm] = useState({ name: "" });
  const [editingSchoolYearId, setEditingSchoolYearId] = useState(null);
  const [semesterForm, setSemesterForm] = useState({ name: "" });
  const [editingSemesterId, setEditingSemesterId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refreshCatalog = async () => {
    const res = await adminApi.get("/admin/settings/catalog");
    onCatalogChange(res.data || { courses: [], sections: [], school_years: [], semesters: [] });
  };

  // Collapses the try/save-or-delete/refresh/report-error pattern shared by all four
  // course/section mutations below — the JSX for each stays separate since course and
  // section forms/rows differ enough that unifying them isn't worth the indirection.
  const runCatalogAction = async (action, errorMessage) => {
    try {
      await action();
      await refreshCatalog();
    } catch (err) {
      onError(err.response?.data?.message || errorMessage);
    }
  };

  const cancelCourseEdit = () => { setEditingCourseId(null); setCourseForm({ code: "", name: "" }); };
  const cancelSectionEdit = () => { setEditingSectionId(null); setSectionForm({ name: "", course_id: "" }); };

  const handleCourseSubmit = (e) => {
    e.preventDefault();
    const payload = { code: courseForm.code.trim(), name: courseForm.name.trim() };
    runCatalogAction(async () => {
      if (editingCourseId) await adminApi.put(`/admin/settings/catalog/courses/${editingCourseId}`, payload);
      else await adminApi.post("/admin/settings/catalog/courses", payload);
      cancelCourseEdit();
    }, "Unable to save course.");
  };

  const handleCourseDelete = (id) =>
    runCatalogAction(() => adminApi.delete(`/admin/settings/catalog/courses/${id}`), "Unable to delete course.");

  const handleSectionSubmit = (e) => {
    e.preventDefault();
    const payload = { name: sectionForm.name.trim(), course_id: sectionForm.course_id };
    runCatalogAction(async () => {
      if (editingSectionId) await adminApi.put(`/admin/settings/catalog/sections/${editingSectionId}`, payload);
      else await adminApi.post("/admin/settings/catalog/sections", payload);
      cancelSectionEdit();
    }, "Unable to save section.");
  };

  const handleSectionDelete = (id) =>
    runCatalogAction(() => adminApi.delete(`/admin/settings/catalog/sections/${id}`), "Unable to delete section.");

  const cancelSchoolYearEdit = () => { setEditingSchoolYearId(null); setSchoolYearForm({ name: "" }); };
  const cancelSemesterEdit = () => { setEditingSemesterId(null); setSemesterForm({ name: "" }); };

  const handleSchoolYearSubmit = (e) => {
    e.preventDefault();
    const payload = { name: schoolYearForm.name.trim() };
    runCatalogAction(async () => {
      if (editingSchoolYearId) await adminApi.put(`/admin/settings/catalog/school-years/${editingSchoolYearId}`, payload);
      else await adminApi.post("/admin/settings/catalog/school-years", payload);
      cancelSchoolYearEdit();
    }, "Unable to save school year.");
  };

  const handleSchoolYearDelete = (id) =>
    runCatalogAction(() => adminApi.delete(`/admin/settings/catalog/school-years/${id}`), "Unable to delete school year.");

  const handleSemesterSubmit = (e) => {
    e.preventDefault();
    const payload = { name: semesterForm.name.trim() };
    runCatalogAction(async () => {
      if (editingSemesterId) await adminApi.put(`/admin/settings/catalog/semesters/${editingSemesterId}`, payload);
      else await adminApi.post("/admin/settings/catalog/semesters", payload);
      cancelSemesterEdit();
    }, "Unable to save semester.");
  };

  const handleSemesterDelete = (id) =>
    runCatalogAction(() => adminApi.delete(`/admin/settings/catalog/semesters/${id}`), "Unable to delete semester.");

  const doConfirmedDelete = async () => {
    const { type, id } = confirmDelete;
    setConfirmDelete(null);
    if (type === "course") await handleCourseDelete(id);
    if (type === "section") await handleSectionDelete(id);
    if (type === "school_year") await handleSchoolYearDelete(id);
    if (type === "semester") await handleSemesterDelete(id);
  };

  const visibleSections = (catalog.sections || []).filter(
    (s) => !sectionCourseFilter || String(s.course_id) === sectionCourseFilter
  );

  return (
    <>
      {activeSection === "courses" && (
        <SectionCard icon={<GraduationCap size={16} />} title="Courses" hint="Course codes and names available for student accounts.">
          {!editingCourseId && (
            <form onSubmit={handleCourseSubmit} className="flex flex-wrap gap-2">
              <input
                value={courseForm.code}
                onChange={(e) => setCourseForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="Course code (e.g. BSIT)"
                className="w-32 shrink-0 border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              />
              <input
                value={courseForm.name}
                onChange={(e) => setCourseForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Course name (e.g. Bachelor of Science in Information Technology)"
                className="flex-1 min-w-[12rem] border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              />
              <button type="submit" className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition shrink-0">
                <Plus size={13} />
                Add
              </button>
            </form>
          )}
          <div className="mt-3 space-y-1.5">
            {(catalog.courses || []).length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No courses yet — add your first course above.</p>
            )}
            {(catalog.courses || []).map((course) => (
              editingCourseId === course.id ? (
                <form key={course.id} onSubmit={handleCourseSubmit}
                  className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 border border-pink-300 dark:border-pink-800 bg-pink-50/60 dark:bg-pink-950/30 ring-1 ring-pink-200 dark:ring-pink-900">
                  <input
                    autoFocus
                    value={courseForm.code}
                    onChange={(e) => setCourseForm((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="Course code"
                    className="w-28 shrink-0 border border-slate-200 dark:border-wine-800 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                  />
                  <input
                    value={courseForm.name}
                    onChange={(e) => setCourseForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Course name"
                    className="flex-1 min-w-[10rem] border border-slate-200 dark:border-wine-800 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                  />
                  <div className="flex gap-1 shrink-0">
                    <button type="submit" className="p-1.5 rounded-lg text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-950/50 transition" aria-label="Save course">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={cancelCourseEdit}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-wine-800/40 transition" aria-label="Cancel edit">
                      <X size={13} />
                    </button>
                  </div>
                </form>
              ) : (
                <div key={course.id}
                  className="group flex items-center justify-between rounded-xl px-3 py-2 border border-slate-100 dark:border-wine-800/70 hover:border-slate-200 dark:hover:border-wine-700 hover:bg-slate-50/60 dark:hover:bg-wine-800/40 transition">
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    <span className="font-medium">{course.code}</span>
                    {course.name && course.name !== course.code && (
                      <span className="text-gray-400 dark:text-gray-500 font-normal"> — {course.name}</span>
                    )}
                  </span>
                  <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                    <button type="button" onClick={() => { setEditingCourseId(course.id); setCourseForm({ code: course.code || "", name: course.name === course.code ? "" : (course.name || "") }); }}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition" aria-label="Edit course">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete({ type: "course", id: course.id, label: `Delete ${course.code || course.name} and all of its sections? This cannot be undone.` })}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition" aria-label="Delete course">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        </SectionCard>
      )}

      {activeSection === "sections" && (
        <SectionCard icon={<Users2 size={16} />} title="Sections" hint="Class sections grouped under a course.">
          {!editingSectionId && (
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
                <Plus size={13} />
                Add
              </button>
            </form>
          )}
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
              if (editingSectionId === section.id) {
                return (
                  <form key={section.id} onSubmit={handleSectionSubmit}
                    className="flex items-center gap-2 rounded-xl px-3 py-1.5 border border-pink-300 dark:border-pink-800 bg-pink-50/60 dark:bg-pink-950/30 ring-1 ring-pink-200 dark:ring-pink-900">
                    <input
                      autoFocus
                      value={sectionForm.name}
                      onChange={(e) => setSectionForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Section name"
                      className="flex-1 min-w-0 border border-slate-200 dark:border-wine-800 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                    />
                    <select
                      value={sectionForm.course_id}
                      onChange={(e) => setSectionForm((prev) => ({ ...prev, course_id: e.target.value }))}
                      className="w-28 shrink-0 border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                    >
                      <option value="">Course</option>
                      {(catalog.courses || []).map((c) => (
                        <option key={c.id} value={c.id}>{c.code || c.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-1 shrink-0">
                      <button type="submit" className="p-1.5 rounded-lg text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-950/50 transition" aria-label="Save section">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={cancelSectionEdit}
                        className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-wine-800/40 transition" aria-label="Cancel edit">
                        <X size={13} />
                      </button>
                    </div>
                  </form>
                );
              }
              return (
                <div key={section.id}
                  className="group flex items-center justify-between rounded-xl px-3 py-1.5 border border-slate-100 dark:border-wine-800/70 hover:border-slate-200 dark:hover:border-wine-700 hover:bg-slate-50/60 dark:hover:bg-wine-800/40 transition">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">{section.name}</p>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-wine-800 text-slate-500 dark:text-gray-400 shrink-0">
                      {course ? (course.code || course.name) : "Unassigned"}
                    </span>
                    {course?.name && course.name !== course.code && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate" title={course.name}>{course.name}</span>
                    )}
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

      {activeSection === "school_years" && (
        <SectionCard icon={<CalendarRange size={16} />} title="School Years" hint="School years available for CSV student roster import.">
          {!editingSchoolYearId && (
            <form onSubmit={handleSchoolYearSubmit} className="flex flex-wrap items-start gap-2">
              <div>
                <input
                  type="number"
                  value={(schoolYearForm.name || "").split("-")[0] || ""}
                  onChange={(e) => setSchoolYearForm({ name: e.target.value ? `${e.target.value}-${Number(e.target.value) + 1}` : "" })}
                  placeholder="2025"
                  className="w-28 border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Will save as: {schoolYearForm.name || "—"}</p>
              </div>
              <button type="submit" className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition shrink-0">
                <Plus size={13} />
                Add
              </button>
            </form>
          )}
          <div className="mt-3">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2">
              Current school year (used for CSV imports)
              <select
                value={settings?.current_school_year_id || ""}
                onChange={(e) => onSettingsChange("current_school_year_id", e.target.value)}
                className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              >
                <option value="">Not set</option>
                {(catalog.school_years || []).map((sy) => (
                  <option key={sy.id} value={sy.id}>{sy.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 space-y-1.5">
            {(catalog.school_years || []).length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No school years yet — add your first school year above.</p>
            )}
            {(catalog.school_years || []).map((schoolYear) => (
              editingSchoolYearId === schoolYear.id ? (
                <form key={schoolYear.id} onSubmit={handleSchoolYearSubmit}
                  className="flex items-start gap-2 rounded-xl px-3 py-2 border border-pink-300 dark:border-pink-800 bg-pink-50/60 dark:bg-pink-950/30 ring-1 ring-pink-200 dark:ring-pink-900">
                  <div className="flex-1 min-w-0">
                    <input
                      autoFocus
                      type="number"
                      value={(schoolYearForm.name || "").split("-")[0] || ""}
                      onChange={(e) => setSchoolYearForm({ name: e.target.value ? `${e.target.value}-${Number(e.target.value) + 1}` : "" })}
                      placeholder="2025"
                      className="w-28 border border-slate-200 dark:border-wine-800 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                    />
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Will save as: {schoolYearForm.name || "—"}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="submit" className="p-1.5 rounded-lg text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-950/50 transition" aria-label="Save school year">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={cancelSchoolYearEdit}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-wine-800/40 transition" aria-label="Cancel edit">
                      <X size={13} />
                    </button>
                  </div>
                </form>
              ) : (
                <div key={schoolYear.id}
                  className="group flex items-center justify-between rounded-xl px-3 py-2 border border-slate-100 dark:border-wine-800/70 hover:border-slate-200 dark:hover:border-wine-700 hover:bg-slate-50/60 dark:hover:bg-wine-800/40 transition">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {schoolYear.name}
                    {String(schoolYear.id) === String(settings?.current_school_year_id) && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-300 border border-pink-100 dark:border-pink-900 shrink-0">Current</span>
                    )}
                  </span>
                  <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                    <button type="button" onClick={() => { setEditingSchoolYearId(schoolYear.id); setSchoolYearForm({ name: schoolYear.name || "" }); }}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition" aria-label="Edit school year">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete({ type: "school_year", id: schoolYear.id, label: `Delete school year ${schoolYear.name}? This cannot be undone.` })}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition" aria-label="Delete school year">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        </SectionCard>
      )}

      {activeSection === "semesters" && (
        <SectionCard icon={<Layers size={16} />} title="Semesters" hint="Semesters available for CSV student roster import.">
          {!editingSemesterId && (
            <form onSubmit={handleSemesterSubmit} className="flex gap-2">
              <input
                value={semesterForm.name}
                onChange={(e) => setSemesterForm({ name: e.target.value })}
                placeholder="Semester (e.g. 1st)"
                className="flex-1 min-w-0 border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              />
              <button type="submit" className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition shrink-0">
                <Plus size={13} />
                Add
              </button>
            </form>
          )}
          <div className="mt-3">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2">
              Current semester (used for CSV imports)
              <select
                value={settings?.current_semester_id || ""}
                onChange={(e) => onSettingsChange("current_semester_id", e.target.value)}
                className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              >
                <option value="">Not set</option>
                {(catalog.semesters || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 space-y-1.5">
            {(catalog.semesters || []).length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No semesters yet — add your first semester above.</p>
            )}
            {(catalog.semesters || []).map((semester) => (
              editingSemesterId === semester.id ? (
                <form key={semester.id} onSubmit={handleSemesterSubmit}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 border border-pink-300 dark:border-pink-800 bg-pink-50/60 dark:bg-pink-950/30 ring-1 ring-pink-200 dark:ring-pink-900">
                  <input
                    autoFocus
                    value={semesterForm.name}
                    onChange={(e) => setSemesterForm({ name: e.target.value })}
                    placeholder="Semester"
                    className="flex-1 min-w-0 border border-slate-200 dark:border-wine-800 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                  />
                  <div className="flex gap-1 shrink-0">
                    <button type="submit" className="p-1.5 rounded-lg text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-950/50 transition" aria-label="Save semester">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={cancelSemesterEdit}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-wine-800/40 transition" aria-label="Cancel edit">
                      <X size={13} />
                    </button>
                  </div>
                </form>
              ) : (
                <div key={semester.id}
                  className="group flex items-center justify-between rounded-xl px-3 py-2 border border-slate-100 dark:border-wine-800/70 hover:border-slate-200 dark:hover:border-wine-700 hover:bg-slate-50/60 dark:hover:bg-wine-800/40 transition">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {semester.name}
                    {String(semester.id) === String(settings?.current_semester_id) && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-300 border border-pink-100 dark:border-pink-900 shrink-0">Current</span>
                    )}
                  </span>
                  <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                    <button type="button" onClick={() => { setEditingSemesterId(semester.id); setSemesterForm({ name: semester.name || "" }); }}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition" aria-label="Edit semester">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete({ type: "semester", id: semester.id, label: `Delete semester ${semester.name}? This cannot be undone.` })}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition" aria-label="Delete semester">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        </SectionCard>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete from catalog"
          message={confirmDelete.label}
          confirmLabel="Delete"
          onConfirm={doConfirmedDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
