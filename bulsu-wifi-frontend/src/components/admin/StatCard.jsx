const TONES = {
  pink: "bg-pink-50 text-pink-600 border-pink-100",
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  green: "bg-green-50 text-green-600 border-green-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
};

export default function StatCard({ label, value, sub, icon: Icon, tone = "pink" }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex items-center gap-3 hover:shadow-md hover:border-slate-300 transition-all">
      {Icon && (
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${TONES[tone] || TONES.pink}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight font-display tabular-nums">{value ?? "—"}</p>
        {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}
