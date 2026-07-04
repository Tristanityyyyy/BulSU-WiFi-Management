export default function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-1 ${accent ? "border-l-4 border-l-pink-500" : ""}`}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value ?? "—"}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
