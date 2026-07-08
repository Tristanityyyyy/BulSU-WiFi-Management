export default function BulsuHeader({ subtitle }) {
  return (
    <>
      <div className="flex justify-center mb-4">
        <img
          src="/bulsu-logo.png"
          alt="BulSU Logo"
          className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-md"
        />
      </div>
      {subtitle && (
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-500 mb-1">
          {subtitle}
        </p>
      )}
      <h1 className="text-center text-lg sm:text-xl font-semibold text-gray-900 mb-6">
        Bulacan State University
      </h1>
    </>
  );
}
