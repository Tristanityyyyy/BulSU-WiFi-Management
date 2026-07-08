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
            danger ? "bg-red-50 border border-red-100" : "bg-pink-50 border border-pink-100"
          }`}>
            <Icon size={26} strokeWidth={1.8} className={danger ? "text-red-500" : "text-pink-500"} />
          </span>
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">{title ?? "Are you sure?"}</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition shadow-md ${
              danger
                ? "bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 shadow-red-200"
                : "bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 shadow-pink-200"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
