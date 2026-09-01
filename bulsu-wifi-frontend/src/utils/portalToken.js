import axios from "axios";
import { API_BASE } from "../config/api";

// The credential a portal page carries, and how it gets one.
//
// Login happens inside the phone's captive-portal window, and the OS closes that
// window seconds later. The browser the user actually keeps is a separate
// storage sandbox, so the token minted at login is not there and nothing can
// copy it across. Both session kinds solve that the same way: the browser proves
// it is the device (POST .../claim) and is handed its own token to keep.
//
// Holding one is what makes a later visit cheap. Device recognition is derived
// from the lease the phone happens to have right now; a token is not, so it
// keeps working after the phone drops the Wi-Fi and rejoins on a new address —
// which is exactly when someone goes looking for their figures.

const read = (key) => {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    // Private browsing and locked-down WebViews throw rather than return null.
    return null;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the page still works, it just re-derives next time.
  }
};

// "token" is the account holder's, "guestToken" the guest's. Returns {} rather
// than a header with `Bearer null`, which the backend would spend a verify on.
export function authHeaders(key) {
  const value = read(key);
  return value ? { Authorization: `Bearer ${value}` } : {};
}

export const hasGuestToken = () => Boolean(read("guestToken"));

// Asks for a guest token and keeps it. Best-effort by design: the caller has
// already been recognised and shown their session, so failing to also get a
// token is a worse next visit, not a broken this one.
export async function storeGuestToken() {
  if (hasGuestToken()) return true;
  try {
    const res = await axios.post(`${API_BASE}/guest/claim`);
    if (res.data?.token) {
      write("guestToken", res.data.token);
      return true;
    }
  } catch {
    // Not recognised, or the router could not place this address.
  }
  return false;
}

export function clearGuestToken() {
  try {
    localStorage.removeItem("guestToken");
  } catch {
    // Same as above — nothing depends on this succeeding.
  }
}
