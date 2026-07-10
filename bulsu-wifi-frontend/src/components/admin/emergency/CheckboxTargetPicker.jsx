import { X } from "lucide-react";

// Shared UI for every multi-select target picker (user/guest/section/course): a filter box,
// removable chips for what's selected, and a checkbox list of matches. Keeping this in one place
// means all four pickers behave identically instead of each reimplementing the same pattern.
export default function CheckboxTargetPicker({
  label, filterValue, onFilterChange, placeholder,
  options, getId, getLabel, getSublabel,
  selectedIds, onToggle, chips, onRemoveChip,
  showSelectAll, allVisibleSelected, onToggleAll,
  emptyText, requireFilter, totalCount,
}) {
  const selectedCount = chips ? chips.length : selectedIds.length;
  const isTruncated = typeof totalCount === "number" && totalCount > options.length;
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
        {label} {selectedCount > 0 && <span className="text-gray-400 dark:text-gray-500 font-normal">({selectedCount} selected)</span>}
      </label>
      <input value={filterValue}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />

      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {chips.map((c) => (
            <span key={getId(c)} className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-full pl-2.5 pr-1 py-0.5 text-xs">
              {getLabel(c)}
              <button type="button" onClick={() => onRemoveChip(c)}
                aria-label={`Remove ${getLabel(c)}`}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-100 transition">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {showSelectAll && (
        <label className="flex items-center gap-2 px-1 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={allVisibleSelected} onChange={onToggleAll} className="accent-red-600" />
          Select all {filterValue ? "matching " : ""}({options.length}{isTruncated ? " shown" : ""})
        </label>
      )}

      {(!requireFilter || filterValue.trim()) && (
        <div className="mt-2 border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70 max-h-40 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">{emptyText}</p>
          ) : options.map((opt) => (
            <label key={getId(opt)} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer">
              <input type="checkbox"
                checked={selectedIds.includes(getId(opt))}
                onChange={() => onToggle(opt)}
                className="accent-red-600" />
              <span className="text-gray-800 dark:text-gray-100">{getLabel(opt)}</span>
              {getSublabel && <span className="text-gray-400 dark:text-gray-500">({getSublabel(opt)})</span>}
            </label>
          ))}
        </div>
      )}
      {isTruncated && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
          Showing {options.length} of {totalCount} — refine your search to narrow this down.
        </p>
      )}
    </div>
  );
}
