import { useEffect, useRef, useState } from "react";
import { Wifi, X } from "lucide-react";
import axios from "axios";
import Button from "./ui/Button";
import AlertBanner from "./ui/AlertBanner";
import LoadingSpinner from "./ui/LoadingSpinner";
import WifiIcon from "./ui/WifiIcon";
import ConfirmDialog from "./ui/ConfirmDialog";
import SuccessDialog from "./ui/SuccessDialog";
import FeedbackModal from "./feedback/FeedbackModal";

import { API_BASE } from "../config/api";
import AddToHomeScreen from "./ui/AddToHomeScreen";
const POLL_INTERVAL_MS = 20000;
// Only a fallback for the first render, before /session/status has answered with
// the figure an admin actually configured.
const FALLBACK_LOW_DATA_MB = 200;

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

// Read at call time rather than once per render: the token can arrive part-way
// through this component's life, when a browser that started without one claims
// it from the backend below.
const readToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") : null);
const authHeaders = () => ({ Authorization: `Bearer ${readToken()}` });

export default function SessionDashboard() {
  const [session, setSession] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  // Warnings are decided on the server now, against thresholds an admin can move,
  // and delivered as rows the user sees wherever they next look. The dashboard
  // used to make that call itself with a hardcoded 200 MB and a browser popup
  // that, on iOS, essentially never fired — and it never warned about time at all.
  const [notices, setNotices] = useState([]);
  const announced = useRef(new Set());
  // This page is reached two ways now. From the captive-portal window that just
  // logged in, a token is already in hand. From the device's own browser — the
  // one the user was handed off to, and the only one that stays open — there is
  // no token and there never will be, because that window's storage is a
  // separate sandbox. That arrival asks the backend to recognise the device and
  // issue one; see POST /api/session/claim.
  const [claiming, setClaiming] = useState(!readToken());

  useEffect(() => {
    if (!claiming) return;
    let cancelled = false;
    axios
      .post(`${API_BASE}/session/claim`)
      .then((res) => {
        if (cancelled) return;
        localStorage.setItem("token", res.data.token);
        setClaiming(false);
      })
      .catch(() => {
        // Not a connected device — nothing to show, so ask for a password. The
        // flag keeps the login page from bouncing straight back here.
        if (!cancelled) window.location.replace("/?login=1");
      });
    return () => {
      cancelled = true;
    };
  }, [claiming]);

  const fetchNotices = async () => {
    try {
      const res = await axios.get(`${API_BASE}/session/notifications`, {
        headers: authHeaders(),
      });
      const unread = (res.data?.notifications || []).filter((n) => !n.is_read);
      setNotices(unread);
      // Mirror anything new to a browser notification as well, for a user who
      // has granted permission and is looking at another tab. Best-effort only:
      // the in-page banner below is the delivery that always works.
      for (const notice of unread) {
        if (announced.current.has(notice.id)) continue;
        announced.current.add(notice.id);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("BulSU Wi-Fi", { body: notice.message });
        }
      }
    } catch {
      // A notification poll must never disturb the session view.
    }
  };

  const dismissNotice = async (id) => {
    setNotices((current) => current.filter((n) => n.id !== id));
    try {
      await axios.post(
        `${API_BASE}/session/notifications/read`,
        { ids: [id] },
        { headers: authHeaders() }
      );
    } catch {
      // Dismissed locally either way; the next poll will restore it if the
      // mark-as-read didn't land.
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/session/status`, {
        headers: authHeaders(),
      });
      setSession(res.data);
      setSecondsLeft(res.data.expiresInSec);
      setError("");
      fetchNotices();
    } catch (err) {
      // A poll that lands after the user disconnected finds the token already
      // gone and 401s. That's expected, not a failure: bouncing to the login
      // page here would snatch away the "you're disconnected" confirmation
      // before it could be read, so only a session that still holds a token
      // gets sent back.
      if (!localStorage.getItem("token")) return;
      setError(err.response?.data?.message || "Unable to load session status.");
      if (err.response?.status === 401) window.location.href = "/";
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (claiming) return; // no token yet — polling now would only 401
    if (disconnecting || disconnected) return; // session is being torn down — stop polling it
    fetchStatus();
    const poll = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [claiming, disconnecting, disconnected]);

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
      await axios.post(`${API_BASE}/session/disconnect`, {}, { headers: authHeaders() });
    } catch {
      // drop local session regardless
    } finally {
      // The token is dropped straight away, but the redirect waits for the user
      // to acknowledge — otherwise the confirmation would flash past unread.
      localStorage.removeItem("token");
      setDisconnecting(false);
      setDisconnected(true);
    }
  };

  const handleFeedbackSubmit = async ({ stars, comment }) => {
    try {
      await axios.post(`${API_BASE}/feedback`, { stars, comment }, { headers: authHeaders() });
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

  const isUnlimited = session ? session.dataLimitMB == null : false;
  const dataUsedMB = session?.dataUsedMB ?? 0;
  const dataLimitMB = isUnlimited ? null : (session?.dataLimitMB ?? 2048);
  const remainingMB = isUnlimited ? null : Math.max(0, dataLimitMB - dataUsedMB);
  // Share of the allowance already spent. Unlimited spends nothing, so its ring
  // stays full rather than reading as an empty tank.
  const dataPct = isUnlimited ? 0 : Math.min(100, (dataUsedMB / dataLimitMB) * 100);
  const lowDataMB = session?.lowDataMB ?? FALLBACK_LOW_DATA_MB;
  const isLowData = !isUnlimited && lowDataMB > 0 && remainingMB <= lowDataMB;
  const isLowTime = secondsLeft != null && secondsLeft <= 300;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  // The arc traces what is LEFT, not what has been spent: a fresh session starts
  // as a full circle and drains toward empty, matching the countdown in the middle.
  const dashOffset = circumference * (dataPct / 100);
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

        {notices.length > 0 && (
          <ul className="mb-5 space-y-2">
            {notices.map((notice) => (
              <li
                key={notice.id}
                className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <span className="flex-1 text-xs text-amber-900">{notice.message}</span>
                <button
                  type="button"
                  onClick={() => dismissNotice(notice.id)}
                  aria-label="Dismiss"
                  className="shrink-0 text-amber-500 hover:text-amber-700 transition"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

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
              <p className="text-lg font-bold text-gray-900 mt-1 font-display tabular-nums">
                {isUnlimited ? "Unlimited" : formatData(remainingMB)}
              </p>
              <p className="text-[11px] text-gray-400">
                {isUnlimited ? "data allowance" : `left of ${formatData(dataLimitMB)}`}
              </p>
            </div>
          </div>
          {isLowData && (
            <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              Heads up — under {lowDataMB} MB of data left.
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

        <AddToHomeScreen />

        <Button onClick={() => setConfirmDisconnect(true)} disabled={disconnecting}>
          {disconnecting ? "Disconnecting..." : "Disconnect"}
        </Button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Usage updates every {POLL_INTERVAL_MS / 1000}s. Values may lag slightly behind actual network activity.
        </p>

        {/* This device is recognised on sight now, so the login form is no longer
            somewhere you land by accident — anyone who actually wants it (an
            admin on a phone that holds a session, a shared device changing
            hands) needs a way back to it that survives that recognition. */}
        <p className="text-center text-xs text-gray-400 mt-2">
          <a href="/?login=1" className="text-pink-600 hover:text-pink-700 font-medium transition">
            Not you? Log in with another account
          </a>
        </p>
      </div>

      {confirmDisconnect && (
        <ConfirmDialog
          title="Disconnect from Wi-Fi?"
          message="Your session will end and you'll need to log in again to get back online. Any data left in today's allowance stays on your account."
          confirmLabel="Disconnect"
          onConfirm={() => { setConfirmDisconnect(false); setShowFeedback(true); }}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}

      {showFeedback && (
        <FeedbackModal
          onSubmit={handleFeedbackSubmit}
          onCancel={handleFeedbackSkip}
          cancelLabel="Skip"
        />
      )}

      {disconnected && (
        <SuccessDialog
          title="You're disconnected"
          message="Your Wi-Fi session has ended. Log in again anytime to reconnect."
          confirmLabel="Back to login"
          onClose={() => { window.location.href = "/"; }}
        />
      )}
    </div>
  );
}
