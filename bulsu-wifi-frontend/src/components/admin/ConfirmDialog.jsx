import { AlertTriangle, HelpCircle } from "lucide-react";
import Modal from "../ui/Modal";

export default function ConfirmDialog({
  message,
  title,
  onConfirm,
  onCancel,
  danger = true,
  confirmLabel = "Confirm",
}) {
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <Modal onClose={onCancel} showClose={false} size="xs">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <span className={`w-14 h-14 rounded-full flex items-center justify-center animate-pop-in ${
            danger ? "bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/60" : "bg-pink-50 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/60"
          }`}>
            <Icon size={26} strokeWidth={1.8} className={danger ? "text-red-500" : "text-pink-500 dark:text-pink-400"} />
          </span>
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title ?? "Are you sure?"}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition shadow-md ${
              danger
                ? "bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 shadow-red-200 dark:shadow-none"
                : "bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 shadow-pink-200 dark:shadow-none"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
