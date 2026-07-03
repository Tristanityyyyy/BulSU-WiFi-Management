export default function Modal({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-xs sm:max-w-sm">
        {children}
      </div>
    </div>
  );
}
