import { GraduationCap, X, CheckCircle2, AlertTriangle, PowerOff, CalendarClock } from "lucide-react";
import Modal from "../../ui/Modal";

const BUCKET_LABELS = {
  promoted: "Promoted",
  retained: "Retained",
  dropped: "Dropped",
  loa: "LOA",
  graduated: "Graduated",
};

// Renders the preview / committing / done modals for the semester-transition
// flow. `t` is the object returned by useEnrollmentTransition().
export default function EnrollmentTransitionModal({ t }) {
  const { state, rows, validation, result, confirmCommit, reset, finish, invalidRowNumbers } = t;
  const invalidCount = validation?.invalid_rows?.length || 0;
  const termLabel = validation?.term
    ? [validation.term.school_year, validation.term.semester].filter(Boolean).join(" · ")
    : null;

  return (
    <>
      {state === "preview" && validation && (
        <Modal
          onClose={reset}
          size="2xl"
          title="Semester Transition Preview"
          subtitle={`${validation.total} row${validation.total === 1 ? "" : "s"} detected — review before committing.`}
          icon={<GraduationCap size={17} />}
          footer={
            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
              <button onClick={confirmCommit} disabled={invalidCount > 0 || validation.valid === 0}
                className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none hover:from-pink-700 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition">
                Commit {validation.valid} student{validation.valid === 1 ? "" : "s"}
              </button>
            </div>
          }
        >
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3 border bg-pink-50 dark:bg-pink-950/40 border-pink-100 dark:border-pink-900/60">
            <CalendarClock size={15} className="mt-0.5 shrink-0 text-pink-600 dark:text-pink-400" />
            <p className="text-xs text-gray-600 dark:text-gray-300 min-w-0">
              Students will be stamped: <span className="font-semibold text-gray-900 dark:text-gray-100">{termLabel || "current term"}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(BUCKET_LABELS).map(([key, label]) => (
              <span key={key} className="text-xs font-medium px-2.5 py-1 rounded-full bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-100 dark:border-pink-900/60">
                {label}: <span className="font-bold">{validation.summary[key] || 0}</span>
              </span>
            ))}
          </div>

          {validation.will_disconnect > 0 && (
            <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2 mb-3">
              <PowerOff size={14} className="mt-0.5 shrink-0" />
              <span>{validation.will_disconnect} student(s) will lose network access (dropped / LOA / graduated). Any active Wi-Fi session they have will be disconnected immediately on commit, and they won't be able to log back in.</span>
            </p>
          )}

          {invalidCount > 0 && (
            <div className="mb-3">
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-2">
                {invalidCount} row(s) failed validation (highlighted in red below). The whole batch is rejected until every row is fixed — nothing is committed partially.
              </p>
              <div className="overflow-auto max-h-[20vh] text-left border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70">
                {validation.invalid_rows.map((r, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <span className="font-mono text-gray-500 dark:text-gray-400">Row {r.row}</span>
                    {r.student_number && <span className="text-gray-500 dark:text-gray-400"> ({r.student_number})</span>}
                    <span className="block text-red-700 dark:text-red-300">{r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-auto max-h-[40vh] border border-pink-100 dark:border-pink-900/60 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-pink-50 dark:bg-pink-950/40 sticky top-0">
                <tr>{["Student No.", "Transition", "Course Code", "Section Name"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => {
                  const invalid = invalidRowNumbers.has(i + 2);
                  return (
                    <tr key={i} className={`border-b border-pink-50 dark:border-wine-800 text-gray-700 dark:text-gray-300 ${invalid ? "bg-red-50 dark:bg-red-950/30" : ""}`}>
                      <td className={`px-3 py-1.5 font-mono ${invalid ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>{r.student_number}</td>
                      <td className="px-3 py-1.5 capitalize">{r.transition_type}</td>
                      <td className="px-3 py-1.5">{r.course_code}</td>
                      <td className="px-3 py-1.5">{r.section_name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {state === "committing" && (
        <Modal showClose={false}>
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 opacity-30 blur-xl animate-pulse" />
              <div
                className="absolute inset-0 rounded-full animate-spin bg-gradient-to-tr from-pink-600 via-rose-400 to-pink-100"
                style={{
                  WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))",
                  maskImage: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))",
                }}
              />
              <div className="relative w-10 h-10 rounded-full bg-white dark:bg-wine-900 flex items-center justify-center shadow-sm">
                <GraduationCap size={18} className="text-pink-600 dark:text-pink-400" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Committing transition…</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Updating records and disconnecting sessions.</p>
            </div>
          </div>
        </Modal>
      )}

      {state === "done" && result && (
        <Modal size="md" onClose={finish} showClose={false}>
          <div className="text-center flex flex-col max-h-full">
            {result.rejected || result.error ? (
              <>
                <div className="flex justify-center mb-3">
                  <span className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/60 flex items-center justify-center animate-pop-in">
                    <AlertTriangle size={26} className="text-red-500" strokeWidth={1.8} />
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Transition Rejected</p>
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{result.message}</p>
                {result.invalid_rows?.length > 0 && (
                  <div className="overflow-auto max-h-[35vh] text-left border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70">
                    {result.invalid_rows.map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <span className="font-mono text-gray-500 dark:text-gray-400">Row {r.row}</span>
                        {r.student_number && <span className="text-gray-500 dark:text-gray-400"> ({r.student_number})</span>}
                        <span className="block text-red-700 dark:text-red-300">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-center mb-3">
                  <span className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/60 flex items-center justify-center animate-pop-in">
                    <CheckCircle2 size={26} className="text-green-600 dark:text-green-400" strokeWidth={1.8} />
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Transition Complete</p>
                <p className="text-sm text-green-700 dark:text-green-300">{result.success} student record(s) updated.</p>
                {result.disconnected > 0 && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">{result.disconnected} active session(s) force-disconnected.</p>
                )}
              </>
            )}
            <button onClick={finish}
              className="mt-5 w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none shrink-0 transition">
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
