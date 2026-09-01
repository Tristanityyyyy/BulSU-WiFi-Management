import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import PageBackground from "./layout/PageBackground";
import Card from "./layout/Card";
import BulsuHeader from "./layout/BulsuHeader";
import Button from "./ui/Button";
import AlertBanner from "./ui/AlertBanner";
import WifiIcon from "./ui/WifiIcon";
import { GraduationCap, UserRound } from "lucide-react";
import LoadingSpinner from "./ui/LoadingSpinner";
import WelcomeScreen from "./WelcomeScreen";
import { greetingName } from "../utils/names";

import { API_BASE } from "../config/api";

// Where to send someone who has just connected. The captive-portal window they
// logged in from is about to be closed by the OS, so this is the address they
// need to reach their session from the browser that stays open — derived from
// however this page was itself reached, so it is right on any deployment.
const portalHost = () => (typeof window !== "undefined" ? window.location.host : "");
const dashboardUrl = () => (typeof window !== "undefined" ? `${window.location.origin}/dashboard` : "/dashboard");

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  // Who just logged in, plus the limits their role was granted — used to greet
  // them by name and to fill in the first-login welcome screen.
  const [account, setAccount] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  // The screen that tells the user where to pick their session back up once the
  // captive-portal window disappears. It follows the "Connected" animation.
  const [handoff, setHandoff] = useState(false);
  // A device that is already connected has no business being shown a login form:
  // it is the phone's own browser arriving after that hand-off, and asking for
  // the password again would start a second session on top of the live one.
  // `?login=1` is the deliberate way back to the form.
  const [detecting, setDetecting] = useState(
    typeof window !== "undefined" && !new URLSearchParams(window.location.search).has("login")
  );

  // A guest arriving here with a voucher in the query was aimed at /guest and
  // lost the path on the way. The captive portal's login.html is what does it:
  // an unauthenticated device's first request is answered with that file
  // whatever it asked for, and the redirect it carries names the portal root.
  // Sending the code on rather than showing a guest the staff login form costs
  // nothing, and it is the difference between a working link and a guest
  // standing at the desk with a login box they have no account for.
  //
  // It replaces device detection rather than running beside it. Both start on
  // mount, but detection is a network round trip that navigates when it lands,
  // and on a device already holding an account session it lands after this one
  // has already moved on — dropping the dashboard on top of the guest. The
  // portal machine itself does exactly that, which is where this was caught.
  const strayGuestToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token")
      : null;

  useEffect(() => {
    if (!strayGuestToken) return;
    navigate(`/guest?token=${encodeURIComponent(strayGuestToken)}`, { replace: true });
  }, [strayGuestToken, navigate]);

  useEffect(() => {
    if (!detecting || strayGuestToken) return;
    let cancelled = false;

    const detect = async () => {
      try {
        const res = await axios.post(`${API_BASE}/session/claim`);
        if (cancelled) return;
        localStorage.setItem("token", res.data.token);
        navigate("/dashboard", { replace: true });
        return;
      } catch {
        // Not an account session — a guest pass is the other thing this device
        // could be holding, and guests are told to type this same address.
      }

      try {
        const res = await axios.get(`${API_BASE}/guest/me`);
        if (cancelled) return;
        if (res.data.status === "active") {
          navigate("/guest", { replace: true });
          return;
        }
      } catch {
        // Not connected at all.
      }

      if (!cancelled) setDetecting(false);
    };

    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const goToDashboard = () => {
    setShowWelcome(false);
    setConnected(true);
    // Deliberately not navigate() — see the hand-off screen below for why the
    // session view can't simply be shown here.
    setTimeout(() => setHandoff(true), 2500);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
      const { token, role, full_name, policy, must_change_password } = res.data;
      setAccount({ fullName: full_name, role, policy });

      if (role === "admin") {
        localStorage.setItem("adminToken", token);
        navigate("/admin/overview");
      } else if (["student", "faculty", "staff"].includes(role)) {
        localStorage.setItem("token", token);
        if (must_change_password) {
          setMustChangePassword(true);
          setLoading(false);
        } else {
          goToDashboard();
        }
      } else {
        setError("Invalid user role. Please contact support.");
        setLoading(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Invalid username or password.");
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError("");
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError("New password and confirmation do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_BASE}/auth/change-password`,
        { current_password: password, new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // First login is the one moment we can explain how the account works, so
      // it lands on the welcome instead of connecting straight away.
      setMustChangePassword(false);
      setShowWelcome(true);
    } catch (err) {
      setChangePasswordError(err.response?.data?.message || "Failed to change password.");
      setChangingPassword(false);
    }
  };

  if (detecting) {
    return (
      <PageBackground>
        <Card>
          <BulsuHeader subtitle="Campus Wi-Fi Access Portal" />
          <div className="flex flex-col items-center gap-3 py-8">
            <LoadingSpinner />
            <p className="text-xs text-gray-400">Checking this device…</p>
          </div>
        </Card>
      </PageBackground>
    );
  }

  if (mustChangePassword) {
    return (
      <PageBackground>
        <Card>
          <BulsuHeader subtitle="Set a new password to continue" />
          <form onSubmit={handleChangePassword}>
            <AlertBanner message={changePasswordError} />
            <p className="text-xs sm:text-sm text-gray-500 mb-4">
              This is your first time logging in. Please set a new password before connecting.
            </p>
            <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              required
            />
            <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              required
            />
            <Button type="submit" disabled={changingPassword}>
              {changingPassword ? "Saving..." : "Set Password & Continue"}
            </Button>
          </form>
        </Card>
      </PageBackground>
    );
  }

  if (showWelcome) {
    return (
      <WelcomeScreen
        fullName={account?.fullName}
        role={account?.role}
        policy={account?.policy}
        onContinue={goToDashboard}
      />
    );
  }

  // Where the login now ends, instead of on the session dashboard.
  //
  // This page is almost always being rendered inside the phone's captive-portal
  // window, and that window is not ours to keep: iOS and Android close it on
  // their own the moment their connectivity check starts passing, which is a
  // second or two after the grant lands. A dashboard shown here is a dashboard
  // the user watches vanish. Nor can we open the real browser for them — no API
  // exists for that from a captive window, on either platform.
  //
  // What we can do is tell them exactly where to go, and make arriving there
  // cost nothing: the browser they open is recognised by the router as the same
  // device and lands straight on the session (POST /api/session/claim). The link
  // is worth offering even though it usually just re-opens in place — some
  // Android builds do hand a target=_blank off to Chrome — but the address in
  // plain text is the part that always works.
  if (handoff) {
    return (
      <PageBackground>
        <Card>
          <BulsuHeader subtitle="You're Connected" />

          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
              <WifiIcon size={11} color="#15803d" />
              Online
            </span>
          </div>

          <p className="text-sm text-gray-600 text-center mb-4">
            {greetingName(account?.fullName)
              ? `You're online, ${greetingName(account.fullName)}.`
              : "You're online."}{" "}
            This sign-in window will close by itself in a moment.
          </p>

          <p className="text-xs text-gray-500 text-center mb-2">
            To see how much data and time you have left, open your browser and go to:
          </p>
          <p className="text-center font-mono text-base sm:text-lg font-semibold text-wine-800 bg-pink-50/60 border border-pink-100 rounded-2xl px-3 py-3 mb-5 break-all select-all">
            {portalHost()}
          </p>

          <a
            href={dashboardUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center font-semibold py-2.5 sm:py-3 rounded-xl text-sm transition-all shadow-md bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white shadow-pink-200 hover:shadow-pink-300"
          >
            Open my session
          </a>
          <Button variant="outline" className="mt-2" onClick={() => navigate("/dashboard")}>
            Continue here
          </Button>

          <p className="text-center text-xs text-gray-400 mt-4">
            No password needed next time — this device is recognised on sight
            while your session is running.
          </p>
        </Card>
      </PageBackground>
    );
  }

  if (connected) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden bg-wine-950">
        <div className="absolute inset-0 bg-gradient-to-br from-wine-950 via-[#4c1631] to-rose-800" />
        <div className="relative flex flex-col items-center gap-5">
          <div className="relative flex items-center justify-center w-24 h-24">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/30 animate-ping" />
            <span className="absolute inline-flex h-16 w-16 rounded-full bg-white/20 animate-ping [animation-delay:0.3s]" />
            <WifiIcon size={40} color="white" strokeWidth={2} />
          </div>
          <div className="text-center">
            <p className="text-white text-xl font-semibold font-display tracking-tight">Connected to Wi-Fi</p>
            <p className="text-pink-200/80 text-sm mt-1">
              {greetingName(account?.fullName)
                ? `Welcome, ${greetingName(account.fullName)} — setting up your access…`
                : "Setting up your access…"}
            </p>
          </div>
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
    <PageBackground>
      <Card>
        <BulsuHeader subtitle="Campus Wi-Fi Access Portal" />

        {/* Who is standing here decides everything that follows, and until now
            the page only ever asked one of them. A visitor got a footnote at the
            bottom telling them to go and find something — no use on the sign-in
            sheet this renders in, which has no address bar and no way out to
            another app. Asking the question first gives them a door. */}
        <div className="grid grid-cols-2 gap-2 mb-5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 text-pink-700 font-semibold text-xs sm:text-sm py-2.5 transition-all"
          >
            <GraduationCap size={15} strokeWidth={2.2} />
            Student / Staff
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            onClick={() => navigate("/guest")}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-gray-600 font-semibold text-xs sm:text-sm py-2.5 transition-all hover:bg-slate-50 active:scale-[0.99]"
          >
            <UserRound size={15} strokeWidth={2.2} />
            Visitor
          </button>
        </div>

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
            {loading ? "Connecting..." : "Connect to Wi-Fi"}
          </Button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-4 text-center">
          <button
            type="button"
            onClick={() => navigate("/guest")}
            className="text-xs text-pink-600 font-medium hover:text-pink-700 hover:underline"
          >
            Visiting? Use a guest pass instead
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">
          By connecting you agree to the BulSU Acceptable Use Policy.
        </p>
      </Card>
    </PageBackground>
  );
}
