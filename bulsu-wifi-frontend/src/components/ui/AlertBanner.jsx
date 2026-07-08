import { AlertCircle } from "lucide-react";

export default function AlertBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-pink-700 dark:text-pink-300 text-xs sm:text-sm rounded-xl px-3 py-2 mb-4">
      <AlertCircle size={15} className="text-pink-600 dark:text-pink-400 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
