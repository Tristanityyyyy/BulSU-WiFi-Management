import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";

// The third outcome, alongside ConfirmDialog and SuccessDialog: an action that
// asked before running has to say so when it didn't work, in the same shape as
// the question and the confirmation. Single button — a failure that already
// happened offers nothing to decide, which is exactly what a two-button dialog
// (Cancel next to OK) wrongly implies.
export default function ErrorDialog({
  message,
  title = "Something went wrong",
  onClose,
  confirmLabel = "Close",
}) {
  return (
    <Modal onClose={onClose} showClose={false} size="xs">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <span className="w-14 h-14 rounded-full flex items-center justify-center animate-pop-in bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/60">
            <AlertTriangle size={26} strokeWidth={1.8} className="text-red-500" />
          </span>
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition shadow-md bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 shadow-pink-200 dark:shadow-none"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
