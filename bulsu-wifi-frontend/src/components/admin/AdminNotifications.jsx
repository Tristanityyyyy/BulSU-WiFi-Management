import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import Modal from "../ui/Modal";
import Toast from "../ui/Toast";

const PAGE_SIZE = 20;

export default function AdminNotifications() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterRead, setFilterRead] = useState("");
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({ target: "user", user_id: "", course_id: "", section_id: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });

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
  useEffect(() => {
    adminApi.get("/admin/settings/catalog").then((res) => setCatalog(res.data || { courses: [], sections: [] }));
  }, []);

  const closeCompose = () => {
    setCompose(false);
    setSendError("");
    setSending(false);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSendError("");
    setSending(true);
    try {
      await adminApi.post("/admin/notifications/send", form);
      setSendSuccess(true);
      setCompose(false);
      setSending(false);
      setForm({ target: "user", user_id: "", course_id: "", section_id: "", message: "" });
      fetchNotifications(1);
    } catch (err) {
      setSendError(err.response?.data?.message || "Failed to send.");
      setSending(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["User ID", "Type", "Message", "Sent At", "Status"];
  const sectionOptions = (catalog.sections || []).filter((section) => String(section.course_id) === String(form.course_id));
  const tableRows = rows.map((n) => (
    <>
      <td className="px-4 py-2 text-gray-700 text-xs font-mono">{n.user_id ?? "—"}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${typeStyle(n.type)}`}>{typeLabel(n.type)}</span>
      </td>
      <td className="px-4 py-2 text-gray-700 text-sm max-w-xs truncate">{n.message}</td>
      <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{new Date(n.created_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        {n.is_read ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> Read
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-600">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" /> Unread
          </span>
        )}
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Notifications</h2>
          <p className="text-xs text-gray-400 mt-0.5">Messages delivered to users across the network.</p>
        </div>
        <button onClick={() => { setCompose(true); setSendSuccess(false); }}
          className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-pink-200 transition">
          <Send size={13} /> Compose
        </button>
      </div>

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
        <Modal
          onClose={closeCompose}
          title="Send Notification"
          subtitle="Deliver a message to a user, a section, or everyone."
          icon={<Send size={17} />}
        >
          {sendError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{sendError}</p>}
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Send To</label>
              <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition">
                <option value="user">Specific User</option>
                <option value="section">Course Section</option>
                <option value="all">Everyone</option>
              </select>
            </div>
            {form.target === "user" && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">User ID</label>
                <input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                  required />
              </div>
            )}
            {form.target === "section" && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Course</label>
                  <select value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value, section_id: "" })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                    required>
                    <option value="">Select course</option>
                    {(catalog.courses || []).map((course) => (
                      <option key={course.id} value={course.id}>{course.code || course.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Section</label>
                  <select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition disabled:bg-gray-50 disabled:cursor-not-allowed"
                    required disabled={!form.course_id}>
                    <option value="">Select section</option>
                    {sectionOptions.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3} placeholder="Type your message…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition resize-none"
                required />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeCompose}
                className="flex-1 border border-slate-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
              <button type="submit" disabled={sending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 disabled:opacity-60 transition">
                <Send size={13} />
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {sendSuccess && <Toast message="Notification sent successfully." onDismiss={() => setSendSuccess(false)} />}
    </div>
  );
}

function typeLabel(type) {
  const map = {
    session_warning: "Session Warning",
    data_limit: "Data Limit",
    force_disconnect: "Force Disconnect",
    general: "General",
  };
  return map[type] ?? type;
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
