import { Clock, Database, Smartphone, Gauge } from "lucide-react";
import PageBackground from "./layout/PageBackground";
import Card from "./layout/Card";
import BulsuHeader from "./layout/BulsuHeader";
import Button from "./ui/Button";
import { ROLE_LABELS } from "../constants/roles";
import { greetingName } from "../utils/names";

function formatDuration(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  const hours = Math.floor(total / 60);
  const mins = Math.round(total % 60);
  if (hours && mins) return `${hours} hr ${mins} min`;
  if (hours) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${mins} minutes`;
}

function Fact({ icon: Icon, label, value }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        <span className="block text-sm text-gray-700">{value}</span>
      </span>
    </li>
  );
}

// Shown once, right after a first-time user sets their own password. It greets
// them by name and states the limits their own account was just granted, so the
// countdown and the data ring on the dashboard aren't the first they hear of it.
export default function WelcomeScreen({ fullName, role, policy = {}, onContinue }) {
  const name = greetingName(fullName);
  const roleLabel = ROLE_LABELS[role] || ROLE_LABELS.unknown;
  const sessionLength = formatDuration(policy.sessionMinutes);
  const maxDevices = Number(policy.maxDevices);
  const capGb = policy.dataCapGb == null ? null : Number(policy.dataCapGb);

  return (
    <PageBackground>
      <Card>
        <BulsuHeader subtitle="Welcome aboard" />

        <div className="text-center mb-5">
          <p className="text-lg sm:text-xl font-semibold text-gray-900 font-display">
            {name ? `Welcome, ${name}!` : "Welcome!"}
          </p>
          <span className="inline-block mt-2 rounded-full bg-pink-50 border border-pink-100 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-pink-600">
            {roleLabel} account
          </span>
          <p className="text-xs sm:text-sm text-gray-500 mt-3">
            Your password is set and your account is ready for campus Wi-Fi. Here's what it comes with:
          </p>
        </div>

        <ul className="space-y-3 rounded-2xl bg-slate-50/70 border border-slate-100 px-4 py-4 mb-5">
          {sessionLength && (
            <Fact
              icon={Clock}
              label="Session length"
              value={`${sessionLength} per connection — just log in again to start a new one.`}
            />
          )}
          <Fact
            icon={capGb ? Database : Gauge}
            label="Daily data"
            value={
              capGb
                ? `${capGb} GB a day, resetting at midnight.`
                : "Unlimited data on your account."
            }
          />
          {Number.isFinite(maxDevices) && maxDevices > 0 && (
            <Fact
              icon={Smartphone}
              label="Devices"
              value={
                maxDevices === 1
                  ? "One device at a time — connecting on another moves your session there."
                  : `Up to ${maxDevices} devices connected at once.`
              }
            />
          )}
        </ul>

        <Button onClick={onContinue}>Connect to Wi-Fi</Button>

        <p className="text-center text-xs text-gray-400 mt-4">
          You can check your remaining data anytime from the portal, without using up a session.
        </p>
      </Card>
    </PageBackground>
  );
}
