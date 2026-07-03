export default function LoadingSpinner({ color = "border-white" }) {
  return (
    <div className={`w-10 h-10 border-4 ${color} border-t-transparent rounded-full animate-spin`} />
  );
}
