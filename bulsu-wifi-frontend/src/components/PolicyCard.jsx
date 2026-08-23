import { useEffect, useState } from "react";
import axios from "axios";
import { ROLE_LABELS } from "../constants/roles";
import { API_BASE } from "../config/api";

// "1 GB a day", "Unlimited data"
const formatCap = (gb) => (gb == null ? "Unlimited" : gb >= 1 ? `${gb} GB` : `${Math.round(gb * 1024)} MB`);

const formatSession = (minutes) => {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  const hours = Math.floor(total / 60);
  const mins = Math.round(total % 60);
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

// What each role gets, stated before anyone logs in.
//
// These are the published house rules, not personal figures, so they need no
// password — and they answer the question most people actually arrive with.
// Read live from the same settings the enforcement reads, so the screen can
// never quote a number the system doesn't apply.
//
// Renders nothing at all if the lookup fails: on a captive portal the login
// form is the job, and a missing information panel must never get in its way.
export default function PolicyCard() {
  const [roles, setRoles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_BASE}/auth/policy`)
      .then((res) => {
        if (!cancelled) setRoles(res.data?.roles || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!roles?.length) return null;

  return (
    <div className="mt-4 rounded-2xl border border-pink-100 bg-pink-50/50 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-pink-600 mb-2">
        What you get
      </p>
      <ul className="space-y-1.5">
        {roles.map((entry) => {
          const session = formatSession(entry.sessionMinutes);
          return (
            <li key={entry.role} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-wine-800 shrink-0">
                {ROLE_LABELS[entry.role] || entry.role}
              </span>
              <span className="text-gray-500 text-right tabular-nums">
                {[
                  `${formatCap(entry.dataCapGb)}/day`,
                  entry.downMbps ? `${entry.downMbps} Mbps` : null,
                  session,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-gray-400 mt-2">
        Data resets at midnight. Guests connect with a QR code from the registration desk.
      </p>
    </div>
  );
}
