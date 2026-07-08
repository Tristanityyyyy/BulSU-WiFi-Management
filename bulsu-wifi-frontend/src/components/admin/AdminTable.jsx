import { Inbox, ChevronUp, ChevronDown } from "lucide-react";
import LoadingSpinner from "../ui/LoadingSpinner";

export default function AdminTable({ columns, rows, loading, emptyText = "No records found.", emptyHint, page, totalPages, onPage, colWidths, sortKey, sortDir, onSort }) {
  return (
    <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={colWidths ? { tableLayout: "fixed" } : undefined}>
          {colWidths && (
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
            </colgroup>
          )}
          <thead>
            <tr className="bg-slate-50/70 dark:bg-wine-900/70 border-b border-slate-200 dark:border-wine-800">
              {columns.map((col) => {
                const isSortable = typeof col === "object" && col !== null;
                const key = isSortable ? col.key : col;
                const label = isSortable ? col.label : col;
                const active = isSortable && sortKey === key;
                return (
                  <th key={key} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 whitespace-nowrap">
                    {isSortable ? (
                      <button type="button" onClick={() => onSort?.(key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide transition ${active ? "text-pink-600 dark:text-pink-400" : "hover:text-slate-600 dark:hover:text-gray-200"}`}>
                        {label}
                        {active ? (
                          sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ChevronDown size={12} className="opacity-30" />
                        )}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex justify-center">
                    <LoadingSpinner size={32} className="text-pink-400" />
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox size={32} strokeWidth={1.5} className="text-slate-300 dark:text-wine-700" />
                    <p className="text-sm text-slate-500 dark:text-gray-400">{emptyText}</p>
                    {emptyHint && <p className="text-xs text-slate-400 dark:text-gray-500">{emptyHint}</p>}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-wine-800/70 hover:bg-pink-50/40 dark:hover:bg-wine-800/40 transition-colors">
                  {row}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-wine-800/70">
          <p className="text-xs text-slate-400 dark:text-gray-500 tabular-nums">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-wine-800 text-xs font-medium text-slate-600 dark:text-gray-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-wine-800/40 hover:border-slate-300 dark:hover:border-wine-700 transition"
            >
              Previous
            </button>
            <button
              onClick={() => onPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-wine-800 text-xs font-medium text-slate-600 dark:text-gray-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-wine-800/40 hover:border-slate-300 dark:hover:border-wine-700 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
