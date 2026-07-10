import { Upload, X, CheckCircle2, AlertTriangle } from "lucide-react";
import ConfirmDialog from "../ConfirmDialog";
import Modal from "../../ui/Modal";

// Renders the preview / importing / done modals for the CSV/XLSX roster import flow.
// `csv` is the object returned by useCsvImport().
export default function CsvImportModal({ csv }) {
  const {
    csvState, csvRows, csvResult,
    importRole, setImportRole,
    resetCsv, finishImport, removeCsvRow,
    showDuplicateNotice, setShowDuplicateNotice, removeDuplicateRows,
    confirmCsvImport, isImportRowValid, isDuplicateRow,
    invalidCsvRowCount, duplicateCsvRowCount,
  } = csv;

  return (
    <>
      {csvState === "preview" && (
        <Modal
          onClose={resetCsv}
          size="2xl"
          title="Import Preview"
          subtitle={`${csvRows.length} row${csvRows.length === 1 ? "" : "s"} detected — review before importing.`}
          icon={<Upload size={17} />}
          footer={
            <div className="flex gap-3">
              <button onClick={resetCsv} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
              <button onClick={confirmCsvImport} disabled={(importRole === "student" && invalidCsvRowCount > 0) || duplicateCsvRowCount > 0 || csvRows.length === 0}
                className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none hover:from-pink-700 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition">
                Import {csvRows.length} rows
              </button>
            </div>
          }
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Import these as:</span>
            <div className="inline-flex rounded-xl border border-pink-200 dark:border-pink-900 overflow-hidden">
              {["student", "faculty", "staff"].map((r) => (
                <button key={r} type="button" onClick={() => setImportRole(r)}
                  className={`px-3 py-1 text-xs font-medium capitalize transition ${importRole === r ? "bg-pink-600 text-white" : "bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {duplicateCsvRowCount > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">
              {duplicateCsvRowCount} row(s) below use a student number that already exists in the system (highlighted in orange). Remove them (✕) before importing — existing accounts are never overwritten by an import.
            </p>
          )}
          {importRole === "student" && invalidCsvRowCount > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">
              {invalidCsvRowCount} row(s) below reference a course or section that isn't registered in the system (highlighted in red). The import will be rejected until these are fixed.
            </p>
          )}
          {importRole !== "student" && (
            <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-wine-800/40 border border-gray-200 dark:border-wine-700 rounded-xl px-3 py-2 mb-3">
              Course/Section are ignored for {importRole} imports.
            </p>
          )}
          <div className="overflow-auto max-h-[45vh] border border-pink-100 dark:border-pink-900/60 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-pink-50 dark:bg-pink-950/40 sticky top-0">
                <tr>{["Student No.", "Name", "Birth Date", "Course Code", "Section Name", "School Year", "Semester", "Enrollment", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 50).map((r, i) => {
                  const duplicate = isDuplicateRow(r);
                  const invalid = !duplicate && importRole === "student" && !isImportRowValid(r);
                  return (
                    <tr key={i} className={`border-b border-pink-50 dark:border-wine-800 text-gray-700 dark:text-gray-300 ${duplicate ? "bg-orange-50 dark:bg-orange-950/30" : invalid ? "bg-red-50 dark:bg-red-950/30" : ""}`}>
                      <td className={`px-3 py-1.5 font-mono ${duplicate ? "text-orange-700 dark:text-orange-400 font-semibold" : ""}`}>{r.student_number}</td>
                      <td className="px-3 py-1.5">{r.full_name}</td>
                      <td className="px-3 py-1.5">{r.birth_date}</td>
                      <td className={`px-3 py-1.5 ${invalid ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>{r.course_code}</td>
                      <td className={`px-3 py-1.5 ${invalid ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>{r.section_name}</td>
                      <td className="px-3 py-1.5">{r.school_year}</td>
                      <td className="px-3 py-1.5">{r.semester}</td>
                      <td className="px-3 py-1.5">{r.enrollment_status}</td>
                      <td className="px-3 py-1.5">
                        <button type="button" onClick={() => removeCsvRow(i)} aria-label="Remove row"
                          className="p-1 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition">
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {csvState === "importing" && (
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
                <Upload size={18} className="text-pink-600 dark:text-pink-400" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Importing users…</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">This won't take long.</p>
            </div>
          </div>
        </Modal>
      )}

      {csvState === "done" && csvResult && (
        <Modal size="md" onClose={finishImport} showClose={false}>
          <div className="text-center flex flex-col max-h-full">
            {csvResult.rejected ? (
              <>
                <div className="flex justify-center mb-3">
                  <span className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/60 flex items-center justify-center animate-pop-in">
                    <AlertTriangle size={26} className="text-red-500" strokeWidth={1.8} />
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Import Rejected</p>
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{csvResult.message}</p>
                <div className="overflow-auto max-h-[35vh] text-left border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70">
                  {csvResult.invalid_rows.map((r, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <span className="font-mono text-gray-500 dark:text-gray-400">Row {r.row}</span>
                      {r.student_number && <span className="text-gray-500 dark:text-gray-400"> ({r.student_number})</span>}
                      <span className="block text-red-700 dark:text-red-300">{r.reason}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-3">
                  <span className={`w-14 h-14 rounded-full border flex items-center justify-center animate-pop-in ${
                    csvResult.failed === 0 ? "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/60" : "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/60"
                  }`}>
                    {csvResult.failed === 0
                      ? <CheckCircle2 size={26} className="text-green-600 dark:text-green-400" strokeWidth={1.8} />
                      : <AlertTriangle size={26} className="text-orange-500 dark:text-orange-400" strokeWidth={1.8} />}
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Import Complete</p>
                <p className="text-sm text-green-700 dark:text-green-300">{csvResult.success} rows imported successfully.</p>
                {csvResult.failed > 0 && <p className="text-sm text-red-600 dark:text-red-400">{csvResult.failed} rows failed.</p>}
                {csvResult.message && <p className="text-sm text-red-600 dark:text-red-400">{csvResult.message}</p>}
                {csvResult.duplicate_rows?.length > 0 && (
                  <div className="mt-3 overflow-auto max-h-[25vh] text-left border border-orange-100 dark:border-orange-900/60 rounded-xl divide-y divide-orange-50 dark:divide-wine-800/70">
                    {csvResult.duplicate_rows.map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <span className="font-mono text-gray-500 dark:text-gray-400">Row {r.row}</span>
                        {r.student_number && <span className="text-gray-500 dark:text-gray-400"> ({r.student_number})</span>}
                        <span className="block text-orange-700 dark:text-orange-400">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <button onClick={finishImport}
              className="mt-5 w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none shrink-0 transition">
              Done
            </button>
          </div>
        </Modal>
      )}

      {csvState === "preview" && showDuplicateNotice && (
        <ConfirmDialog
          title="Duplicate student numbers found"
          message={`${duplicateCsvRowCount} student number(s) in this file already exist in the system and cannot be imported. Click OK to remove them from this import, or Cancel to review the file yourself.`}
          confirmLabel="OK"
          danger={false}
          onConfirm={removeDuplicateRows}
          onCancel={() => setShowDuplicateNotice(false)}
        />
      )}
    </>
  );
}
