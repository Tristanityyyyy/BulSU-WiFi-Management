export default function Card({ children, className = "" }) {
  return (
    <div className={`relative z-10 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-xs sm:max-w-sm md:max-w-md ${className}`}>
      {children}
    </div>
  );
}
