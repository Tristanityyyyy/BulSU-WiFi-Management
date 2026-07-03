export default function WifiIcon({ size = 22, color = "currentColor", strokeWidth = 2.2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.2 15.8a5.5 5.5 0 0 1 7.6 0" />
      <circle cx="12" cy="19" r="1.1" fill={color} stroke="none" />
    </svg>
  );
}
