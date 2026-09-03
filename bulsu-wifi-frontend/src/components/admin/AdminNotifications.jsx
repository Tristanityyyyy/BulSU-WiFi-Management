import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import Modal from "../ui/Modal";
import Toast from "../ui/Toast";

const PAGE_SIZE = 20;
const RECIPIENT_RESULT_LIMIT = 8;
const EMPTY_FORM = { target: "user", recipient: null, course_id: "", section_id: "", message: "" };

export default function AdminNotifications() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterRead, setFilterRead] = useState("");
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  // Recipient lookup for "Specific User". Composing used to mean typing a raw
  // database id into a blank box: an id nobody holds was a failed send, and an
  // id somebody else holds was a message delivered to the wrong person with
  // nothing on screen to reveal it. Searching by name or student number and
  // picking from the results is the only way the admin can see who they are
  // actually addressing before pressing Send.
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  // Which query the results on screen belong to, so a list left over from an
  // earlier search is never offered as an answer to the current one.
  const [recipientResultsFor, setRecipientResultsFor] = useState("");

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

  useEffect(() => {
    const query = form.target === "user" ? recipientSearch.trim() : "";
    if (!query) return;
    // A slower response for an earlier query must not overwrite the list the
    // admin is looking at — landing out of order here would put someone else's
    // name under the pointer at the moment of clicking.
    let cancelled = false;
    adminApi.get("/admin/users", { params: { search: query, limit: RECIPIENT_RESULT_LIMIT } })
      .then((res) => {
        if (cancelled) return;
        setRecipientResults(res.data.users);
        setRecipientTotal(res.data.total ?? res.data.users.length);
        setRecipientResultsFor(query);
      })
      .catch(() => {
        if (cancelled) return;
        setRecipientResults([]);
        setRecipientTotal(0);
        setRecipientResultsFor(query);
      });
    return () => { cancelled = true; };
  }, [recipientSearch, form.target]);

  const clearRecipient = () => {
    setRecipientSearch("");
    setRecipientResults([]);
    setRecipientTotal(0);
    setRecipientResultsFor("");
  };

  const closeCompose = () => {
    setCompose(false);
    setSendError("");
    setSending(false);
    clearRecipient();
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSendError("");
    setSending(true);
    try {
      const res = await adminApi.post("/admin/notifications/send", {
        target: form.target,
        user_id: form.recipient?.id,
        course_id: form.course_id,
        section_id: form.section_id,
        message: form.message,
      });
      // Name who it reached, not just that something happened — a send is only
      // worth confirming if the confirmation says who received it.
      const { sent, target_name: targetName } = res.data || {};
      setSendSuccess(`Sent to ${targetName || "the selected recipients"} (${sent} recipient${sent === 1 ? "" : "s"}).`);
      setCompose(false);
      setSending(false);
      setForm(EMPTY_FORM);
      clearRecipient();
      fetchNotifications(1);
    } catch (err) {
      setSendError(err.response?.data?.message || "Failed to send.");
      setSending(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["Recipient", "Type", "Message", "Sent At", "Status"];
  const sectionOptions = (catalog.sections || []).filter((section) => String(section.course_id) === String(form.course_id));
  const tableRows = rows.map((n) => (
    <>
      <td className="px-4 py-2 text-xs">
        {n.recipient_name ? (
          <>
            <span className="text-gray-700 dark:text-gray-300">{n.recipient_name}</span>
            <span className="block text-gray-400 dark:text-gray-500 font-mono">{n.recipient_number}</span>
          </>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 italic">Deleted account</span>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${typeStyle(n.type)}`}>{typeLabel(n.type)}</span>
      </td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm max-w-xs truncate">{n.message}</td>
      <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{new Date(n.created_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        {n.is_read ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> Read
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-600 dark:text-pink-400">
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
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Notifications</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Messages delivered to users across the network.</p>
        </div>
        <button onClick={() => { setCompose(true); setSendSuccess(false); }}
          className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-pink-200 dark:shadow-none transition">
          <Send size={13} /> Compose
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
          <option value="">All Types</option>
          <option value="session_warning">Session Warning</option>
          <option value="data_limit">Data Limit</option>
          <option value="force_disconnect">Force Disconnect</option>
          <option value="general">General</option>
        </select>
        <select value={filterRead} onChange={(e) => setFilterRead(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
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
          {sendError && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">{sendError}</p>}
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Send To</label>
              <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition">
                <option value="user">Specific User</option>
                <option value="section">Course Section</option>
                <option value="all">Everyone</option>
              </select>
            </div>
            {form.target === "user" && (
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Recipient</label>
                {form.recipient ? (
                  <div className="flex items-center justify-between gap-2 border border-pink-200 dark:border-pink-900 bg-pink-50 dark:bg-pink-950/30 rounded-xl px-3 py-2">
                    <span className="text-sm text-pink-800 dark:text-pink-200 truncate">
                      {form.recipient.full_name}
                      <span className="text-pink-500 dark:text-pink-400 font-mono text-xs ml-1.5">{form.recipient.student_number}</span>
                    </span>
                    <button type="button" onClick={() => { setForm({ ...form, recipient: null }); clearRecipient(); }}
                      aria-label={`Remove ${form.recipient.full_name}`}
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-pink-600 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/50 transition">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Search by name or student number…"
                      className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition" />
                    {recipientSearch.trim() && (
                      <div className="mt-2 border border-pink-100 dark:border-pink-900/60 rounded-xl divide-y divide-pink-50 dark:divide-wine-800/70 max-h-40 overflow-y-auto">
                        {recipientResultsFor !== recipientSearch.trim() ? (
                          <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Searching…</p>
                        ) : recipientResults.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No account matches that name or number.</p>
                        ) : recipientResults.map((user) => (
                          <button type="button" key={user.id}
                            onClick={() => { setForm({ ...form, recipient: user }); clearRecipient(); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-pink-50 dark:hover:bg-pink-950/30 transition">
                            <span className="text-gray-800 dark:text-gray-100">{user.full_name}</span>
                            <span className="text-gray-400 dark:text-gray-500 font-mono ml-1.5">{user.student_number}</span>
                            <span className="text-gray-400 dark:text-gray-500 ml-1.5">· {user.role}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {recipientResultsFor === recipientSearch.trim() && recipientTotal > recipientResults.length && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                        Showing {recipientResults.length} of {recipientTotal} — keep typing to narrow this down.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {form.target === "section" && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Course</label>
                  <select value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value, section_id: "" })}
                    className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                    required>
                    <option value="">Select course</option>
                    {(catalog.courses || []).map((course) => (
                      <option key={course.id} value={course.id}>{course.code || course.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Section</label>
                  <select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                    className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition disabled:bg-gray-50 disabled:cursor-not-allowed"
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
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3} placeholder="Type your message…"
                className="w-full border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition resize-none"
                required />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeCompose}
                className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
              <button type="submit" disabled={sending || (form.target === "user" && !form.recipient)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-60 transition">
                <Send size={13} />
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {sendSuccess && <Toast message={sendSuccess} onDismiss={() => setSendSuccess("")} />}
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
    session_warning: "bg-orange-50 dark:bg-orange-950/30 text-orange-600 border-orange-200",
    data_limit: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900",
    force_disconnect: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
    general: "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-900",
  };
  return map[type] ?? "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-wine-700";
}
