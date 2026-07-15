import { Gauge, Database, Timer, Smartphone } from "lucide-react";
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
      )}
      {activeSection === "datacap" && (
        <RoleTable
          icon={<Database size={16} />}
          title="Data Cap per Session"
          hint="Data allowance per session — 0 means unlimited."
          settings={settings}
          onChange={onChange}
          columns={[
            { key: "data_cap_gb", label: "Data Cap", unit: "GB", step: 0.1 },
          ]}
        />
      )}
      {activeSection === "timeout" && (
        <RoleTable
          icon={<Timer size={16} />}
          title="Session Timeout"
          hint="How long a session stays active before re-login."
          settings={settings}
          onChange={onChange}
          columns={[
            { key: "session_timeout", label: "Timeout", type: "duration" },
          ]}
        />
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
