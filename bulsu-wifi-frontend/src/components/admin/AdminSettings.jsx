import { Fragment, useEffect, useState } from "react";
import { Save, Gauge, Database, Timer, Smartphone, GraduationCap, Users2, X, SunMoon, Sun, Moon, Monitor, UserCog } from "lucide-react";
import adminApi from "./adminApi";
import { useTheme } from "../../theme";
import LoadingSpinner from "../ui/LoadingSpinner";
import Toast from "../ui/Toast";
import NetworkSettingsSection from "./settings/NetworkSettingsSection";
import CatalogSettingsSection from "./settings/CatalogSettingsSection";
import AccountSettingsSection from "./settings/AccountSettingsSection";
import SectionCard from "./settings/SectionCard";

const DEFAULTS = {
  bandwidth_upload_student: 2,   bandwidth_download_student: 5,
  bandwidth_upload_faculty: 5,   bandwidth_download_faculty: 10,
  bandwidth_upload_staff: 5,     bandwidth_download_staff: 10,
  bandwidth_upload_guest: 1,     bandwidth_download_guest: 2,
  data_cap_gb_student: 1,        data_cap_gb_faculty: 0,
  data_cap_gb_staff: 0,          data_cap_gb_guest: 0.5,
  session_timeout_student: 120,  session_timeout_faculty: 240,
  session_timeout_staff: 240,    session_timeout_guest: 60,
  one_device_policy: "true",
  max_devices_student: 2,        max_devices_faculty: 3,
  max_devices_staff: 3,          max_devices_admin: 5,
};

const NAV_GROUPS = [
  {
    label: "Network",
    items: [
      { key: "bandwidth", label: "Bandwidth Limits", icon: Gauge },
      { key: "datacap", label: "Data Caps", icon: Database },
      { key: "timeout", label: "Session Timeout", icon: Timer },
      { key: "devicepolicy", label: "Device Policy", icon: Smartphone },
    ],
  },
  {
    label: "Catalog",
    items: [
      { key: "courses", label: "Courses", icon: GraduationCap },
      { key: "sections", label: "Sections", icon: Users2 },
    ],
  },
  {
    label: "Appearance",
    items: [
      { key: "display", label: "Display", icon: SunMoon },
    ],
  },
  {
    label: "Account",
    items: [
      { key: "account", label: "My Account", icon: UserCog },
    ],
  },
];

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun, desc: "Always bright" },
  { value: "dark", label: "Dark", icon: Moon, desc: "Always dimmed" },
  { value: "system", label: "System", icon: Monitor, desc: "Follows your device" },
];

const NETWORK_SECTIONS = ["bandwidth", "datacap", "timeout", "devicepolicy"];

export default function AdminSettings() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState(DEFAULTS);
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("bandwidth");

  useEffect(() => {
    Promise.all([
      adminApi.get("/admin/settings"),
      adminApi.get("/admin/settings/catalog"),
    ])
      .then(([settingsRes, catalogRes]) => {
        setSettings({ ...DEFAULTS, ...settingsRes.data });
        setCatalog(catalogRes.data || { courses: [], sections: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminApi.put("/admin/settings", settings);
      setSaved(true);
      setDirty(false);
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

  const isNetworkSection = NETWORK_SECTIONS.includes(activeSection);
  const isCatalogSection = activeSection === "courses" || activeSection === "sections";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Settings</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Configure network limits per role and manage the course catalog.</p>
        </div>
        {(isNetworkSection || dirty) && (
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unsaved changes
              </span>
            )}
            <button type="submit" form="settings-form" disabled={saving || !dirty}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl px-4 py-2 text-xs font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-50 disabled:shadow-none transition">
              <Save size={14} />
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 md:items-start">
        {/* Inner settings navigation */}
        <nav className="w-full md:w-60 shrink-0 md:sticky md:top-4 bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-2 flex md:flex-col gap-1 overflow-x-auto">
          {NAV_GROUPS.map((group) => (
            <Fragment key={group.label}>
              <p className="hidden md:block px-3 pt-3 pb-1 first:pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                {group.label}
              </p>
              {group.items.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" onClick={() => setActiveSection(key)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                    activeSection === key
                      ? "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-900"
                      : "text-gray-600 dark:text-gray-300 border border-transparent hover:bg-slate-50 dark:hover:bg-wine-800/40"
                  }`}>
                  <Icon size={15} className={activeSection === key ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-gray-500"} />
                  {label}
                </button>
              ))}
            </Fragment>
          ))}
        </nav>

        {/* Active section content */}
        <div className="flex-1 min-w-0 w-full">
          {isNetworkSection && (
            <NetworkSettingsSection activeSection={activeSection} settings={settings} onChange={handleChange} onSubmit={handleSave} />
          )}

          {activeSection === "display" && (
            <SectionCard icon={<SunMoon size={16} />} title="Display" hint="Choose how the admin console looks. Saved on this device only.">
              <div className="grid grid-cols-3 gap-3">
                {THEME_OPTIONS.map(({ value, label, icon: Icon, desc }) => (
                  <button key={value} type="button" onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition ${
                      theme === value
                        ? "border-pink-300 dark:border-pink-800 bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 ring-1 ring-pink-200 dark:ring-pink-900"
                        : "border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 hover:border-slate-300 dark:hover:border-wine-700 hover:bg-slate-50 dark:hover:bg-wine-800/40"
                    }`}>
                    <Icon size={20} className={theme === value ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-gray-500"} />
                    {label}
                    <span className={`text-[11px] font-normal ${theme === value ? "text-pink-500/80 dark:text-pink-400/70" : "text-gray-400 dark:text-gray-500"}`}>{desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                Changes apply immediately. The student portal keeps its own look and is not affected.
              </p>
            </SectionCard>
          )}

          {activeSection === "account" && <AccountSettingsSection />}

          {isCatalogSection && (
            <CatalogSettingsSection activeSection={activeSection} catalog={catalog} onCatalogChange={setCatalog} onError={setError} />
          )}
        </div>
      </div>

      {saved && <Toast message="Settings saved successfully." onDismiss={() => setSaved(false)} />}
    </div>
  );
}
