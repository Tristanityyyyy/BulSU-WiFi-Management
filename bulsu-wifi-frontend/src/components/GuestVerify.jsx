import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Wifi, CheckCircle2, Clock, XCircle, User, KeyRound } from "lucide-react";
import FeedbackModal from "./feedback/FeedbackModal";

import { API_BASE } from "../config/api";

const STATUS_POLL_MS = 20000;

// Where a guest picks their session back up once the captive-portal window is
// gone. The bare host is what they are told to type; /guest is where it lands
// them, recognised by device with no voucher involved.
const portalHost = () => (typeof window !== "undefined" ? window.location.host : "");
const guestSessionUrl = () => (typeof window !== "undefined" ? `${window.location.origin}/guest` : "/guest");


function formatData(mb) {
  if (mb == null) return "Unlimited";
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

// Flow: checking (is the voucher valid?) -> form (name entry) ->
// connecting (submitting) -> success / expired / error
export default function GuestVerify() {
  const [searchParams] = useSearchParams();
  // The voucher this visit is working with. A guest normally types it into the
  // form below, so it has to be state rather than a read of the URL — but a
  // captive-portal redirect can still carry one in the query, and honouring
  // that saves a guest retyping what the desk already handed them.
  const [pass, setPass] = useState(
    () => searchParams.get("code") || searchParams.get("token") || ""
  );
  const [codeInput, setCodeInput] = useState("");
  const [entryError, setEntryError] = useState("");

  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [connectedGuestName, setConnectedGuestName] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [dataUsedMb, setDataUsedMb] = useState(0);
  const [dataLimitMb, setDataLimitMb] = useState(null);

  // Step 1: work out what this visit actually is.
  //
  // With a fresh voucher it is the original flow: check the code, then show the
  // name form. But two arrivals here carry no usable token and are not mistakes.
  // A guest whose captive-portal window closed has typed the portal address into
  // their own browser, so there is no `?token=` at all; and a guest who re-opens
  // the original link finds the code spent, because connecting is what spent it.
  // Both are connected guests looking for their own session, and turning them
  // away would leave them with no way to see it at all — the voucher is a slip
  // from a desk they may have walked away from.
  //
  // So before refusing anyone, ask whether the backend recognises the device.
  useEffect(() => {
    let cancelled = false;

    // True if this device is holding a live guest session, in which case the
    // connected view is shown straight away. See GET /api/guest/me.
    const showRecognizedSession = async () => {
      const res = await axios.get(`${API_BASE}/guest/me`);
      if (cancelled || res.data.status !== "active") return false;
      setConnectedGuestName(res.data.guestName || "");
      setExpiresAt(new Date(res.data.expiresAt));
      setDataUsedMb(Math.round((res.data.bytesUsed || 0) / (1024 * 1024)));
      setDataLimitMb(res.data.dataLimitMb ?? null);
      setStatus("success");
      return true;
    };

    const refuse = (nextStatus, text) => {
      if (cancelled) return;
      setStatus(nextStatus);
      setMessage(text);
    };

    const run = async () => {
      if (!pass) {
        try {
          if (await showRecognizedSession()) return;
        } catch {
          // Not a connected device — fall through and send them to the desk.
        }
        // Not "error" — nobody was denied anything. This is someone who has not
        // handed over a pass yet, so ask for one rather than turning them away.
        refuse("enter", "");
        return;
      }

      try {
        const res = await axios.get(`${API_BASE}/guest/token-status`, { params: { token: pass } });
        if (cancelled) return;
        if (res.data.status === "expired") {
          refuse("expired", "This voucher has expired. Please ask the desk for a new one.");
        } else if (res.data.status === "used") {
          // Spent — but spending it is exactly what a connected guest did, so
          // check whether this is that guest coming back before saying no.
          try {
            if (await showRecognizedSession()) return;
          } catch {
            // Someone else's spent code, or a device that isn't connected.
          }
          // A pass of one was used by somebody; a pass of many ran out of room.
          // Those are different things to be told, and only the second leaves a
          // guest wondering whether to go back and ask for another.
          const seats = Number(res.data.maxUses || 1);
          refuse(
            "error",
            seats > 1
              ? `This voucher is full — all ${seats} places have been taken. Please ask the desk for another.`
              : "This voucher has already been used."
          );
        } else if (res.data.status === "not_started") {
          refuse(
            "not_started",
            `This voucher isn't active yet. It becomes available at ${new Date(res.data.startsAt).toLocaleString()}.`
          );
        } else if (!cancelled) {
          setStatus("form");
        }
      } catch (err) {
        refuse("error", err.response?.data?.message || "That voucher is expired or invalid.");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [pass]);

  // Step 1b: the guest hands over their voucher. Set it, and the effect above
  // runs the ordinary check against it, exactly as if it had arrived in the URL.
  const acceptPass = (value) => {
    const next = String(value || "").trim();
    if (!next) {
      setEntryError("Enter the voucher code from your slip.");
      return;
    }
    setEntryError("");
    setStatus("checking");
    setPass(next);
  };


  const handleCodeSubmit = (e) => {
    e.preventDefault();
    acceptPass(codeInput);
  };

  // Step 2: guest types their name and presses Connect — this is what
  // actually creates the guest session and marks the token used.
  const handleConnect = async (e) => {
    e.preventDefault();
    if (!guestNameInput.trim()) return;
    setStatus("connecting");
    try {
      const res = await axios.post(`${API_BASE}/guest/verify`, {
        qrCode: pass,
        guestName: guestNameInput.trim(),
      });
      setConnectedGuestName(res.data.guest?.name || guestNameInput.trim());
      setExpiresAt(new Date(res.data.guest?.expiresAt));
      // Not "success" — the hand-off comes first. See the hand-off view below.
      setStatus("handoff");
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
        setMessage("Your session has expired. Please ask the desk for a new voucher.");
        setShowFeedback(true);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Once connected, poll the server so the screen reflects reality: the session
  // can end early server-side (data cap reached, or an admin force-disconnect),
  // which the local countdown alone would never show. Also surfaces live usage.
  useEffect(() => {
    if (status !== "success") return;
    let active = true;
    const poll = async () => {
      try {
        // A guest who came back through their own browser has no voucher to
        // poll with, so their session is read by device instead. Same payload
        // either way.
        const res = pass
          ? await axios.get(`${API_BASE}/guest/session-status`, { params: { token: pass } })
          : await axios.get(`${API_BASE}/guest/me`);
        if (!active) return;
        setDataUsedMb(Math.round((res.data.bytesUsed || 0) / (1024 * 1024)));
        setDataLimitMb(res.data.dataLimitMb ?? null);
        if (res.data.status && res.data.status !== "active") {
          setMessage(
            res.data.status === "data_limit"
              ? "You've reached the data limit for this guest pass."
              : "Your guest session has ended."
          );
          setShowFeedback(true);
        }
      } catch (err) {
        // /guest/me only ever matches a live session, so it going 404 is the
        // device-keyed equivalent of the status flipping away from 'active'.
        // Anything else is a transient error the next tick retries.
        if (active && !pass && err.response?.status === 404) {
          setMessage("Your guest session has ended.");
          setShowFeedback(true);
        }
      }
    };
    poll();
    const id = setInterval(poll, STATUS_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [status, pass]);

  const handleFeedbackSubmit = async ({ stars, comment }) => {
    try {
      await axios.post(`${API_BASE}/feedback`, { stars, comment, guestName: connectedGuestName });
    } catch {
      // best-effort — a failed feedback submission shouldn't block the expiry screen
    } finally {
      setShowFeedback(false);
      setStatus("expired");
    }
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    setStatus("expired");
  };

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

        {/* Skeleton while we check the voucher — shaped like the form that's about to appear */}
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

        {/* Where connecting now ends, instead of on the session view.
            The window this is rendered in belongs to the phone's OS, not to us:
            iOS and Android close it a second or two after the grant lands, and
            nothing on screen survives that. No API exists to open the real
            browser from here either — so the address, in plain selectable text,
            is the handover. Arriving there costs the guest nothing, because
            /guest recognises the device (GET /api/guest/me) and their voucher,
            already spent, is not needed again. */}
        {status === "handoff" && (
          <div>
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-600" strokeWidth={2.2} />
            </div>
            <p className="text-green-700 font-semibold text-base mb-1">Connected!</p>
            <p className="text-gray-600 text-sm mb-4">
              Welcome, <span className="font-medium">{connectedGuestName}</span>. This sign-in
              window will close by itself in a moment.
            </p>

            <p className="text-xs text-gray-500 mb-2">
              To see your remaining time and data, open your browser and go to:
            </p>
            <p className="font-mono text-base sm:text-lg font-semibold text-wine-800 bg-pink-50/60 border border-pink-100 rounded-2xl px-3 py-3 mb-5 break-all select-all">
              {portalHost()}
            </p>

            <a
              href={guestSessionUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white font-semibold py-2.5 sm:py-3 rounded-xl text-sm transition-all shadow-md shadow-pink-200 active:scale-[0.99]"
            >
              Open my session
            </a>
            <button
              type="button"
              onClick={() => setStatus("success")}
              className="w-full mt-2 border border-slate-200 text-gray-600 font-semibold py-2.5 sm:py-3 rounded-xl text-sm transition-all hover:bg-slate-50 active:scale-[0.99]"
            >
              Continue here
            </button>

            <p className="text-xs text-gray-400 mt-4">
              You won't need the voucher again — this device is recognised while
              your pass is running.
            </p>
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
                <div className="mt-3 pt-3 border-t border-pink-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Data used</p>
                  <p className="text-sm font-semibold text-wine-800 tabular-nums">
                    {formatData(dataUsedMb)}
                    {dataLimitMb != null && <span className="font-normal text-gray-400"> of {formatData(dataLimitMb)}</span>}
                  </p>
                </div>
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
            <p className="text-gray-500 text-sm">{message || "Please return to the registration desk for a new voucher."}</p>
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

        {/* No voucher in hand. Typing is the only route, and that is deliberate:
            this renders in the phone's OS sign-in sheet, a restricted WebView
            with no address bar, no camera API over plain HTTP, and no way back
            from the camera app without losing the window. A code short enough to
            read off a slip is the one thing that works from there. */}
        {status === "enter" && (
          <div className="text-left">
            <p className="text-sm text-gray-600 text-center mb-1">
              Enter your guest voucher
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">
              The code is on the slip from the registration desk.
            </p>

            <form onSubmit={handleCodeSubmit}>
              <div className="relative mb-3">
                <KeyRound className="w-4 h-4 text-pink-300 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={2.2} />
                <input
                  type="text"
                  inputMode="latin"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="K7P4-M2QB"
                  maxLength={9}
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-center font-mono text-base tracking-[0.18em] uppercase placeholder:tracking-normal placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                />
              </div>
              <button
                type="submit"
                disabled={!codeInput.trim()}
                className="w-full border border-slate-200 text-gray-700 font-semibold py-2.5 sm:py-3 rounded-xl text-sm transition-all hover:bg-slate-50 disabled:opacity-50 active:scale-[0.99]"
              >
                Continue
              </button>
            </form>

            {entryError && <p className="text-xs text-red-600 mt-3 text-center">{entryError}</p>}

            <p className="text-xs text-gray-400 mt-4 text-center">
              Already connected on this device? Reconnect to the Wi-Fi and open this
              page again — you will not need the voucher a second time.
            </p>
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