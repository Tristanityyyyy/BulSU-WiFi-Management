import { useEffect, useState } from "react";
import { Share, Plus, X } from "lucide-react";

// The way back, made permanent.
//
// Nothing can open the system browser from a captive-portal window — no API
// exists for it on either platform — so a user's first arrival at this page is
// always something they typed. This is about the second arrival and every one
// after: an icon on the home screen costs one tap and never has to be
// remembered.
//
// Deliberately not offered inside the captive window. That window is closed by
// the OS moments later and cannot install anything, so prompting there would
// spend the one moment we have on advice the user cannot act on. `display-mode:
// browser` is false in the captive sheet and in an already-installed app, which
// is exactly the pair we want to skip.
//
// There is no service worker behind this, on purpose: an offline cache would
// show a stale allowance, and a figure that is quietly wrong is worse than a
// page that did not load.

const DISMISSED_KEY = "installPromptDismissed";

const dismissedBefore = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  // iOS predates display-mode and reports it here instead.
  window.navigator.standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

// Whether there is anything worth offering on this device at all. Settled
// while rendering rather than in an effect: none of it can change under us,
// and deciding here keeps the first paint honest.
function canOffer() {
  if (typeof window === "undefined") return false;
  if (dismissedBefore() || isStandalone()) return false;
  // Inside the captive sheet there is no point offering this.
  return Boolean(window.matchMedia?.("(display-mode: browser)").matches);
}

export default function AddToHomeScreen() {
  const [prompt, setPrompt] = useState(null);
  // iOS never fires beforeinstallprompt and cannot be prompted
  // programmatically, so its instructions are all there is to show and they
  // can be shown immediately. Android waits for the event below.
  const [visible, setVisible] = useState(() => canOffer() && isIos());

  useEffect(() => {
    if (!canOffer()) return;

    // Android/Chrome offers a real install. Capturing the event is what lets us
    // put it behind our own button instead of the browser's mini-infobar.
    const capture = (e) => {
      e.preventDefault();
      setPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Not remembering the dismissal is a mild annoyance, not a failure.
    }
  };

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    dismiss();
  };

  return (
    <div className="relative rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3 mb-4 text-left">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 transition"
      >
        <X size={14} />
      </button>

      <p className="text-xs font-semibold text-wine-800 pr-5">Keep this page one tap away</p>

      {prompt ? (
        <>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
            Add it to your home screen and you won't have to type the address again.
          </p>
          <button
            type="button"
            onClick={install}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border border-pink-200 text-pink-600 rounded-xl px-3 py-1.5 hover:bg-pink-50 transition"
          >
            <Plus size={13} /> Add to home screen
          </button>
        </>
      ) : (
        <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
          Tap <Share size={12} className="inline text-pink-500" /> Share, then
          <span className="font-medium text-gray-600">Add to Home Screen</span> — you
          won't have to type the address again.
        </p>
      )}
    </div>
  );
}
