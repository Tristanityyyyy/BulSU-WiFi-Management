import { useEffect, useRef, useState } from "react";
import { Wifi } from "lucide-react";
import axios from "axios";
import Button from "./ui/Button";
import AlertBanner from "./ui/AlertBanner";
import LoadingSpinner from "./ui/LoadingSpinner";
import WifiIcon from "./ui/WifiIcon";
import FeedbackModal from "./feedback/FeedbackModal";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const POLL_INTERVAL_MS = 20000;
const LOW_DATA_THRESHOLD_MB = 200;

function formatTime(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatData(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

export default function SessionDashboard() {
  const [session, setSession] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const hasWarnedLowData = useRef(false);
  const hasWarnedLowTime = useRef(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/session/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSession(res.data);
      setSecondsLeft(res.data.expiresInSec);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load session status.");
      if (err.response?.status === 401) window.location.href = "/";
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const poll = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (secondsLeft == null) return;
    const tick = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) {
          clearInterval(tick);
          setError("Your session has ended. Please log in again to reconnect.");
          setShowFeedback(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [secondsLeft != null]);

  useEffect(() => {
    if (!session) return;
    const remainingMB = session.dataLimitMB - session.dataUsedMB;
    if (remainingMB <= LOW_DATA_THRESHOLD_MB && !hasWarnedLowData.current) {
      hasWarnedLowData.current = true;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Low data warning", {
          body: `Only ${formatData(remainingMB)} of data left on your BulSU Wi-Fi session.`,
        });
      }
    }
    if (remainingMB > LOW_DATA_THRESHOLD_MB) hasWarnedLowData.current = false;
  }, [session]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const disconnectingRef = useRef(false);

  const finishDisconnect = async () => {
    if (disconnectingRef.current) return;
    disconnectingRef.current = true;
    setDisconnecting(true);
    try {
      await axios.post(`${API_BASE}/session/disconnect`, {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // drop local session regardless
    } finally {
      localStorage.removeItem("token");
      window.location.href = "/";
    }
  };

  const handleFeedbackSubmit = async ({ stars, comment }) => {
    try {
      await axios.post(`${API_BASE}/feedback`, { stars, comment }, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // best-effort — don't block logout on a failed feedback submission
    } finally {
      setShowFeedback(false);
      finishDisconnect();
    }
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    finishDisconnect();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-wine-950">
        <div className="absolute inset-0 bg-gradient-to-br from-wine-950 via-[#4c1631] to-rose-800" />
        <LoadingSpinner className="relative text-white" />
      </div>
    );
  }

  const dataUsedMB = session?.dataUsedMB ?? 0;
  const dataLimitMB = session?.dataLimitMB ?? 2048;
  const remainingMB = Math.max(0, dataLimitMB - dataUsedMB);
  const dataPct = Math.min(100, (dataUsedMB / dataLimitMB) * 100);
  const isLowData = remainingMB <= LOW_DATA_THRESHOLD_MB;
  const isLowTime = secondsLeft != null && secondsLeft <= 300;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - dataPct / 100);
  const ringColor = isLowData ? "#dc2626" : dataPct > 75 ? "#f59e0b" : "#db2777";

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden bg-wine-950">
      <div className="absolute inset-0 bg-gradient-to-br from-wine-950 via-[#4c1631] to-rose-800" />
      <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl shadow-wine-950/40 ring-1 ring-white/20 p-6 sm:p-8 w-full max-w-xs sm:max-w-sm md:max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base sm:text-lg font-semibold text-gray-900">You're connected</h1>
            <p className="text-xs sm:text-sm text-pink-500 font-mono">{session?.username || "BulSU Wi-Fi"}</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            <Wifi size={11} className="text-green-600" />
            Online
          </span>
        </div>

        <AlertBanner message={error} />

        <div className="flex flex-col items-center mb-6">
          <div className="relative w-36 h-36">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r={radius} fill="none" stroke="#fce7f3" strokeWidth="10" />
              <circle
                cx="64" cy="64" r={radius} fill="none"
                stroke={ringColor} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <WifiIcon size={22} color={ringColor} />
              <p className="text-lg font-bold text-gray-900 mt-1 font-display tabular-nums">{formatData(remainingMB)}</p>
              <p className="text-[11px] text-gray-400">left of {formatData(dataLimitMB)}</p>
            </div>
          </div>
          {isLowData && (
            <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              Heads up — under {LOW_DATA_THRESHOLD_MB} MB of data left.
            </p>
          )}
        </div>

        <div className={`rounded-2xl border px-4 py-3 mb-6 text-center ${isLowTime ? "bg-red-50 border-red-200" : "bg-pink-50/60 border-pink-100"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Time remaining</p>
          <p className={`text-3xl font-bold font-mono tabular-nums ${isLowTime ? "text-red-700" : "text-wine-800"}`}>
            {formatTime(secondsLeft)}
          </p>
          {isLowTime && (
            <p className="text-[11px] text-red-500 mt-1">You'll be disconnected when this reaches zero.</p>
          )}
        </div>

        <Button onClick={() => setShowFeedback(true)} disabled={disconnecting}>
          {disconnecting ? "Disconnecting..." : "Disconnect"}
        </Button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Usage updates every {POLL_INTERVAL_MS / 1000}s. Values may lag slightly behind actual network activity.
        </p>
      </div>

      {showFeedback && (
        <FeedbackModal
          onSubmit={handleFeedbackSubmit}
          onCancel={handleFeedbackSkip}
          cancelLabel="Skip"
        />
      )}
    </div>
  );
}
