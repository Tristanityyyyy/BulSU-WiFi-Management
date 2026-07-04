import { Inbox } from "lucide-react";
import LoadingSpinner from "../ui/LoadingSpinner";

export default function AdminTable({ columns, rows, loading, emptyText = "No records found.", emptyHint, page, totalPages, onPage }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-pink-50 border-b border-pink-100">
              {columns.map((col) => (
                <th key={col} className="text-left px-4 py-3 text-xs font-bold text-pink-700 whitespace-nowrap">
                  {col}
                </th>
              ))}
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
                    <Inbox size={32} strokeWidth={1.5} className="text-slate-300" />
                    <p className="text-sm text-slate-500">{emptyText}</p>
                    {emptyHint && <p className="text-xs text-slate-400">{emptyHint}</p>}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-pink-50/40 transition-colors">
                  {row}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded-xl border border-pink-200 text-xs text-slate-600 disabled:opacity-40 hover:bg-pink-50 transition"
            >
              Prev
            </button>
            <button
              onClick={() => onPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded-xl border border-pink-200 text-xs text-slate-600 disabled:opacity-40 hover:bg-pink-50 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
