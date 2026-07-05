import { useEffect, useState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import adminApi from "./adminApi";
import LoadingSpinner from "../ui/LoadingSpinner";

const ROLES = ["student", "faculty", "staff", "guest"];
const ROLE_LABELS = { student: "Student", faculty: "Faculty", staff: "Staff", guest: "Guest" };

const DEFAULTS = {
  bandwidth_upload_student: 2,   bandwidth_download_student: 5,
  bandwidth_upload_faculty: 5,   bandwidth_download_faculty: 10,
  bandwidth_upload_staff: 5,     bandwidth_download_staff: 10,
  bandwidth_upload_guest: 1,     bandwidth_download_guest: 2,
  data_cap_gb_student: 1,        data_cap_gb_faculty: 0,
  data_cap_gb_staff: 0,          data_cap_gb_guest: 0.5,
  session_timeout_student: 120,  session_timeout_faculty: 240,
  session_timeout_staff: 240,    session_timeout_guest: 60,
};

function RoleTable({ title, settings, onChange, columns }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide mb-4">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-medium text-gray-400 pb-2 w-24">Role</th>
              {columns.map((col) => (
                <th key={col.key} className="text-left text-xs font-medium text-gray-400 pb-2 px-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ROLES.map((role) => (
              <tr key={role}>
                <td className="py-2.5 pr-2">
                  <span className="text-xs font-semibold text-gray-700">{ROLE_LABELS[role]}</span>
                </td>
                {columns.map((col) => {
                  const key = `${col.key}_${role}`;
                  return (
                    <td key={key} className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={col.step || 1}
                          value={settings[key] ?? ""}
                          onChange={(e) => onChange(key, e.target.value)}
                          className="border border-pink-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-20"
                        />
                        <span className="text-xs text-gray-400 shrink-0">{col.unit}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.get("/admin/settings")
      .then((res) => setSettings({ ...DEFAULTS, ...res.data }))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminApi.put("/admin/settings", settings);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size={40} className="text-pink-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-base font-semibold text-gray-800">Settings</h2>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
      {saved && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={14} className="text-green-600 shrink-0" /> Settings saved.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <RoleTable
          title="Bandwidth Limits"
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "bandwidth_upload", label: "Upload", unit: "Mbps" },
            { key: "bandwidth_download", label: "Download", unit: "Mbps" },
          ]}
        />

        <RoleTable
          title="Data Cap per Session"
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "data_cap_gb", label: "Data Cap", unit: "GB", step: 0.1 },
          ]}
        />
        <p className="text-xs text-gray-400 -mt-2 px-1">Set to 0 for unlimited.</p>

        <RoleTable
          title="Session Timeout"
          settings={settings}
          onChange={handleChange}
          columns={[
            { key: "session_timeout", label: "Timeout", unit: "min" },
          ]}
        />

        <button type="submit" disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md disabled:opacity-60 transition">
          <Save size={15} />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
