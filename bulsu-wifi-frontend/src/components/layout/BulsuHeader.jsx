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
      <h1 className="text-center text-base sm:text-lg font-semibold text-gray-800">
        Bulacan State University
      </h1>
      {subtitle && (
        <p className="text-center text-xs sm:text-sm text-pink-400 mb-6">{subtitle}</p>
      )}
    </>
  );
}
