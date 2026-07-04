import { useEffect, useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";

const PAGE_SIZE = 20;

export default function AdminNotifications() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterRead, setFilterRead] = useState("");
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({ target: "user", user_id: "", course_section: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  const fetchNotifications = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/notifications", {
        params: { page: p, limit: PAGE_SIZE, type: filterType, is_read: filterRead },
      });
      setRows(res.data.notifications);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); fetchNotifications(1); }, [filterType, filterRead]);
  useEffect(() => { fetchNotifications(page); }, [page]);

  const handleSend = async (e) => {
    e.preventDefault();
    setSendError("");
    setSending(true);
    try {
      await adminApi.post("/admin/notifications/send", form);
      setSendSuccess(true);
      setCompose(false);
      setForm({ target: "user", user_id: "", course_section: "", message: "" });
      fetchNotifications(1);
    } catch (err) {
      setSendError(err.response?.data?.message || "Failed to send.");
      setSending(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["User ID", "Type", "Message", "Sent At", "Read"];
  const tableRows = rows.map((n) => (
    <>
      <td className="px-4 py-2 text-gray-700 text-xs font-mono">{n.user_id ?? "—"}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${typeStyle(n.type)}`}>{n.type}</span>
      </td>
      <td className="px-4 py-2 text-gray-700 text-sm max-w-xs truncate">{n.message}</td>
      <td className="px-4 py-2 text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        <span className={`text-xs font-medium ${n.is_read ? "text-green-600" : "text-gray-400"}`}>
          {n.is_read ? "Read" : "Unread"}
        </span>
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Notifications</h2>
        <button onClick={() => { setCompose(true); setSendSuccess(false); }}
          className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
          <Send size={13} /> Compose
        </button>
      </div>

      {sendSuccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={15} className="text-green-600 shrink-0" />
          Notification sent successfully.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Types</option>
          <option value="session_warning">Session Warning</option>
          <option value="data_limit">Data Limit</option>
          <option value="force_disconnect">Force Disconnect</option>
          <option value="general">General</option>
        </select>
        <select value={filterRead} onChange={(e) => setFilterRead(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All</option>
          <option value="0">Unread</option>
          <option value="1">Read</option>
        </select>
      </div>

      <AdminTable columns={columns} rows={tableRows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        emptyText="No notifications found."
        emptyHint="Notifications sent to users will appear here. Use Compose to send a new one." />

      {/* Compose modal */}
      {compose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="font-semibold text-gray-800 mb-4">Send Notification</p>
            {sendError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{sendError}</p>}
            <form onSubmit={handleSend} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Send To</label>
                <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                  className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
                  <option value="user">Specific User</option>
                  <option value="section">Course Section</option>
                  <option value="all">Everyone</option>
                </select>
              </div>
              {form.target === "user" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">User ID</label>
                  <input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                    required />
                </div>
              )}
              {form.target === "section" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Course Section</label>
                  <input value={form.course_section} onChange={(e) => setForm({ ...form, course_section: e.target.value })}
                    placeholder="e.g. BSCS-3A"
                    className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                    required />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Message</label>
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={3} placeholder="Type your message…"
                  className="w-full border border-pink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
                  required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setCompose(false); setSendError(""); }}
                  className="flex-1 border border-pink-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={sending}
                  className="flex-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl py-2 text-sm font-semibold shadow-md disabled:opacity-60">
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function typeStyle(type) {
  const map = {
    session_warning: "bg-orange-50 text-orange-600 border-orange-200",
    data_limit: "bg-red-50 text-red-600 border-red-200",
    force_disconnect: "bg-red-50 text-red-700 border-red-200",
    general: "bg-pink-50 text-pink-700 border-pink-200",
  };
  return map[type] ?? "bg-gray-100 text-gray-500 border-gray-200";
}
