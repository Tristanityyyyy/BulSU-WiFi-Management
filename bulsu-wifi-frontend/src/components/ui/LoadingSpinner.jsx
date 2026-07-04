import { Loader2 } from "lucide-react";

export default function LoadingSpinner({ size = 40, className = "text-pink-500" }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}
