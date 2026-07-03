export default function PageBackground({ imageSrc, children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-8">
      {imageSrc && (
        <img src={imageSrc} alt="background" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-pink-900/80 via-pink-700/75 to-rose-500/70" />
      {children}
    </div>
  );
}
