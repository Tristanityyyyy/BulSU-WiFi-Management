/*
  Portal backdrop: wine-dark field with the broadcast ripple —
  slow concentric rings radiating from behind the card, the way
  the access point the user is standing next to radiates signal.
*/
export default function PageBackground({ children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden bg-wine-950">
      <div className="absolute inset-0 bg-gradient-to-br from-wine-950 via-[#4c1631] to-rose-800" />

      {/* Signature: broadcast ripple */}
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="absolute rounded-full border border-white/20 animate-ripple"
            style={{
              width: "34rem",
              height: "34rem",
              animationDelay: `${i * 1.75}s`,
            }}
          />
        ))}
        {/* faint static ring so the motif reads even without motion */}
        <span className="absolute w-[22rem] h-[22rem] rounded-full border border-white/10" />
      </div>

      {children}
    </div>
  );
}
