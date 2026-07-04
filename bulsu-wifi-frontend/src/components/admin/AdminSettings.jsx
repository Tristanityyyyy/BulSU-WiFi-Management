import { useEffect, useState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import adminApi from "./adminApi";
import LoadingSpinner from "../ui/LoadingSpinner";

const GROUPS = {
  "Session Limits": ["session_timeout_minutes", "max_concurrent_sessions"],
  "Bandwidth": ["bandwidth_cap_mbps", "data_limit_mb"],
  "Notifications": ["low_data_threshold_mb", "low_time_threshold_minutes"],
};

export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.get("/admin/settings")
      .then((res) => setSettings(res.data))
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
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-base font-semibold text-gray-800">Settings</h2>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
      {saved && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={14} className="text-green-600 shrink-0" /> Settings saved.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {Object.entries(GROUPS).map(([group, keys]) => (
          <div key={group} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide mb-4">{group}</p>
            <div className="space-y-3">
              {keys.map((key) => (
                <div key={key} className="flex items-center gap-4">
                  <label className="text-xs font-medium text-gray-600 w-56 shrink-0">
                    {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </label>
                  <input
                    type="number"
                    value={settings[key] ?? ""}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 w-32"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button type="submit" disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md disabled:opacity-60 transition">
          <Save size={15} />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
