import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

const TONES = {
  success: { Icon: CheckCircle2, iconClass: "text-green-500", barClass: "bg-green-500" },
  error: { Icon: AlertTriangle, iconClass: "text-red-500", barClass: "bg-red-500" },
  info: { Icon: Info, iconClass: "text-pink-500 dark:text-pink-400", barClass: "bg-pink-500" },
};

export default function Toast({ message, tone = "success", onDismiss, duration = 3500 }) {
  useEffect(() => {
    if (!duration || !onDismiss) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const { Icon, iconClass, barClass } = TONES[tone] ?? TONES.success;

  return (
    <div className="fixed bottom-5 right-5 z-[60] animate-toast-in max-w-sm">
      <div className="relative flex items-center gap-3 bg-white dark:bg-wine-900 border border-slate-200 dark:border-wine-800 shadow-xl shadow-slate-300/40 dark:shadow-black/40 rounded-2xl pl-4 pr-2 py-3 overflow-hidden">
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${barClass}`} />
        <Icon size={18} className={`${iconClass} shrink-0`} />
        <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{message}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="p-1.5 rounded-lg text-gray-300 dark:text-wine-700 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-wine-800 transition shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
