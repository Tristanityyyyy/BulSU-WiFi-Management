import { CheckCircle2 } from "lucide-react";
import Modal from "./Modal";

// The "it worked" half of ConfirmDialog: same shape and weight as the question
// that preceded it, so an action that asked before running also reports back
// when it's done. Single button — there is nothing to decide here.
export default function SuccessDialog({
  message,
  title = "Done",
  onClose,
  confirmLabel = "Close",
}) {
  return (
    <Modal onClose={onClose} showClose={false} size="xs">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <span className="w-14 h-14 rounded-full flex items-center justify-center animate-pop-in bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/60">
            <CheckCircle2 size={26} strokeWidth={1.8} className="text-green-500" />
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
