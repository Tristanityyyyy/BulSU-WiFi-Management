export default function SectionCard({ icon, title, hint, children }) {
  return (
    <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-5 h-full">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/60 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="pt-0.5">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">{title}</p>
          {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
