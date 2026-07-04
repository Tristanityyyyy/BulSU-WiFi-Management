export default function ConfirmDialog({ message, onConfirm, onCancel, danger = true }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-pink-200 text-gray-600 rounded-xl py-2 text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold text-white transition shadow-md ${
              danger
                ? "bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600"
                : "bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600"
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
