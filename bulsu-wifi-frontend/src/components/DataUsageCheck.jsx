import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import PageBackground from "./layout/PageBackground";
import Card from "./layout/Card";
import BulsuHeader from "./layout/BulsuHeader";
import Button from "./ui/Button";
import AlertBanner from "./ui/AlertBanner";
import WifiIcon from "./ui/WifiIcon";
import LoadingSpinner from "./ui/LoadingSpinner";

import { API_BASE } from "../config/api";
import AddToHomeScreen from "./ui/AddToHomeScreen";
import { authHeaders, storeGuestToken } from "../utils/portalToken";

const LOW_DATA_THRESHOLD_MB = 200;

function formatData(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

// "in 6h 20m" — the allowance resets at midnight, and a duration reads more
// clearly on a phone than a wall-clock time in an unknown timezone.
function formatReset(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

// "1h 12m" — how much of the session window is left.
function formatRemaining(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// A guest's figures in the same shape as an account holder's, so one view can
// render either. Two differences are real rather than cosmetic: a voucher has a
// total rather than a daily allowance, so there is nothing to reset and that row
// is left out; and the window that matters is the voucher's own expiry.
function usageFromGuest(guest) {
  const usedMB = Math.round((guest.bytesUsed || 0) / (1024 * 1024));
  const limitMB = guest.dataLimitMb ?? null;
  return {
    kind: "guest",
    username: guest.guestName || "Guest",
    recognizedDevice: true,
    dataUsedMB: usedMB,
    dataLimitMB: limitMB,
    remainingMB: limitMB == null ? null : Math.max(0, limitMB - usedMB),
    resetsInSec: null,
    expiresInSec: guest.expiresAt
      ? Math.max(0, Math.floor((new Date(guest.expiresAt) - Date.now()) / 1000))
      : null,
  };
}

// Read-only allowance check. Reachable without network access — the walled garden
// lets a cut-off device load the portal — so a student who has hit their cap can
// still find out where they stand. Creates no session and no router grant.
export default function DataUsageCheck() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(null);
  // Starts true so the password form never flashes up before the device has had
  // its chance to be recognised.
  const [detecting, setDetecting] = useState(true);

  // The device asks about itself first. A phone that already holds an active
  // session has been identified once and the router can confirm the address is
  // still its own, so there is nothing left for a password to establish — the
  // allowance just appears. Anything less than a clean match (no session, a
  // recycled address, the portal's own browser) falls through to the form.
  //
  // Guests are asked about second, on the same terms. They have no account to
  // fall back on, so being recognised is not a convenience for them — it is the
  // only way they can ever see these figures. Their voucher is not a substitute:
  // several guests can hold the same code, so it names a voucher, not a person.
  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      // Whatever this browser kept goes first. A token outlives the lease the
      // device was recognised on, which is the difference between "works until
      // your phone reconnects" and "works".
      try {
        const res = await axios.get(`${API_BASE}/session/me`, { headers: authHeaders("token") });
        if (!cancelled) setUsage(res.data);
        return;
      } catch {
        // Not an account session — a guest pass is the other thing this device
        // could be holding.
      }

      try {
        const res = await axios.get(`${API_BASE}/guest/me`, { headers: authHeaders("guestToken") });
        if (!cancelled && res.data.status === "active") {
          setUsage(usageFromGuest(res.data));
          // Recognised by device but holding nothing: take a token now, so the
          // next visit does not depend on being recognised all over again.
          storeGuestToken();
          return;
        }
      } catch {
        // Not connected at all — the form below is the remaining route.
      }

      if (!cancelled) setDetecting(false);
    };

    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheck = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/auth/usage`, { username, password });
      setUsage(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load your data usage.");
    } finally {
      setLoading(false);
    }
  };

  if (usage) {
    const isUnlimited = usage.dataLimitMB == null;
    const dataPct = isUnlimited ? 0 : Math.min(100, (usage.dataUsedMB / usage.dataLimitMB) * 100);
    const isLowData = !isUnlimited && usage.remainingMB <= LOW_DATA_THRESHOLD_MB;

    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    // Drains as the allowance is spent, matching the dashboard ring.
    const dashOffset = circumference * (dataPct / 100);
    const ringColor = isLowData ? "#dc2626" : dataPct > 75 ? "#f59e0b" : "#db2777";

    return (
      <PageBackground>
        <Card>
          <BulsuHeader subtitle="Data Allowance" />

          <p className={`text-center text-xs text-gray-400 font-mono ${usage.recognizedDevice ? "mb-1" : "mb-5"}`}>
            {usage.username}
          </p>
          {usage.recognizedDevice && (
            <p className="text-center text-[11px] text-pink-600 font-medium mb-5">
              Recognised from this device — no login needed
            </p>
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
                  {isUnlimited ? "Unlimited" : formatData(usage.remainingMB)}
                </p>
                <p className="text-[11px] text-gray-400">
                  {isUnlimited ? "data allowance" : `left of ${formatData(usage.dataLimitMB)}`}
                </p>
              </div>
            </div>
            {isLowData && (
              <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                Heads up — under {LOW_DATA_THRESHOLD_MB} MB left today.
              </p>
            )}
          </div>

          <dl className="rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3 mb-6 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-gray-500">{usage.kind === "guest" ? "Used" : "Used today"}</dt>
              <dd className="font-semibold text-wine-800 tabular-nums">{formatData(usage.dataUsedMB)}</dd>
            </div>
            {/* A voucher is a total, not a daily allowance — nothing resets. */}
            {usage.resetsInSec != null && (
              <div className="flex justify-between py-1">
                <dt className="text-gray-500">Resets</dt>
                <dd className="font-semibold text-wine-800 tabular-nums">{formatReset(usage.resetsInSec)}</dd>
              </div>
            )}
            {usage.expiresInSec != null && (
              <div className="flex justify-between py-1">
                <dt className="text-gray-500">Session ends</dt>
                <dd className="font-semibold text-wine-800 tabular-nums">
                  {usage.expiresInSec > 0 ? `in ${formatRemaining(usage.expiresInSec)}` : "now"}
                </dd>
              </div>
            )}
          </dl>

          <AddToHomeScreen />

          <Button onClick={() => navigate("/")}>Back to portal</Button>
          {/* Offered only to account holders: there is no second guest pass to
              check from here, and the form it reveals asks for a login a guest
              does not have. */}
          {usage.kind !== "guest" && (
            <Button variant="outline" className="mt-2" onClick={() => { setUsage(null); setPassword(""); }}>
              Check another account
            </Button>
          )}
        </Card>
      </PageBackground>
    );
  }

  if (detecting) {
    return (
      <PageBackground>
        <Card>
          <BulsuHeader subtitle="Check Data Usage" />
          <div className="flex flex-col items-center gap-3 py-8">
            <LoadingSpinner />
            <p className="text-xs text-gray-400">Checking this device…</p>
          </div>
        </Card>
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <Card>
        <BulsuHeader subtitle="Check Data Usage" />

        <p className="text-center text-xs text-gray-500 mb-5">
          This device isn't connected right now, so enter your details to see how
          much of today's allowance you have left. This won't connect you or use
          up a device slot.
        </p>

        {/* A guest reaching this point cannot go further, and should be told why
            rather than left staring at a login they do not have. Their voucher
            would not help: with seats, one code is held by several people, so it
            identifies a voucher and not a person — only the device does that. */}
        <p className="text-center text-[11px] text-gray-400 mb-5">
          Visiting on a guest voucher? Reconnect to the Wi-Fi and open this page
          again — your figures are tied to your device, not to your code.
        </p>

        <form onSubmit={handleCheck}>
          <AlertBanner message={error} />
          <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">
            ID Number / Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. 2023123456"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
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
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Checking..." : "Check my data"}
          </Button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-4 text-center">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-xs text-pink-600 hover:text-pink-700 font-medium transition"
          >
            ← Back to login
          </button>
        </div>
      </Card>
    </PageBackground>
  );
}
