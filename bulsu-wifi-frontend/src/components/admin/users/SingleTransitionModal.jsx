import { useEffect, useRef, useState } from "react";
import { GraduationCap, PowerOff, CalendarClock, AlertTriangle } from "lucide-react";
import Modal from "../../ui/Modal";
import * as usersApi from "./usersApi";

const TYPES = ["promoted", "retained", "dropped", "loa", "graduated"];
const LOSES_ACCESS = new Set(["dropped", "loa", "graduated"]);
const NEEDS_SECTION = new Set(["promoted", "retained"]); // promoted requires it; retained optional

// Single-student transition — reuses the exact bulk transition endpoints with a
// one-row batch, so it inherits history, term stamping, the term-mismatch
// safeguard, and force-disconnect for the access-losing states.
export default function SingleTransitionModal({ student, catalog, onClose, onDone }) {
  const [transitionType, setTransitionType] = useState("promoted");
  const [courseCode, setCourseCode] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [validation, setValidation] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const validateSeq = useRef(0);

  const row = {
    student_number: student.student_number,
    transition_type: transitionType,
    course_code: courseCode,
    section_name: sectionName,
  };

  // Live validation on every field change — surfaces the target term, the
  // term_warning, and any per-row rejection so Commit only enables when valid.
  useEffect(() => {
    const seq = ++validateSeq.current;
    setValidation(null);
    usersApi.transitionValidate([row])
      .then((res) => { if (seq === validateSeq.current) setValidation(res.data); })
      .catch((err) => { if (seq === validateSeq.current) setError(err.response?.data?.message || "Validation failed."); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionType, courseCode, sectionName]);

  // Only active catalog entries can be a transition target.
  const activeCourses = (catalog.courses || []).filter((c) => c.status !== "inactive");
  const selectedCourse = activeCourses.find((c) => (c.code || "") === courseCode);
  const sectionOptions = (catalog.sections || []).filter((s) => selectedCourse && s.course_id === selectedCourse.id && s.status !== "inactive");

  const invalid = validation?.invalid_rows?.[0];
  const termLabel = validation?.term ? [validation.term.school_year, validation.term.semester].filter(Boolean).join(" · ") : null;
  const canCommit = !committing && validation && validation.valid === 1 && !invalid;

  const handleCommit = async () => {
    setCommitting(true);
    setError("");
    try {
      await usersApi.transitionCommit([row]);
      onDone();
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.invalid_rows?.[0]) {
        setError(err.response.data.invalid_rows[0].reason);
      } else {
        setError(err.response?.data?.message || "Transition failed.");
      }
      setCommitting(false);
    }
  };

  const showSection = NEEDS_SECTION.has(transitionType);

  return (
    <Modal
      onClose={onClose}
      size="md"
      title="Transition Student"
      subtitle={`${student.full_name} · ${student.student_number}`}
      icon={<GraduationCap size={17} />}
      footer={
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
          <button onClick={handleCommit} disabled={!canCommit}
            className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none hover:from-pink-700 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition">
            {committing ? "Committing…" : "Commit Transition"}
          </button>
        </div>
      }
    >
      {termLabel && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3 border bg-pink-50 dark:bg-pink-950/40 border-pink-100 dark:border-pink-900/60">
          <CalendarClock size={15} className="mt-0.5 shrink-0 text-pink-600 dark:text-pink-400" />
          <p className="text-xs text-gray-600 dark:text-gray-300 min-w-0">
            Will be stamped: <span className="font-semibold text-gray-900 dark:text-gray-100">{termLabel}</span>
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Transition</label>
          <select value={transitionType} onChange={(e) => { setTransitionType(e.target.value); setError(""); }}
            className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 capitalize">
            {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>

        {showSection && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                Course {transitionType === "promoted" && <span className="text-pink-600">*</span>}
              </label>
              <select value={courseCode} onChange={(e) => { setCourseCode(e.target.value); setSectionName(""); }}
                className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
                <option value="">{transitionType === "retained" ? "Keep current" : "Select course"}</option>
                {activeCourses.map((c) => <option key={c.id} value={c.code || ""}>{c.code || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                Section {transitionType === "promoted" && <span className="text-pink-600">*</span>}
              </label>
              <select value={sectionName} onChange={(e) => setSectionName(e.target.value)} disabled={!courseCode}
                className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:bg-gray-100 dark:disabled:bg-wine-800 disabled:cursor-not-allowed">
                <option value="">Select section</option>
                {sectionOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {LOSES_ACCESS.has(transitionType) && (
          <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2">
            <PowerOff size={14} className="mt-0.5 shrink-0" />
            <span>This revokes network access — any active Wi-Fi session is disconnected immediately on commit, and the student can no longer log in.</span>
          </p>
        )}

        {invalid && (
          <p className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{invalid.reason}</span>
          </p>
        )}
        {error && (
          <p className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}
