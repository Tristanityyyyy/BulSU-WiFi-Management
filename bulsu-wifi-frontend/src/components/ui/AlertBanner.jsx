export default function AlertBanner({ message }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-pink-700 text-xs sm:text-sm rounded-lg px-3 py-2 mb-4">
      {message}
    </div>
  );
}
