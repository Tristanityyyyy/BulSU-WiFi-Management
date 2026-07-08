export default function Button({ children, onClick, type = "button", disabled = false, variant = "primary", className = "" }) {
  const base = "w-full font-semibold py-2.5 sm:py-3 rounded-xl text-sm transition-all shadow-md disabled:opacity-60 active:scale-[0.99]";
  const variants = {
    primary: "bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white shadow-pink-200 dark:shadow-none hover:shadow-pink-300 dark:hover:shadow-none disabled:shadow-none",
    outline: "border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 shadow-none hover:bg-slate-50 dark:hover:bg-wine-800/40",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}
