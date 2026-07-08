import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Wifi, CheckCircle2, Clock, XCircle, User } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Flow: checking (is the QR token valid?) -> form (name entry) ->
// connecting (submitting) -> success / expired / error
export default function GuestVerify() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [connectedGuestName, setConnectedGuestName] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [countdown, setCountdown] = useState(null);

  // Step 1: on load, check the token is real and not expired/used yet.
  // This does NOT create a session or consume the token.
  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid QR code. Please ask for a new one at the registration desk.");
      return;
    }
    axios
      .get(`${API_BASE}/guest/token-status`, { params: { token } })
      .then((res) => {
        if (res.data.status === "expired") {
          setStatus("expired");
          setMessage("This QR code has expired. Please request a new one.");
        } else if (res.data.status === "used") {
          setStatus("error");
          setMessage("This QR code has already been used.");
        } else if (res.data.status === "not_started") {
          setStatus("not_started");
          setMessage(`This QR code isn't active yet. It becomes available at ${new Date(res.data.startsAt).toLocaleString()}.`);
        } else {
          setStatus("form");
        }
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.response?.data?.message || "QR code expired or invalid.");
      });
  }, [token]);

  // Step 2: guest types their name and presses Connect — this is what
  // actually creates the guest session and marks the token used.
  const handleConnect = async (e) => {
    e.preventDefault();
    if (!guestNameInput.trim()) return;
    setStatus("connecting");
    try {
      const res = await axios.post(`${API_BASE}/guest/verify`, {
        qrCode: token,
        guestName: guestNameInput.trim(),
      });
      setConnectedGuestName(res.data.guest?.name || guestNameInput.trim());
      setExpiresAt(new Date(res.data.guest?.expiresAt));
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.message || "Could not connect. Please try again.");
    }
  };

  // Countdown once connected
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, expiresAt - new Date());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${mins}m ${secs}s`);
      if (remaining === 0) {
        setStatus("expired");
        setMessage("Your session has expired. Please request a new QR code.");
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-wine-950">
      <div className="absolute inset-0 bg-gradient-to-br from-wine-950 via-[#4c1631] to-rose-800" />
      <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl shadow-wine-950/40 ring-1 ring-white/20 p-8 w-full max-w-sm text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center">
            <Wifi className="w-7 h-7 text-pink-600" strokeWidth={2.2} />
          </div>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-500 mb-1">Guest Wi-Fi Access</p>
        <h1 className="text-lg font-semibold text-gray-900 mb-6">Bulacan State University</h1>

        {/* Skeleton while we check the token — shaped like the form that's about to appear */}
        {status === "checking" && (
          <div className="space-y-4 text-left">
            <div className="h-3 w-24 mx-auto rounded-md bg-pink-100 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-pink-50 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-pink-100 animate-pulse" />
          </div>
        )}

        {status === "form" && (
          <form onSubmit={handleConnect} className="text-left">
            <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">
              What's your name?
            </label>
            <div className="relative mb-5">
              <User className="w-4 h-4 text-pink-300 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={2.2} />
              <input
                type="text"
                value={guestNameInput}
                onChange={(e) => setGuestNameInput(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                autoFocus
                required
              />
            </div>
            <button
              type="submit"
              disabled={!guestNameInput.trim()}
              className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white font-semibold py-2.5 sm:py-3 rounded-xl text-sm transition-all shadow-md shadow-pink-200 disabled:opacity-50 disabled:shadow-none active:scale-[0.99]"
            >
              Connect to Wi-Fi
            </button>
          </form>
        )}

        {status === "connecting" && (
          <div className="space-y-4 text-left">
            <div className="h-11 w-full rounded-xl bg-pink-50 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-pink-100 animate-pulse" />
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-600" strokeWidth={2.2} />
            </div>
            <p className="text-green-700 font-semibold text-base mb-1">Connected!</p>
            <p className="text-gray-600 text-sm mb-4">
              Welcome, <span className="font-medium">{connectedGuestName}</span>. You now have guest Wi-Fi access.
            </p>
            {countdown && (
              <div className="bg-pink-50/60 border border-pink-100 rounded-xl px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Session expires in</p>
                <p className="text-2xl font-bold text-wine-800 font-mono tabular-nums">{countdown}</p>
                <p className="text-xs text-gray-400 mt-1">You will be disconnected automatically.</p>
              </div>
            )}
          </div>
        )}

        {status === "expired" && (
          <div>
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-7 h-7 text-amber-600" strokeWidth={2.2} />
            </div>
            <p className="text-amber-600 font-semibold text-base mb-2">Session Expired</p>
            <p className="text-gray-500 text-sm">{message || "Please return to the registration desk for a new QR code."}</p>
          </div>
        )}

        {status === "not_started" && (
          <div>
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-7 h-7 text-amber-600" strokeWidth={2.2} />
            </div>
            <p className="text-amber-600 font-semibold text-base mb-2">Not Active Yet</p>
            <p className="text-gray-500 text-sm">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
              <XCircle className="w-7 h-7 text-red-600" strokeWidth={2.2} />
            </div>
            <p className="text-red-700 font-semibold text-base mb-2">Access Denied</p>
            <p className="text-gray-500 text-sm">{message}</p>
          </div>
        )}

        <p className="text-xs text-gray-300 mt-6">By connecting you agree to the BulSU Acceptable Use Policy.</p>
      </div>
    </div>
  );
}