import { useEffect, useState } from "react";
import { Save, UserCog, Eye, EyeOff } from "lucide-react";
import adminApi from "../adminApi";
import ConfirmDialog from "../ConfirmDialog";
import LoadingSpinner from "../../ui/LoadingSpinner";
import SectionCard from "./SectionCard";

// My Account tab — fetches its own data lazily since it isn't shown on first load.
export default function AccountSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [accountForm, setAccountForm] = useState({ full_name: "", student_number: "", current_password: "", new_password: "", confirm_password: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    adminApi.get("/admin/settings/account")
      .then((res) => setAccountForm((prev) => ({ ...prev, full_name: res.data.full_name || "", student_number: res.data.student_number || "" })))
      .finally(() => setLoading(false));
  }, []);

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    setAccountError("");
    if (accountForm.new_password && accountForm.new_password !== accountForm.confirm_password) {
      setAccountError("New password and confirmation do not match.");
      return;
    }
    setAccountSaving(true);
    try {
      await adminApi.put("/admin/settings/account", {
        full_name: accountForm.full_name.trim(),
        student_number: accountForm.student_number.trim(),
        current_password: accountForm.current_password,
        new_password: accountForm.new_password || undefined,
      });
      setAccountForm((prev) => ({ ...prev, current_password: "", new_password: "", confirm_password: "" }));
      setAccountSuccess("Account updated successfully.");
    } catch (err) {
      setAccountError(err.response?.data?.message || "Failed to update account.");
    } finally {
      setAccountSaving(false);
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
    <SectionCard icon={<UserCog size={16} />} title="My Account" hint="Update your name, login username, and password. Your current password is required to save any change.">
      {accountError && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">{accountError}</p>
      )}
      <form onSubmit={handleAccountSubmit} className="space-y-3 max-w-sm">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Full Name</label>
          <input type="text" value={accountForm.full_name}
            onChange={(e) => setAccountForm((prev) => ({ ...prev, full_name: e.target.value }))}
            className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" required />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Username</label>
          <input type="text" value={accountForm.student_number}
            onChange={(e) => setAccountForm((prev) => ({ ...prev, student_number: e.target.value }))}
            className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" required />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Current Password</label>
          <input type={showPasswords ? "text" : "password"} value={accountForm.current_password}
            onChange={(e) => setAccountForm((prev) => ({ ...prev, current_password: e.target.value }))}
            placeholder="Required to save changes"
            className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" required />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">New Password</label>
          <input type={showPasswords ? "text" : "password"} value={accountForm.new_password}
            onChange={(e) => setAccountForm((prev) => ({ ...prev, new_password: e.target.value }))}
            placeholder="Leave blank to keep current password"
            className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" />
        </div>
        {accountForm.new_password && (
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Confirm New Password</label>
            <input type={showPasswords ? "text" : "password"} value={accountForm.confirm_password}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, confirm_password: e.target.value }))}
              className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" required />
          </div>
        )}
        <button type="button" onClick={() => setShowPasswords((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:underline">
          {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
          {showPasswords ? "Hide" : "Show"} passwords
        </button>
        <div className="pt-2">
          <button type="submit" disabled={accountSaving}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl px-4 py-2 text-xs font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-50 disabled:shadow-none transition">
            <Save size={14} />
            {accountSaving ? "Saving…" : "Save Account"}
          </button>
        </div>
      </form>
      {accountSuccess && (
        <ConfirmDialog
          title="Success"
          message={accountSuccess}
          confirmLabel="OK"
          danger={false}
          onConfirm={() => setAccountSuccess("")}
          onCancel={() => setAccountSuccess("")}
        />
      )}
    </SectionCard>
  );
}
