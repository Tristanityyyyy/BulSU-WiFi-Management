import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import axios from "axios";
import PageBackground from "./layout/PageBackground";
import Card from "./layout/Card";
import BulsuHeader from "./layout/BulsuHeader";
import Button from "./ui/Button";
import AlertBanner from "./ui/AlertBanner";
import WifiIcon from "./ui/WifiIcon";
import FeedbackModal from "./feedback/FeedbackModal";
import ConfirmModal from "./feedback/ConfirmModal";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const goToDashboard = () => {
    setConnected(true);
    setTimeout(() => navigate("/dashboard"), 2500);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // TEST ACCOUNT — remove before production
    if (username === "student" && password === "student123") {
      localStorage.setItem("token", "test-token");
      goToDashboard();
      return;
    }

    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
      localStorage.setItem("token", res.data.token);
      goToDashboard();
    } catch (err) {
      setError(err.response?.data?.message || "Invalid username or password.");
      setLoading(false);
    }
  };

  if (connected) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-pink-900 via-pink-700 to-rose-500">
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex items-center justify-center w-24 h-24">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/30 animate-ping" />
            <span className="absolute inline-flex h-16 w-16 rounded-full bg-white/20 animate-ping [animation-delay:0.3s]" />
            <WifiIcon size={40} color="white" strokeWidth={2} />
          </div>
          <p className="text-white text-lg font-semibold tracking-wide">Connected to Wi-Fi</p>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageBackground imageSrc="/src/assets/bulsu-bg.png">
      <Card>
        <BulsuHeader subtitle="Campus Wi-Fi Access Portal" />

        <form onSubmit={handleLogin}>
          <AlertBanner message={error} />
          <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">
            ID Number / Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. 2023123456"
            className="w-full border border-pink-200 rounded-xl px-3 py-2.5 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
            required
          />
          <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-pink-200 rounded-xl px-3 py-2.5 mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Connecting..." : "Connect to Wi-Fi"}
          </Button>
        </form>

        <div className="mt-4 border-t border-pink-100 pt-4 text-center">
          <p className="text-xs text-gray-400">
            Guest? Scan the QR code provided at the registration desk.
          </p>
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">
          By connecting you agree to the BulSU Acceptable Use Policy.
        </p>
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            className="inline-flex items-center gap-1.5 text-xs text-pink-500 hover:text-pink-700 underline underline-offset-2 transition"
          >
            <MessageSquare size={13} />
            Submit a Feedback
          </button>
        </div>
      </Card>

      {showFeedback && (
        <FeedbackModal
          onSubmit={() => { setShowFeedback(false); setShowConfirm(true); }}
          onCancel={() => setShowFeedback(false)}
        />
      )}

      {showConfirm && (
        <ConfirmModal onClose={() => setShowConfirm(false)} />
      )}
    </PageBackground>
  );
}
