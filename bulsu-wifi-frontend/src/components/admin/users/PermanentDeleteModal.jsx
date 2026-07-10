import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import * as usersApi from "./usersApi";
import Modal from "../../ui/Modal";

export default function PermanentDeleteModal({ user, ids, onClose, onDeleted, onError }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (user) {
        await usersApi.permanentDelete(user.id, password);
      } else {
        await usersApi.bulkPermanentDelete(ids, password);
      }
      onDeleted();
    } catch (err) {
      onError(err.response?.data?.message || "Failed to permanently delete.");
      setSaving(false);
    }
  };

  const description = user
    ? `This permanently deletes ${user.full_name}. This cannot be undone.`
    : `This permanently deletes ${ids.length} user(s). This cannot be undone.`;

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title="Delete Forever"
      subtitle={description}
      icon={<AlertTriangle size={17} />}
      tone="red"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Confirm your password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
            className="w-full border border-pink-200 dark:border-pink-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
          <button type="submit" disabled={saving || !password}
            className="flex-1 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md disabled:opacity-60 transition">
            {saving ? "Deleting…" : "Delete Forever"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
