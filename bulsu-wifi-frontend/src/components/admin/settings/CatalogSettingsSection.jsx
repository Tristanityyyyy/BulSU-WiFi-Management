import { useEffect, useState } from "react";
import { Plus, GraduationCap, Users2, CalendarRange, Layers } from "lucide-react";
import adminApi from "../adminApi";
import ConfirmDialog from "../ConfirmDialog";
import SectionCard from "./SectionCard";
import { CatalogViewRow, CatalogEditRow, CurrentBadge, CurrentSelector, ArchivedBadge } from "./CatalogListRow";

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
  // Active vs Archived view within the current tab. Reset to Active on tab switch.
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => { setShowArchived(false); }, [activeSection]);

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

  // Reactivation for each catalog type — restores an archived entry to active.
  const handleReactivate = (type, id) =>
    runCatalogAction(() => adminApi.patch(`/admin/settings/catalog/${type}/${id}/reactivate`), "Unable to reactivate.");

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

  const TYPE_PATH = { course: "courses", section: "sections", school_year: "school-years", semester: "semesters" };
  const handlePermanentDelete = (type, id) =>
    runCatalogAction(() => adminApi.delete(`/admin/settings/catalog/${TYPE_PATH[type]}/${id}/permanent`), "Unable to permanently delete.");

  const doConfirmedDelete = async () => {
    const { type, id, permanent } = confirmDelete;
    setConfirmDelete(null);
    if (permanent) return handlePermanentDelete(type, id);
    if (type === "course") await handleCourseDelete(id);
    if (type === "section") await handleSectionDelete(id);
    if (type === "school_year") await handleSchoolYearDelete(id);
    if (type === "semester") await handleSemesterDelete(id);
  };

  const visibleSections = (catalog.sections || []).filter(
    (s) => !sectionCourseFilter || String(s.course_id) === sectionCourseFilter
  );
  // Selection dropdowns offer active entries only; archived ones remain visible in
  // the lists below (greyed, with an Unarchive action) but can't be newly assigned.
  const activeCourses = (catalog.courses || []).filter((c) => c.status !== "inactive");
  const activeSchoolYears = (catalog.school_years || []).filter((sy) => sy.status !== "inactive");
  const activeSemesters = (catalog.semesters || []).filter((s) => s.status !== "inactive");
  const archivedCourses = (catalog.courses || []).filter((c) => c.status === "inactive");
  const archivedSchoolYears = (catalog.school_years || []).filter((sy) => sy.status === "inactive");
  const archivedSemesters = (catalog.semesters || []).filter((s) => s.status === "inactive");
  const activeVisibleSections = visibleSections.filter((s) => s.status !== "inactive");
  const archivedVisibleSections = visibleSections.filter((s) => s.status === "inactive");

  // Active/Archived segmented control shown at the top of each catalog tab.
  const ViewToggle = ({ archivedCount }) => (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-wine-800 overflow-hidden mb-3 text-xs font-medium">
      {[["active", "Active"], ["archived", `Archived${archivedCount ? ` (${archivedCount})` : ""}`]].map(([key, txt]) => {
        const on = (key === "archived") === showArchived;
        return (
          <button key={key} type="button" onClick={() => setShowArchived(key === "archived")}
            className={`px-3 py-1.5 transition ${on ? "bg-pink-600 text-white" : "bg-white dark:bg-wine-900 text-gray-500 dark:text-gray-400 hover:bg-pink-50 dark:hover:bg-pink-950/40"}`}>
            {txt}
          </button>
        );
      })}
    </div>
  );

  const emptyArchived = <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">Nothing archived here.</p>;

  return (
    <>
      {activeSection === "courses" && (
        <SectionCard icon={<GraduationCap size={16} />} title="Courses" hint="Course codes and names available for student accounts.">
          <ViewToggle archivedCount={archivedCourses.length} />
          {!showArchived && !editingCourseId && (
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
            {(showArchived ? archivedCourses : activeCourses).length === 0 && (
              showArchived ? emptyArchived : <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No courses yet — add your first course above.</p>
            )}
            {(showArchived ? archivedCourses : activeCourses).map((course) => (
              editingCourseId === course.id ? (
                <CatalogEditRow key={course.id} className="flex-wrap" onSubmit={handleCourseSubmit} onCancel={cancelCourseEdit} entityLabel="course">
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
                </CatalogEditRow>
              ) : (
                <CatalogViewRow key={course.id} entityLabel="course"
                  archived={course.status === "inactive"}
                  onReactivate={() => handleReactivate("courses", course.id)}
                  onEdit={() => { setEditingCourseId(course.id); setCourseForm({ code: course.code || "", name: course.name === course.code ? "" : (course.name || "") }); }}
                  onDelete={() => setConfirmDelete(showArchived
                    ? { type: "course", id: course.id, permanent: true, label: `Permanently delete ${course.code || course.name} and its sections? This cannot be undone, and only works if nothing references it.` }
                    : { type: "course", id: course.id, label: `Delete ${course.code || course.name} and its sections? It will be archived (hidden from new assignments); existing records keep it.` })}
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex items-center gap-2">
                    <span><span className="font-medium">{course.code}</span>
                    {course.name && course.name !== course.code && (
                      <span className="text-gray-400 dark:text-gray-500 font-normal"> — {course.name}</span>
                    )}</span>
                    {course.status === "inactive" && <ArchivedBadge />}
                  </span>
                </CatalogViewRow>
              )
            ))}
          </div>
        </SectionCard>
      )}

      {activeSection === "sections" && (
        <SectionCard icon={<Users2 size={16} />} title="Sections" hint="Class sections grouped under a course.">
          <ViewToggle archivedCount={archivedVisibleSections.length} />
          {!showArchived && !editingSectionId && (
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
                {activeCourses.map((course) => (
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
              {(showArchived ? archivedVisibleSections : activeVisibleSections).length} section{(showArchived ? archivedVisibleSections : activeVisibleSections).length === 1 ? "" : "s"}
            </p>
            <select
              value={sectionCourseFilter}
              onChange={(e) => setSectionCourseFilter(e.target.value)}
              className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
            >
              <option value="">All courses</option>
              {activeCourses.map((course) => (
                <option key={course.id} value={course.id}>{course.code || course.name}</option>
              ))}
            </select>
          </div>
          <div className="mt-2 space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {(showArchived ? archivedVisibleSections : activeVisibleSections).length === 0 && (
              showArchived ? emptyArchived : (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
                {sectionCourseFilter ? "No sections under this course yet." : "No sections yet — add one and assign it to a course."}
              </p>
              )
            )}
            {(showArchived ? archivedVisibleSections : activeVisibleSections).map((section) => {
              const course = (catalog.courses || []).find((item) => item.id === section.course_id);
              if (editingSectionId === section.id) {
                return (
                  <CatalogEditRow key={section.id} dense onSubmit={handleSectionSubmit} onCancel={cancelSectionEdit} entityLabel="section">
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
                      {activeCourses.map((c) => (
                        <option key={c.id} value={c.id}>{c.code || c.name}</option>
                      ))}
                    </select>
                  </CatalogEditRow>
                );
              }
              return (
                <CatalogViewRow key={section.id} dense entityLabel="section"
                  archived={section.status === "inactive"}
                  onReactivate={() => handleReactivate("sections", section.id)}
                  onEdit={() => { setEditingSectionId(section.id); setSectionForm({ name: section.name, course_id: String(section.course_id) }); }}
                  onDelete={() => setConfirmDelete(showArchived
                    ? { type: "section", id: section.id, permanent: true, label: `Permanently delete section ${section.name}? This cannot be undone, and only works if nothing references it.` }
                    : { type: "section", id: section.id, label: `Delete section ${section.name}? It will be archived (hidden from new assignments); existing records keep it.` })}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">{section.name}</p>
                    {section.status === "inactive" && <ArchivedBadge />}
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-wine-800 text-slate-500 dark:text-gray-400 shrink-0">
                      {course ? (course.code || course.name) : "Unassigned"}
                    </span>
                    {course?.name && course.name !== course.code && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate" title={course.name}>{course.name}</span>
                    )}
                  </div>
                </CatalogViewRow>
              );
            })}
          </div>
        </SectionCard>
      )}

      {activeSection === "school_years" && (
        <SectionCard icon={<CalendarRange size={16} />} title="School Years" hint="School years available for CSV student roster import.">
          <ViewToggle archivedCount={archivedSchoolYears.length} />
          {!showArchived && !editingSchoolYearId && (
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
          {!showArchived && (
            <CurrentSelector
              label="Current school year (used for CSV imports)"
              value={settings?.current_school_year_id}
              onChange={(value) => onSettingsChange("current_school_year_id", value)}
              options={activeSchoolYears}
            />
          )}
          <div className="mt-3 space-y-1.5">
            {(showArchived ? archivedSchoolYears : activeSchoolYears).length === 0 && (
              showArchived ? emptyArchived : <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No school years yet — add your first school year above.</p>
            )}
            {(showArchived ? archivedSchoolYears : activeSchoolYears).map((schoolYear) => (
              editingSchoolYearId === schoolYear.id ? (
                <CatalogEditRow key={schoolYear.id} alignStart onSubmit={handleSchoolYearSubmit} onCancel={cancelSchoolYearEdit} entityLabel="school year">
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
                </CatalogEditRow>
              ) : (
                <CatalogViewRow key={schoolYear.id} entityLabel="school year"
                  archived={schoolYear.status === "inactive"}
                  onReactivate={() => handleReactivate("school-years", schoolYear.id)}
                  onEdit={() => { setEditingSchoolYearId(schoolYear.id); setSchoolYearForm({ name: schoolYear.name || "" }); }}
                  onDelete={() => setConfirmDelete(showArchived
                    ? { type: "school_year", id: schoolYear.id, permanent: true, label: `Permanently delete school year ${schoolYear.name}? This cannot be undone, and only works if nothing references it.` }
                    : { type: "school_year", id: schoolYear.id, label: `Delete school year ${schoolYear.name}? It will be archived; existing records keep it. (The current school year can't be deleted.)` })}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {schoolYear.name}
                    {String(schoolYear.id) === String(settings?.current_school_year_id) && <CurrentBadge />}
                    {schoolYear.status === "inactive" && <ArchivedBadge />}
                  </span>
                </CatalogViewRow>
              )
            ))}
          </div>
        </SectionCard>
      )}

      {activeSection === "semesters" && (
        <SectionCard icon={<Layers size={16} />} title="Semesters" hint="Semesters available for CSV student roster import.">
          <ViewToggle archivedCount={archivedSemesters.length} />
          {!showArchived && !editingSemesterId && (
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
          {!showArchived && (
            <CurrentSelector
              label="Current semester (used for CSV imports)"
              value={settings?.current_semester_id}
              onChange={(value) => onSettingsChange("current_semester_id", value)}
              options={activeSemesters}
            />
          )}
          <div className="mt-3 space-y-1.5">
            {(showArchived ? archivedSemesters : activeSemesters).length === 0 && (
              showArchived ? emptyArchived : <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No semesters yet — add your first semester above.</p>
            )}
            {(showArchived ? archivedSemesters : activeSemesters).map((semester) => (
              editingSemesterId === semester.id ? (
                <CatalogEditRow key={semester.id} onSubmit={handleSemesterSubmit} onCancel={cancelSemesterEdit} entityLabel="semester">
                  <input
                    autoFocus
                    value={semesterForm.name}
                    onChange={(e) => setSemesterForm({ name: e.target.value })}
                    placeholder="Semester"
                    className="flex-1 min-w-0 border border-slate-200 dark:border-wine-800 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                  />
                </CatalogEditRow>
              ) : (
                <CatalogViewRow key={semester.id} entityLabel="semester"
                  archived={semester.status === "inactive"}
                  onReactivate={() => handleReactivate("semesters", semester.id)}
                  onEdit={() => { setEditingSemesterId(semester.id); setSemesterForm({ name: semester.name || "" }); }}
                  onDelete={() => setConfirmDelete(showArchived
                    ? { type: "semester", id: semester.id, permanent: true, label: `Permanently delete semester ${semester.name}? This cannot be undone, and only works if nothing references it.` }
                    : { type: "semester", id: semester.id, label: `Delete semester ${semester.name}? It will be archived; existing records keep it. (The current semester can't be deleted.)` })}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {semester.name}
                    {String(semester.id) === String(settings?.current_semester_id) && <CurrentBadge />}
                    {semester.status === "inactive" && <ArchivedBadge />}
                  </span>
                </CatalogViewRow>
              )
            ))}
          </div>
        </SectionCard>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.permanent ? "Permanently delete" : "Archive from catalog"}
          message={confirmDelete.label}
          confirmLabel={confirmDelete.permanent ? "Delete permanently" : "Archive"}
          onConfirm={doConfirmedDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
