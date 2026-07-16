import { Pencil, Trash2, X } from "lucide-react";

// Shared "view mode" row for a catalog list item (course/section/school-year/semester):
// label content on the left, edit/delete icon buttons on the right, revealed on hover.
// `entityLabel` (e.g. "course", "school year") drives both button aria-labels.
// `className` is an escape hatch for one-off layout needs a call site has beyond
// `dense` (e.g. `flex-wrap`) so new variants don't require new boolean props here.
export function CatalogViewRow({ dense, onEdit, onDelete, entityLabel, className = "", children }) {
  return (
    <div className={`group flex items-center justify-between rounded-xl px-3 ${dense ? "py-1.5" : "py-2"} border border-slate-100 dark:border-wine-800/70 hover:border-slate-200 dark:hover:border-wine-700 hover:bg-slate-50/60 dark:hover:bg-wine-800/40 transition ${className}`}>
      {children}
      <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
        <button type="button" onClick={onEdit}
          className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition" aria-label={`Edit ${entityLabel}`}>
          <Pencil size={13} />
        </button>
        <button type="button" onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition" aria-label={`Delete ${entityLabel}`}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// Shared "edit mode" row: same slot but wrapped in a form with save/cancel buttons.
// `alignStart` is for rows whose fields wrap onto a second line (school year's "will save as" hint).
// `className` is an escape hatch for one-off layout needs (see CatalogViewRow above).
export function CatalogEditRow({ dense, alignStart, onSubmit, onCancel, entityLabel, className = "", children }) {
  return (
    <form onSubmit={onSubmit}
      className={`flex ${alignStart ? "items-start" : "items-center"} gap-2 rounded-xl px-3 ${dense ? "py-1.5" : "py-2"} border border-pink-300 dark:border-pink-800 bg-pink-50/60 dark:bg-pink-950/30 ring-1 ring-pink-200 dark:ring-pink-900 ${className}`}>
      {children}
      <div className="flex gap-1 shrink-0">
        <button type="submit" className="p-1.5 rounded-lg text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-950/50 transition" aria-label={`Save ${entityLabel}`}>
          <Pencil size={13} />
        </button>
        <button type="button" onClick={onCancel}
          className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-wine-800/40 transition" aria-label="Cancel edit">
          <X size={13} />
        </button>
      </div>
    </form>
  );
}

// "Current" pill shown next to whichever school year / semester is active.
export function CurrentBadge() {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-300 border border-pink-100 dark:border-pink-900 shrink-0">
      Current
    </span>
  );
}

// Shared "current school year / semester" picker used by both of those tabs to set
// which one CSV imports default to.
export function CurrentSelector({ label, value, onChange, options }) {
  return (
    <div className="mt-3">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2">
        {label}
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
        >
          <option value="">Not set</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
