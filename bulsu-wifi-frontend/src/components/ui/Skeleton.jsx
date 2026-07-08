export function SkeletonRow({ cols = 5 }) {
  return (
    <tr className="border-b border-slate-100 dark:border-wine-800/70">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 bg-slate-200 dark:bg-wine-800 rounded-full animate-pulse" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-4 flex flex-col gap-3">
      <div className="h-3 w-24 bg-slate-200 dark:bg-wine-800 rounded-full animate-pulse" />
      <div className="h-7 w-16 bg-slate-200 dark:bg-wine-800 rounded-full animate-pulse" />
    </div>
  );
}

export function SkeletonBlock({ className = "h-48" }) {
  return (
    <div className={`bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 animate-pulse ${className}`}>
      <div className="p-4 space-y-3">
        <div className="h-3 w-32 bg-slate-200 dark:bg-wine-800 rounded-full" />
        <div className="h-3 w-full bg-slate-200 dark:bg-wine-800 rounded-full" />
        <div className="h-3 w-5/6 bg-slate-200 dark:bg-wine-800 rounded-full" />
        <div className="h-3 w-4/6 bg-slate-200 dark:bg-wine-800 rounded-full" />
      </div>
    </div>
  );
}
