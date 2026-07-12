import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import * as usersApi from "./usersApi";
import Modal from "../../ui/Modal";

const USER_ROLES = ["student", "faculty", "staff"];

const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" }, { value: "03", label: "March" },
  { value: "04", label: "April" }, { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" }, { value: "09", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

// Newest-year-first, spanning students through older faculty/staff.
const BIRTH_YEARS = Array.from({ length: 101 }, (_, i) => String(new Date().getFullYear() - i));

// Leap-year-aware day count for a given year/month (both as zero-padded strings, or "").
function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

// Best-effort split of a stored "Last, First Middle" string back into the three
// fields — only used to seed Edit mode, since older records were free-typed and
// the First/Middle boundary is inherently ambiguous (e.g. a two-word first name).
function parseFullName(fullName) {
  const [lastPart, ...rest] = (fullName || "").split(",");
  const last_name = (lastPart || "").trim();
  const words = rest.join(",").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { last_name, first_name: "", middle_initial: "" };
  if (words.length === 1) return { last_name, first_name: words[0], middle_initial: "" };
  const middle_initial = `${words[words.length - 1][0].toUpperCase()}.`;
  const first_name = words.slice(0, -1).join(" ");
  return { last_name, first_name, middle_initial };
}

export default function UserFormModal({ user, courses, sections, onClose, onSaved, onError }) {
  const isAdminAccount = user?.role === "admin";
  const [form, setForm] = useState(() => ({
    student_number: user?.student_number ?? "",
    ...parseFullName(user?.full_name),
    role: USER_ROLES.includes(user?.role) ? user.role : "",
    course_id: user?.course_id ?? "",
    section_id: user?.section_id ?? "",
    enrollment_status: user?.enrollment_status ?? "enrolled",
    birthdate: "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isStudentRole = form.role === "student";
  const sectionOptions = (sections || []).filter((section) => String(section.course_id) === String(form.course_id));

  const [birthYear, birthMonth, birthDay] = form.birthdate ? form.birthdate.split("-") : ["", "", ""];
  const maxDay = daysInMonth(birthYear, birthMonth);

  // Combines the three pieces into one "YYYY-MM-DD" string (form.birthdate stays the single
  // source of truth everywhere else — derivedPassword, the submit payload, etc.), clamping the
  // day down if switching month/year makes the previously-picked day impossible (e.g. 31 -> Feb).
  const updateBirthdate = (year, month, day) => {
    const clampedDay = day && Number(day) > daysInMonth(year, month) ? String(daysInMonth(year, month)).padStart(2, "0") : day;
    setForm((prev) => ({ ...prev, birthdate: year && month && clampedDay ? `${year}-${month}-${clampedDay}` : "" }));
  };

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

  // Derive password: LastName + YYYY + MM + DD — reads the Last Name field
  // directly now, no more parsing a free-text "Last, First Middle" string.
  const derivedPassword = (() => {
    if (user) return null; // edit mode — no password change
    const lastName = form.last_name.trim();
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
      const { last_name, first_name, middle_initial, ...rest } = form;
      const full_name = `${last_name.trim()}, ${first_name.trim()}${middle_initial.trim() ? ` ${middle_initial.trim()}` : ""}`;
      const payload = {
        ...rest,
        full_name,
        course_id: form.course_id ? Number(form.course_id) : null,
        section_id: form.section_id ? Number(form.section_id) : null,
      };
      if (isAdminAccount) delete payload.role;
      if (user) {
        await usersApi.updateUser(user.id, payload);
      } else {
        await usersApi.createUser({ ...payload, password: derivedPassword });
      }
      onSaved();
    } catch (err) {
      const message = err.response?.data?.message || "Save failed.";
      setError(message);
      onError?.(message);
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
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Last Name</label>
            <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              placeholder="e.g. Dela Cruz"
              className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">First Name</label>
              <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="e.g. Juan"
                className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" required />
            </div>
            <div className="w-20 shrink-0">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">M.I.</label>
              <input type="text" value={form.middle_initial} onChange={(e) => setForm({ ...form, middle_initial: e.target.value })}
                placeholder="M."
                className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            </div>
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
              <div className="flex gap-2">
                <select value={birthYear} onChange={(e) => updateBirthdate(e.target.value, birthMonth, birthDay)} required
                  className="flex-1 min-w-0 border border-pink-200 dark:border-pink-900 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
                  <option value="" disabled>Year</option>
                  {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={birthMonth} onChange={(e) => updateBirthdate(birthYear, e.target.value, birthDay)} required
                  className="flex-1 min-w-0 border border-pink-200 dark:border-pink-900 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
                  <option value="" disabled>Month</option>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={birthDay} onChange={(e) => updateBirthdate(birthYear, birthMonth, e.target.value)} required
                  className="w-20 shrink-0 border border-pink-200 dark:border-pink-900 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
                  <option value="" disabled>Day</option>
                  {Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
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
