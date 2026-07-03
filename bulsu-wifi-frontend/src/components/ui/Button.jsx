export default function Button({ children, onClick, type = "button", disabled = false, variant = "primary", className = "" }) {
  const base = "w-full font-semibold py-2.5 sm:py-3 rounded-xl text-sm transition-all shadow-md disabled:opacity-60";
  const variants = {
    primary: "bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white hover:shadow-pink-300",
    outline: "border border-pink-200 text-gray-600 hover:bg-gray-50",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}
