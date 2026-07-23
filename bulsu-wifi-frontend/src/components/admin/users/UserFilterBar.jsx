const selectClass = "border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400";

// Search + role/course/section filters, shared by the active and trash user views.
// Pass onStatusChange/onEnrollmentChange to also show those selects (active view only).
export default function UserFilterBar({
  search, onSearchChange,
  role, onRoleChange,
  status, onStatusChange,
  enrollment, onEnrollmentChange,
  course, onCourseChange,
  section, onSectionChange,
  catalog,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search student no., name…"
        className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white dark:bg-wine-900 min-w-[200px]"
      />
      <select value={role} onChange={(e) => onRoleChange(e.target.value)} className={selectClass}>
        <option value="">All Roles</option>
        <option value="student">Student</option>
        <option value="faculty">Faculty</option>
        <option value="staff">Staff</option>
      </select>
      {onStatusChange && (
        <select value={status} onChange={(e) => onStatusChange(e.target.value)} className={selectClass}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
      )}
      {onEnrollmentChange && (
        <select value={enrollment} onChange={(e) => onEnrollmentChange(e.target.value)} className={selectClass}>
          <option value="">All Enrollment</option>
          <option value="enrolled">Enrolled</option>
          <option value="dropped">Dropped</option>
          <option value="loa">LOA</option>
          <option value="graduated">Graduated</option>
        </select>
      )}
      <select value={course} onChange={(e) => onCourseChange(e.target.value)} className={selectClass}>
        <option value="">All Courses</option>
        {(catalog.courses || []).filter((c) => c.status !== "inactive").map((c) => (
          <option key={c.id} value={c.id}>{c.code || c.name}</option>
        ))}
      </select>
      <select value={section} onChange={(e) => onSectionChange(e.target.value)} disabled={!course}
        className={`${selectClass} disabled:bg-gray-100 dark:disabled:bg-wine-800 disabled:cursor-not-allowed`}>
        <option value="">All Sections</option>
        {(catalog.sections || []).filter((s) => String(s.course_id) === String(course) && s.status !== "inactive").map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
