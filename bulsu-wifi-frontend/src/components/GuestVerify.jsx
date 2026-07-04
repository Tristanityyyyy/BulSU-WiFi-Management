import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import axios from "axios";
import LoadingSpinner from "./ui/LoadingSpinner";
import BulsuHeader from "./layout/BulsuHeader";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function GuestVerify() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("");
  const [guestName, setGuestName] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Invalid QR code. Please ask for a new one at the registration desk.");
      return;
    }
    axios.post(`${API_BASE}/guest/verify`, { qrCode: token })
      .then((res) => {
        setStatus("success");
        setGuestName(res.data.guest?.name || "Guest");
        setExpiresAt(new Date(res.data.guest?.expiresAt));
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.response?.data?.message || "QR code expired or invalid.");
      });
  }, []);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-950 to-red-800 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
        <BulsuHeader subtitle="Campus Wi-Fi — Guest Access" />

        {status === "verifying" && (
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner className="text-red-900" />
            <p className="text-gray-600 text-sm">Verifying your QR code...</p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="flex justify-center mb-3">
              <CheckCircle2 size={52} className="text-green-600" strokeWidth={1.5} />
            </div>
            <p className="text-green-700 font-semibold text-base mb-1">Connected!</p>
            <p className="text-gray-600 text-sm mb-4">
              Welcome, <span className="font-medium">{guestName}</span>. You now have guest Wi-Fi access.
            </p>
            {countdown && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Session expires in</p>
                <p className="text-2xl font-bold text-red-900 font-mono">{countdown}</p>
                <p className="text-xs text-gray-400 mt-1">You will be disconnected automatically.</p>
              </div>
            )}
          </div>
        )}

        {status === "expired" && (
          <div>
            <div className="flex justify-center mb-3">
              <Clock size={52} className="text-orange-500" strokeWidth={1.5} />
            </div>
            <p className="text-orange-600 font-semibold text-base mb-2">Session Expired</p>
            <p className="text-gray-500 text-sm">Please return to the registration desk for a new QR code.</p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="flex justify-center mb-3">
              <XCircle size={52} className="text-red-600" strokeWidth={1.5} />
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
