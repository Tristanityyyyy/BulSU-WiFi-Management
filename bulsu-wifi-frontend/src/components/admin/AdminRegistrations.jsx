import { useEffect, useState } from "react";
import { Check, ClipboardList, Eye, X } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import Modal from "../ui/Modal";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "all", label: "All requests" },
];

const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

function RequestDetails({ request, onClose }) {
  const details = [
    ["Role", request.role[0].toUpperCase() + request.role.slice(1)],
    ["Account ID", request.student_number],
    ["Full name", request.full_name],
    ["Email", request.email || "—"],
    ["Birthday", request.birth_date],
    ...(request.role === "student" ? [
      ["Course", [request.course_code, request.course_name].filter(Boolean).join(" - ") || "—"],
      ["Year level", request.year_level > 0 ? `Year ${request.year_level}` : "—"],
      ["Section", request.section_name || "—"],
    ] : []),
    ["Submitted", formatDate(request.created_at)],
    ["Terms accepted", formatDate(request.accepted_terms_at)],
    ["Status", request.status[0].toUpperCase() + request.status.slice(1)],
    ["Reviewed", formatDate(request.reviewed_at)],
    ...(request.status === "approved" ? [["Credential email", request.email_status || "Not sent"]] : []),
    ...(request.email_error ? [["Email error", request.email_error]] : []),
  ];

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title="Registration Request"
      subtitle={`Request #${request.id}`}
      icon={<Eye size={16} />}
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</dt>
            <dd className="text-sm text-gray-800 dark:text-gray-100 mt-0.5 wrap-break-word">{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export default function AdminRegistrations() {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [viewing, setViewing] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi.get("/admin/registrations", { params: { status } })
      .then((response) => {
        if (!cancelled) setRequests(response.data.requests || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Unable to load registration requests.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [status]);

  const completeDecision = async () => {
    if (!confirmation) return;
    const { action, request } = confirmation;
    setConfirmation(null);
    setError("");
    setSuccess("");
    try {
      const response = await adminApi.patch(`/admin/registrations/${request.id}/${action}`);
      const resultStatus = action === "approve" ? "approved" : "denied";
      setSuccess(response.data.message || `${request.full_name}'s request was ${resultStatus}.`);
      if (status === "all") {
        setRequests((current) => current.map((item) => item.id === request.id
          ? {
            ...item,
            status: resultStatus,
            email_status: action === "approve" ? (response.data.email_sent ? "sent" : "failed") : null,
          }
          : item));
      } else {
        setRequests((current) => current.filter((item) => item.id !== request.id));
      }
    } catch (err) {
      setError(err.response?.data?.message || `Unable to ${action} this request.`);
    }
  };

  const resendEmail = async (request) => {
    setResendingId(request.id);
    setError("");
    setSuccess("");
    try {
      const response = await adminApi.patch(`/admin/registrations/${request.id}/resend-email`);
      setSuccess(response.data.message);
      setRequests((current) => current.map((item) => item.id === request.id
        ? { ...item, email_status: response.data.email_sent ? "sent" : "failed", email_error: null }
        : item));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to resend the credential email.");
    } finally {
      setResendingId(null);
    }
  };

  const rows = requests.map((request) => (
    <>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(request.created_at)}</td>
      <td className="px-4 py-3 text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">{request.student_number}</td>
      <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-100">{request.full_name}</td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{request.email || "—"}</td>
      <td className="px-4 py-3 text-xs capitalize text-gray-600 dark:text-gray-300">{request.role}</td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
        {request.role === "student" ? <>
          {request.course_code || request.course_name || "—"}
          <span className="block text-gray-400 dark:text-gray-500">
            {request.year_level > 0 ? `Year ${request.year_level}` : "Year not set"}{request.section_name ? ` · ${request.section_name}` : ""}
          </span>
        </> : "—"}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          request.status === "pending"
            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900"
            : request.status === "approved"
              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900"
              : "bg-gray-100 dark:bg-wine-800 text-gray-600 dark:text-gray-300"
        }`}>
          {request.status[0].toUpperCase() + request.status.slice(1)}
        </span>
      </td>
      <td className="px-4 py-3">
        {request.status === "approved" ? (
          <span className={`text-xs ${request.email_status === "sent" ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
            {request.email_status === "sent" ? "Sent" : request.email_status === "failed" ? "Failed" : "Pending"}
          </span>
        ) : <span className="text-xs text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => setViewing(request)} title="View request"
            className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-pink-600">
            <Eye size={13} /> View
          </button>
          {request.status === "pending" && (
            <>
              <button type="button" onClick={() => setConfirmation({ action: "approve", request })} title="Approve request"
                className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
                <Check size={13} /> Approve
              </button>
              <button type="button" onClick={() => setConfirmation({ action: "deny", request })} title="Deny request"
                className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline">
                <X size={13} /> Deny
              </button>
            </>
          )}
          {request.status === "approved" && request.email_status !== "sent" && request.can_resend_email && (
            <button type="button" onClick={() => resendEmail(request)} disabled={resendingId === request.id}
              className="text-xs text-pink-600 dark:text-pink-400 hover:underline disabled:opacity-50">
              {resendingId === request.id ? "Sending..." : "Resend email"}
            </button>
          )}
        </div>
      </td>
    </>
  ));

  const confirmApprove = confirmation?.action === "approve";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-pink-600 dark:text-pink-400" />
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Account Registration Requests</h2>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
          Status
          <select value={status} onChange={(event) => { setLoading(true); setError(""); setStatus(event.target.value); }}
            className="border border-slate-200 dark:border-wine-800 rounded-lg px-3 py-2 bg-white dark:bg-wine-900 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400">
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">{error}</p>}
      {success && <p role="status" className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl px-3 py-2">{success}</p>}

      <AdminTable
        columns={["Submitted", "Account ID", "Name", "Email", "Role", "Course / Section", "Status", "Email", "Actions"]}
        rows={rows}
        loading={loading}
        emptyText={status === "pending" ? "No pending registration requests." : "No registration requests found."}
        emptyHint={status === "pending" ? "New account requests will appear here for review." : undefined}
      />

      {viewing && <RequestDetails request={viewing} onClose={() => setViewing(null)} />}
      {confirmation && (
        <ConfirmDialog
          title={confirmApprove ? "Approve this registration?" : "Deny this registration?"}
          message={confirmApprove
            ? `${confirmation.request.full_name} will receive an active ${confirmation.request.role} account and must change the temporary password at first login.`
            : `${confirmation.request.full_name}'s request will be denied. No account will be created.`}
          confirmLabel={confirmApprove ? "Approve" : "Deny request"}
          danger={!confirmApprove}
          onConfirm={completeDecision}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}