import { useState } from "react";
import { KeyRound } from "lucide-react";
import * as usersApi from "./usersApi";
import Modal from "../../ui/Modal";

export default function ResetPasswordModal({ user, onClose, onReset }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await usersApi.resetPassword(user.id, password);
      setNewPassword(res.data.password);
      onReset?.();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password.");
      setSaving(false);
    }
  };

  if (newPassword) {
    return (
      <Modal onClose={onClose} size="sm" title="Password Reset" subtitle={`${user.full_name}'s password has been reset.`} icon={<KeyRound size={17} />}>
        <div className="bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 mb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">New password</p>
          <p className="text-sm font-mono font-semibold text-pink-700 dark:text-pink-300">{newPassword}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Share this with the user so they can log in. They'll be asked to set a new password on their next login.</p>
        </div>
        <button type="button" onClick={onClose}
          className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none transition">
          Done
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title="Reset Password"
      subtitle={`Reset ${user.full_name}'s password to the default (LastName + birthdate)?`}
      icon={<KeyRound size={17} />}
    >
      {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Confirm your password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
            className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
          <button type="submit" disabled={saving || !password}
            className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-60 transition">
            {saving ? "Resetting…" : "Reset Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
