import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import * as usersApi from "./usersApi";
import Modal from "../../ui/Modal";

const USER_ROLES = ["student", "faculty", "staff"];

// Student numbers and faculty/staff IDs are both exactly 10 digits.
const ACCOUNT_NUMBER_LENGTH = 10;

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
    birthdate: user?.birth_date ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isStudentRole = form.role === "student";
  // The user is still on the auto-generated password until they log in and set their own
  // (or an admin resets it, which puts them back on a generated one). Only while that's
  // true does editing the name/birthdate change what they log in with.
  const onDefaultPassword = !isAdminAccount && (!user || Boolean(user.must_change_password));
  const accountNumberIncomplete =
    form.student_number.length > 0 && form.student_number.length !== ACCOUNT_NUMBER_LENGTH;
  // Only active catalog entries can be assigned; archived ones are hidden here
  // (they still resolve for display elsewhere via the full catalog).
  const activeCourses = (courses || []).filter((course) => course.status !== "inactive");
  const sectionOptions = (sections || []).filter(
    (section) => String(section.course_id) === String(form.course_id) && section.status !== "inactive"
  );

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
  // directly now, no more parsing a free-text "Last, First Middle" string. Mirrors
  // derivePassword() on the server, so the preview matches what actually gets saved.
  const derivedPassword = (() => {
    if (!onDefaultPassword) return null;
    const lastName = form.last_name.trim();
    if (!lastName || !form.birthdate) return null;
    const [yyyy, mm, dd] = form.birthdate.split("-");
    return `${lastName}${yyyy}${mm}${dd}`;
  })();
  // What the saved account currently derives to. Editing the birthdate (or the last name,
  // the formula's other input) moves the derived password; leaving both alone re-derives
  // the exact same string, so there'd be nothing to announce.
  const storedPassword = (() => {
    if (!user || !onDefaultPassword || !user.birth_date) return null;
    const lastName = (user.full_name || "").split(",")[0].trim();
    return lastName ? `${lastName}${user.birth_date.replace(/-/g, "")}` : null;
  })();
  const passwordWillChange = Boolean(user && derivedPassword && derivedPassword !== storedPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user && form.student_number.length !== ACCOUNT_NUMBER_LENGTH) {
      setError(`Student number / ID must be exactly ${ACCOUNT_NUMBER_LENGTH} digits.`);
      return;
    }
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
        const res = await usersApi.updateUser(user.id, payload);
        onSaved(
          res.data?.password && passwordWillChange
            ? `User updated. Their password is now ${res.data.password} — share it with them so they can still log in.`
            : undefined
        );
        return;
      }
      await usersApi.createUser({ ...payload, password: derivedPassword });
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
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Student Number / ID</label>
            {/* Non-digits are dropped as they're typed and the value is capped at 10, so the
                only invalid state left to warn about is a number that's still too short. */}
            <input type="text" inputMode="numeric" autoComplete="off"
              value={form.student_number}
              onChange={(e) => setForm({ ...form, student_number: e.target.value.replace(/\D/g, "").slice(0, ACCOUNT_NUMBER_LENGTH) })}
              maxLength={ACCOUNT_NUMBER_LENGTH}
              placeholder={`${ACCOUNT_NUMBER_LENGTH} digits`}
              readOnly={!!user}
              className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                accountNumberIncomplete
                  ? "border-red-300 dark:border-red-800 focus:ring-red-400"
                  : "border-pink-200 dark:border-pink-900 focus:ring-pink-400"
              } read-only:bg-gray-100 dark:read-only:bg-wine-800 read-only:text-gray-500 dark:read-only:text-gray-400 read-only:cursor-not-allowed`} required />
            {user ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">The student number / ID can't be changed after the account is created.</p>
            ) : accountNumberIncomplete ? (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Student number / ID must be exactly {ACCOUNT_NUMBER_LENGTH} digits — you've entered {form.student_number.length}.
              </p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Exactly {ACCOUNT_NUMBER_LENGTH} digits, for students, faculty and staff alike.</p>
            )}
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
                  {activeCourses.map((course) => (
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
                  </select>
                </div>
              )}
            </>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Birthdate</label>
            <input type="date" value={form.birthdate} onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
              max={new Date().toISOString().split("T")[0]} required
              className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            {derivedPassword && (
              <div className="mt-2 bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                  {user ? (passwordWillChange ? "Password will change to" : "Current generated password") : "Generated password"}
                </p>
                <p className="text-sm font-mono font-semibold text-pink-700 dark:text-pink-300">{derivedPassword}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {passwordWillChange
                    ? "This user hasn't set their own password yet, so it's still derived from their name and birthdate — saving will update it. Share the new one with them."
                    : "Share this with the user so they can log in."}
                </p>
              </div>
            )}
            {user && !onDefaultPassword && !isAdminAccount && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                This user has already set their own password, so editing the birthdate won't change it.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
            <button type="submit" disabled={saving || (!user && (!derivedPassword || form.student_number.length !== ACCOUNT_NUMBER_LENGTH))}
              className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-60 disabled:shadow-none transition">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
    </Modal>
  );
}
