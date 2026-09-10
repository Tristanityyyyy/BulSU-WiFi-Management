import { Gauge, Database, Timer, Smartphone, WifiOff, BellRing, Siren, Ticket, Router } from "lucide-react";
import SectionCard from "./SectionCard";
import { ROLE_LABELS } from "../../../constants/roles";

const ROLES = ["student", "faculty", "staff", "guest"];

function RoleTable({ icon, title, hint, settings, onChange, columns, roles = ROLES }) {
  return (
    <SectionCard icon={icon} title={title} hint={hint}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-wine-800/70">
              <th className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide pb-2 w-24">Role</th>
              {columns.map((col) => (
                <th key={col.key} className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide pb-2 px-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-wine-800/60">
            {roles.map((role) => (
              <tr key={role} className="hover:bg-slate-50/60 dark:hover:bg-wine-800/40 transition-colors">
                <td className="py-2.5 pr-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{ROLE_LABELS[role]}</span>
                </td>
                {columns.map((col) => {
                  const key = `${col.key}_${role}`;
                  if (col.type === "duration") {
                    // Stored as a single total-minutes integer (unchanged shape); the hour/minute
                    // split is purely presentational so nothing downstream needs to change.
                    const totalMinutes = Number(settings[key]) || 0;
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    const updateDuration = (h, m) => onChange(key, String(h * 60 + m));
                    return (
                      <td key={key} className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={hours}
                            onChange={(e) => updateDuration(Math.max(0, Number(e.target.value) || 0), minutes)}
                            className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-16 transition"
                          />
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">h</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            value={minutes}
                            onChange={(e) => updateDuration(hours, Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                            className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-16 transition"
                          />
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">m</span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={key} className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={col.step || 1}
                          value={settings[key] ?? ""}
                          onChange={(e) => onChange(key, e.target.value)}
                          className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-20 transition"
                        />
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{col.unit}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// Bandwidth / data cap / session timeout tabs — all per-role network limits,
// submitted together via the "settings-form" the page header's Save button targets.
export default function NetworkSettingsSection({ activeSection, settings, onChange, onSubmit }) {
  return (
    <form id="settings-form" onSubmit={onSubmit}>
      {activeSection === "bandwidth" && (
        <div className="space-y-4">
          <RoleTable
            icon={<Gauge size={16} />}
            title="Bandwidth Limits"
            hint="Maximum upload and download speed per connected device."
            settings={settings}
            onChange={onChange}
            columns={[
              { key: "bandwidth_upload", label: "Upload", unit: "Mbps" },
              { key: "bandwidth_download", label: "Download", unit: "Mbps" },
            ]}
          />
          {/* The per-device figures above decide how fast one client may go when
              there is capacity going spare. This one decides who wins when there
              isn't — without it every client queue stands on its own, the router
              is never the bottleneck, and an emergency priority's "serve this
              person first" has nothing to be first in front of. */}
          <SectionCard
            icon={<Router size={16} />}
            title="Total Uplink"
            hint="The ceiling for all client traffic together, which is what lets an emergency priority actually take precedence. Measure your internet speed from a wired computer at a quiet hour, then enter about 90-95% of it — a little under the real line, so this router does the queuing instead of your provider. 0 turns it off.">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={1}
                value={settings.uplink_total_mbps ?? ""}
                onChange={(e) => onChange("uplink_total_mbps", e.target.value)}
                className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-20 transition"
              />
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Mbps total</span>
            </div>
          </SectionCard>
        </div>
      )}
      {activeSection === "datacap" && (
        <div className="space-y-4">
          {/* Guests are absent here for the same reason they are absent from the
              timeout table: this is a per-account, per-day allowance, and a guest
              has neither an account nor a second day. Their allowance is a total
              carried by the voucher, and CAPPED_ROLES in the backend has never
              included them — a guest row here was collected and never read. */}
          <RoleTable
            icon={<Database size={16} />}
            title="Data Cap per Day"
            hint="Data allowance per account, per day — 0 means unlimited. Guest allowance is per voucher, set below."
            settings={settings}
            onChange={onChange}
            roles={["student", "faculty", "staff"]}
            columns={[
              { key: "data_cap_gb", label: "Data Cap", unit: "GB", step: 0.1 },
            ]}
          />
          <SectionCard
            icon={<Ticket size={16} />}
            title="Default Voucher Data Limit"
            hint="What a new guest voucher is pre-filled with on the Guest Access page — per guest, for the whole voucher, not per day. It can be changed when issuing one.">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={settings.guest_data_limit_gb ?? ""}
                onChange={(e) => onChange("guest_data_limit_gb", e.target.value)}
                className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-20 transition"
              />
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">GB per guest</span>
            </div>
          </SectionCard>
        </div>
      )}
      {activeSection === "timeout" && (
        <div className="space-y-4">
          {/* Guests are deliberately absent. Their session does not run on a
              role-wide timeout at all — each voucher carries its own start and
              expiry, set on the Guest Access page when it is issued, and that
              window is what ends the session. A guest row here was a control
              that looked live and governed nothing. */}
          <RoleTable
            icon={<Timer size={16} />}
            title="Session Timeout"
            hint="How long a session stays active before re-login. Guest vouchers carry their own window — set it on the Guest Access page."
            settings={settings}
            onChange={onChange}
            roles={["student", "faculty", "staff"]}
            columns={[
              { key: "session_timeout", label: "Timeout", type: "duration" },
            ]}
          />
          <SectionCard
            icon={<WifiOff size={16} />}
            title="Disconnect When Device Leaves"
            hint="A device that turns its WiFi off never says goodbye, so the router is asked instead. Once it has been off the network this long, its session ends on its own. 0 turns this off and leaves only the timeout above.">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={settings.presence_grace_minutes ?? ""}
                onChange={(e) => onChange("presence_grace_minutes", e.target.value)}
                className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-20 transition"
              />
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">minutes off the network</span>
            </div>
          </SectionCard>
        </div>
      )}
      {activeSection === "alerts" && (
        <div className="space-y-4">
          <SectionCard
            icon={<BellRing size={16} />}
            title="Low Balance Warnings"
            hint="How close to the edge a user gets before the system tells them. The warning is sent once per day for data and once per session for time, and appears on their dashboard. 0 turns a warning off.">
            <div className="space-y-3">
              {[
                { key: "notify_low_data_mb", label: "Warn when data left drops below", unit: "MB" },
                { key: "notify_low_time_min", label: "Warn when session time left drops below", unit: "minutes" },
              ].map((field) => (
                <div key={field.key} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-300 flex-1 min-w-[180px]">{field.label}</span>
                  <input
                    type="number"
                    min={0}
                    value={settings[field.key] ?? ""}
                    onChange={(e) => onChange(field.key, e.target.value)}
                    className="border border-slate-200 dark:border-wine-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent w-20 transition"
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 w-16">{field.unit}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            icon={<Siren size={16} />}
            title="Emergency Priority"
            hint="While a priority is active, that account is served first on the network, is not speed-limited, and its daily data cap is waived. Turning this off keeps the Emergency page working as a record but stops it changing anything on the router.">
            <div className="inline-flex rounded-xl border border-pink-200 dark:border-pink-900 overflow-hidden">
              {[{ value: "true", label: "ON" }, { value: "false", label: "OFF" }].map((opt) => (
                <button key={opt.value} type="button" onClick={() => onChange("emergency_priority_mode", opt.value)}
                  className={`px-4 py-1.5 text-xs font-semibold transition ${
                    (settings.emergency_priority_mode ?? "true") === opt.value
                      ? "bg-pink-600 text-white"
                      : "bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      )}
      {activeSection === "devicepolicy" && (
        <div className="space-y-4">
          <SectionCard icon={<Smartphone size={16} />} title="One Device Policy" hint="Restrict each account to a single active device.">
            <div className="inline-flex rounded-xl border border-pink-200 dark:border-pink-900 overflow-hidden">
              {[{ value: "true", label: "ON" }, { value: "false", label: "OFF" }].map((opt) => (
                <button key={opt.value} type="button" onClick={() => onChange("one_device_policy", opt.value)}
                  className={`px-4 py-1.5 text-xs font-semibold transition ${
                    (settings.one_device_policy ?? "true") === opt.value
                      ? "bg-pink-600 text-white"
                      : "bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </SectionCard>
          <RoleTable
            icon={<Smartphone size={16} />}
            title="Max Devices Per Role"
            hint="Applies when One Device Policy is OFF."
            settings={settings}
            onChange={onChange}
            roles={["student", "faculty", "staff", "admin"]}
            columns={[
              { key: "max_devices", label: "Max Devices", unit: "devices" },
            ]}
          />
        </div>
      )}
    </form>
  );
}
