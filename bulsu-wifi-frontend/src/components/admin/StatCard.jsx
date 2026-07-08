const TONES = {
  pink: "bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border-pink-100 dark:border-pink-900/60",
  blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/60",
  green: "bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/60",
  amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/60",
};

export default function StatCard({ label, value, sub, icon: Icon, tone = "pink" }) {
  return (
    <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-4 flex items-center gap-3 hover:shadow-md hover:border-slate-300 dark:hover:border-wine-700 transition-all">
      {Icon && (
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${TONES[tone] || TONES.pink}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 dark:text-gray-500 font-semibold uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-gray-100 leading-tight font-display tabular-nums">{value ?? "—"}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-gray-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}
