import { useEffect } from "react";
import { X } from "lucide-react";

const SIZES = {
  xs: "max-w-xs sm:max-w-sm",
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

const TONES = {
  pink: "bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border-pink-100 dark:border-pink-900/60",
  red: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/60",
  green: "bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/60",
  orange: "bg-orange-50 dark:bg-orange-950/30 text-orange-500 dark:text-orange-400 border-orange-100 dark:border-orange-900/60",
  gray: "bg-slate-50 dark:bg-wine-900 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-wine-800",
};

export default function Modal({
  children,
  onClose,
  title,
  subtitle,
  icon,
  tone = "pink",
  size = "xs",
  footer,
  showClose = true,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const hasHeader = Boolean(title || subtitle || icon);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm animate-overlay-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={`relative bg-white dark:bg-wine-900 rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 w-full ${SIZES[size] ?? SIZES.xs} max-h-[88vh] flex flex-col animate-panel-in`}>
        {onClose && showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3.5 right-3.5 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-wine-800 transition z-10"
          >
            <X size={16} />
          </button>
        )}

        {hasHeader && (
          <div className="flex items-start gap-3 px-6 pt-5 pr-12 shrink-0">
            {icon && (
              <span className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${TONES[tone] ?? TONES.pink}`}>
                {icon}
              </span>
            )}
            <div className="min-w-0 pt-0.5">
              {title && <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">{title}</h2>}
              {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
            </div>
          </div>
        )}

        <div className={`px-6 overflow-y-auto flex-1 ${hasHeader ? "pt-4 pb-6" : "py-6"}`}>
          {children}
        </div>

        {footer && <div className="px-6 pb-5 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
