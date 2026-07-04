import { AlertCircle } from "lucide-react";

export default function AlertBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-pink-700 text-xs sm:text-sm rounded-xl px-3 py-2 mb-4">
      <AlertCircle size={15} className="text-pink-600 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
