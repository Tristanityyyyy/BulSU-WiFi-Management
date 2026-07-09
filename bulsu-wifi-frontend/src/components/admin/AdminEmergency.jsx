import { useEffect, useRef, useState } from "react";
import { Siren, PowerOff, X } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "../ui/Modal";
import Toast from "../ui/Toast";

const PAGE_SIZE = 20;
const TARGET_TYPES = [
  { value: "student", label: "Student" },
  { value: "faculty", label: "Faculty" },
  { value: "staff", label: "Staff" },
  { value: "guest", label: "Guest" },
  { value: "section", label: "Section" },
  { value: "course", label: "Course" },
];
// student/faculty/staff all pick individual people the same way (search + checkbox list against
// /admin/users, scoped by role) — they share one picker instance instead of three copies.
const PERSON_TARGET_TYPES = ["student", "faculty", "staff"];
const PERSON_LABELS = { student: "Students", faculty: "Faculty", staff: "Staff" };

// Shared UI for every multi-select target picker (user/guest/section/course): a filter box,
// removable chips for what's selected, and a checkbox list of matches. Keeping this in one place
// means all four pickers behave identically instead of each reimplementing the same pattern.
function CheckboxTargetPicker({
  label, filterValue, onFilterChange, placeholder,
  options, getId, getLabel, getSublabel,
  selectedIds, onToggle, chips, onRemoveChip,
  showSelectAll, allVisibleSelected, onToggleAll,
  emptyText, requireFilter, totalCount,
}) {
  const selectedCount = chips ? chips.length : selectedIds.length;
  const isTruncated = typeof totalCount === "number" && totalCount > options.length;
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
        {label} {selectedCount > 0 && <span className="text-gray-400 dark:text-gray-500 font-normal">({selectedCount} selected)</span>}
      </label>
      <input value={filterValue}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />

      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {chips.map((c) => (
            <span key={getId(c)} className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-full pl-2.5 pr-1 py-0.5 text-xs">
              {getLabel(c)}
              <button type="button" onClick={() => onRemoveChip(c)}
                aria-label={`Remove ${getLabel(c)}`}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-100 transition">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {showSelectAll && (
        <label className="flex items-center gap-2 px-1 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={allVisibleSelected} onChange={onToggleAll} className="accent-red-600" />
          Select all {filterValue ? "matching " : ""}({options.length}{isTruncated ? " shown" : ""})
        </label>
      )}

      {(!requireFilter || filterValue.trim()) && (
        <div className="mt-2 border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70 max-h-40 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">{emptyText}</p>
          ) : options.map((opt) => (
            <label key={getId(opt)} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer">
              <input type="checkbox"
                checked={selectedIds.includes(getId(opt))}
                onChange={() => onToggle(opt)}
                className="accent-red-600" />
              <span className="text-gray-800 dark:text-gray-100">{getLabel(opt)}</span>
              {getSublabel && <span className="text-gray-400 dark:text-gray-500">({getSublabel(opt)})</span>}
            </label>
          ))}
        </div>
      )}
      {isTruncated && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
          Showing {options.length} of {totalCount} — refine your search to narrow this down.
        </p>
      )}
    </div>
  );
}

export default function AdminEmergency() {
  const [priorities, setPriorities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // List filters/sort
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [sortKey, setSortKey] = useState("activated_at");
  const [sortDir, setSortDir] = useState("desc");

  // Activate modal
  const [activateModal, setActivateModal] = useState(false);
  const [targetType, setTargetType] = useState("student");
  const [reason, setReason] = useState("");
  const [activating, setActivating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  // User picker — multi-select via checkboxes, searched against the users API
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userResultsTotal, setUserResultsTotal] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState([]);

  // Bumped whenever the modal is closed/reset, so a preview request that resolves after the
  // admin already backed out doesn't pop a confirm dialog for a selection they abandoned.
  const requestGen = useRef(0);

  // Section/Course picker — multi-select via checkboxes, filtered client-side
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const [catalogFilter, setCatalogFilter] = useState("");
  const [selectedCatalog, setSelectedCatalog] = useState([]);

  // Guest picker — multi-select via checkboxes, unlike the single-pick pickers above
  const [guestsList, setGuestsList] = useState([]);
  const [guestFilter, setGuestFilter] = useState("");
  const [selectedGuestIds, setSelectedGuestIds] = useState([]);

  const [confirm, setConfirm] = useState(null);

  const fetchPriorities = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/emergency", {
        params: { page: p, limit: PAGE_SIZE, search, status: statusFilter, target_type: targetTypeFilter, sort: sortKey, dir: sortDir },
      });
      setPriorities(res.data.priorities);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPriorities(1); setPage(1); }, [search, statusFilter, targetTypeFilter, sortKey, sortDir]);
  useEffect(() => { fetchPriorities(page); }, [page]);

  useEffect(() => {
    adminApi.get("/admin/settings/catalog").then((res) => setCatalog(res.data)).catch(() => {});
    // 200 comfortably covers a mass-connect event; the truncation hint below still guards
    // against any larger crowd instead of silently dropping people from "Select all".
    adminApi.get("/admin/sessions/guests", { params: { status: "active", limit: 200 } }).then((res) => setGuestsList(res.data.sessions)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!PERSON_TARGET_TYPES.includes(targetType) || !userSearch.trim()) { setUserResults([]); setUserResultsTotal(0); return; }
    adminApi.get("/admin/users", { params: { search: userSearch, role: targetType, limit: 8 } })
      .then((res) => { setUserResults(res.data.users); setUserResultsTotal(res.data.total ?? res.data.users.length); })
      .catch(() => { setUserResults([]); setUserResultsTotal(0); });
  }, [userSearch, targetType]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const closeModal = () => {
    // Invalidates any in-flight preview call so it can't pop a confirm dialog for a selection
    // the admin already backed out of, and immediately un-sticks the Activate button instead of
    // waiting for that stale request to settle.
    requestGen.current += 1;
    setActivateModal(false);
    setTargetType("student");
    setReason("");
    setUserSearch("");
    setUserResults([]);
    setUserResultsTotal(0);
    setSelectedUsers([]);
    setCatalogFilter("");
    setSelectedCatalog([]);
    setGuestFilter("");
    setSelectedGuestIds([]);
    setFormError("");
    setPreviewLoading(false);
    setConfirm(null);
  };

  const handleTargetTypeChange = (t) => {
    setTargetType(t);
    setUserSearch("");
    setUserResults([]);
    setSelectedUsers([]);
    setCatalogFilter("");
    setSelectedCatalog([]);
    setGuestFilter("");
    setSelectedGuestIds([]);
  };

  const toggleCatalogSelection = (opt) => {
    setSelectedCatalog((prev) => prev.some((c) => c.id === opt.id)
      ? prev.filter((c) => c.id !== opt.id)
      : [...prev, opt]);
  };

  const toggleUserSelection = (user) => {
    setSelectedUsers((prev) => prev.some((u) => u.id === user.id)
      ? prev.filter((u) => u.id !== user.id)
      : [...prev, { id: user.id, full_name: user.full_name, student_number: user.student_number }]);
  };

  const toggleGuestSelection = (guestId) => {
    setSelectedGuestIds((prev) => prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId]);
  };

  const toggleSelectAllGuests = () => {
    const visibleIds = guestOptions.map((g) => g.guest_id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedGuestIds.includes(id));
    setSelectedGuestIds((prev) => allVisibleSelected
      ? prev.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...prev, ...visibleIds])));
  };

  // guestsList holds currently-active guest_sessions (fetched with status=active), so every
  // entry here is a guest who's actually connected right now — the only ones worth prioritizing.
  // Kept unsliced (guestMatches) alongside the display-capped guestOptions so the picker can show
  // a truncation hint instead of silently hiding matches beyond the cap.
  const guestMatches = guestsList
    .filter((g) => g.guest_name && g.guest_name.toLowerCase().includes(guestFilter.toLowerCase()));
  const guestOptions = guestMatches.slice(0, 20);

  const courseLabelById = Object.fromEntries((catalog.courses || []).map((c) => [c.id, c.code || c.name]));
  const catalogMatches = (targetType === "section" ? catalog.sections : targetType === "course" ? catalog.courses : [])
    .filter((item) => {
      const text = targetType === "section" ? item.name : `${item.code || ""} ${item.name || ""}`;
      return text.toLowerCase().includes(catalogFilter.toLowerCase());
    })
    .map((item) => ({
      id: item.id,
      label: targetType === "section"
        ? `${item.name}${courseLabelById[item.course_id] ? ` (${courseLabelById[item.course_id]})` : ""}`
        : (item.code || item.name),
    }));
  const catalogOptions = catalogMatches.slice(0, 20);

  // Target selection, as (isEmpty, payload-shaped-id) — same shape the backend expects for
  // both the preview and create endpoints, so there's exactly one place that knows the mapping.
  const getTargetId = () => {
    if (targetType === "guest") return selectedGuestIds;
    if (PERSON_TARGET_TYPES.includes(targetType)) return selectedUsers.map((u) => u.id);
    return selectedCatalog.map((c) => c.id); // section/course
  };
  const hasSelection = () => {
    if (targetType === "guest") return selectedGuestIds.length > 0;
    if (PERSON_TARGET_TYPES.includes(targetType)) return selectedUsers.length > 0;
    return selectedCatalog.length > 0; // section/course
  };

  const doActivate = async () => {
    setActivating(true);
    setFormError("");
    try {
      const res = await adminApi.post("/admin/emergency", { reason: reason.trim(), target_type: targetType, target_id: getTargetId() });
      closeModal();
      fetchPriorities(1);
      setPage(1);
      const { activated, already_active, already_active_names } = res.data;
      setToast(activated > 0
        ? `Activated priority for ${activated} ${activated === 1 ? "target" : "targets"}.${already_active ? ` ${already_active_names} already had priority and ${already_active === 1 ? "was" : "were"} skipped.` : ""}`
        : `${already_active_names} already ${already_active === 1 ? "has" : "have"} an active priority.`);
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to activate.");
    } finally {
      setActivating(false);
    }
  };

  // Single user/guest selections are unambiguous (exactly one person, no resolution needed) and
  // activate immediately. Everything else — multi-select or a criterion (section/course/role) that
  // resolves to an unknown number of people — gets one batched preview call and a single confirm
  // step, instead of the old per-target-type branches with their own preview/skip rules.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!hasSelection()) { setFormError(`Please select at least one ${targetType}.`); return; }
    if (!reason.trim()) { setFormError("Please describe the reason for this activation."); return; }

    const skipPreview = (PERSON_TARGET_TYPES.includes(targetType) && selectedUsers.length === 1)
      || (targetType === "guest" && selectedGuestIds.length === 1);
    if (skipPreview) { await doActivate(); return; }

    const gen = requestGen.current;
    setPreviewLoading(true);
    try {
      const res = await adminApi.post("/admin/emergency/preview", { target_type: targetType, target_id: getTargetId() });
      if (requestGen.current !== gen) return; // modal was closed/reset while this was in flight
      const { count, already_active, already_active_names, target_label } = res.data;
      if (count === 0) {
        setFormError(already_active > 0 ? `Already has an active priority: ${already_active_names}.` : "No users match this target.");
        return;
      }
      const skipNote = already_active > 0 ? ` (${already_active} already active — ${already_active_names} — will be skipped)` : "";
      setConfirm({ action: "activate", label: `This will activate emergency priority for ${count} ${count === 1 ? "user" : "users"} — ${target_label}${skipNote}. Continue?` });
    } catch (err) {
      if (requestGen.current !== gen) return;
      setFormError(err.response?.data?.message || "Failed to preview target.");
    } finally {
      if (requestGen.current === gen) setPreviewLoading(false);
    }
  };

  const doConfirmedAction = async () => {
    const c = confirm;
    setConfirm(null);
    if (c.action === "activate") { await doActivate(); return; }
    if (c.action === "deactivate-single") await adminApi.patch(`/admin/emergency/${c.id}/deactivate`);
    if (c.action === "deactivate-batch") await adminApi.patch(`/admin/emergency/batch/${c.batchId}/deactivate`);
    fetchPriorities(page);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = [
    { key: "target_label", label: "Target" },
    "Reason",
    "Activated By",
    { key: "activated_at", label: "Activated At" },
    { key: "status", label: "Status" },
    "Actions",
  ];
  const rows = priorities.map((p) => (
    <>
      <td className="px-4 py-2 text-gray-800 dark:text-gray-100 text-sm">
        {p.target_label}
        {p.user_count > 1 && (
          <span className="ml-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-wine-800 rounded-full px-1.5 py-0.5">{p.user_count}</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm">{p.reason}</td>
      <td className="px-4 py-2 text-gray-600 dark:text-gray-300 text-xs">{p.activated_by_name}</td>
      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{new Date(p.activated_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
          p.status === "active" ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900" : "bg-gray-100 dark:bg-wine-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-wine-700"
        }`}>{p.status}</span>
      </td>
      <td className="px-4 py-2">
        {p.status === "active" && (
          <button onClick={() => setConfirm(p.batch_id
            ? { action: "deactivate-batch", batchId: p.batch_id, label: `Deactivate emergency priority for ${p.target_label} (${p.user_count} users)?` }
            : { action: "deactivate-single", id: p.id, label: `Deactivate emergency priority for ${p.target_label}?` })}
            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
            <PowerOff size={12} /> Deactivate
          </button>
        )}
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      {/* Urgent header banner */}
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl px-5 py-4 flex items-start gap-3">
        <Siren size={22} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Emergency Priority Mode</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
            Activating priority grants elevated bandwidth and session persistence to a student, faculty, staff, guest,
            section, or course. Use only for critical situations. All activations are logged.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Priority List</h2>
        <button onClick={() => setActivateModal(true)}
          className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition">
          <Siren size={13} /> Activate Priority
        </button>
      </div>

      {/* List filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search target or reason…"
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white dark:bg-wine-900 min-w-[200px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
        <select value={targetTypeFilter} onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="">All Target Types</option>
          {TARGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <AdminTable columns={columns} rows={rows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        colWidths={[null, null, "140px", "170px", "90px", "140px"]}
        sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
        emptyText="No emergency priorities found."
        emptyHint="Activate priority above when a critical situation requires elevated access." />

      {/* Activate modal */}
      {activateModal && (
        <Modal
          onClose={closeModal}
          size="md"
          tone="red"
          title="Activate Emergency Priority"
          subtitle="This action is logged and should only be used in critical situations."
          icon={<Siren size={18} />}
        >
          {formError && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 mb-3">{formError}</p>}
          <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Target Type</label>
                <div className="inline-flex rounded-xl border border-red-200 dark:border-red-900 overflow-hidden">
                  {TARGET_TYPES.map((t) => (
                    <button key={t.value} type="button" onClick={() => handleTargetTypeChange(t.value)}
                      className={`px-3 py-1.5 text-xs font-medium transition ${targetType === t.value ? "bg-red-600 text-white" : "bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/30"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {PERSON_TARGET_TYPES.includes(targetType) && (
                <CheckboxTargetPicker
                  label={`Select ${PERSON_LABELS[targetType]}`}
                  filterValue={userSearch}
                  onFilterChange={setUserSearch}
                  placeholder="Search name or ID number…"
                  options={userResults}
                  getId={(u) => u.id}
                  getLabel={(u) => u.full_name}
                  getSublabel={(u) => u.student_number}
                  selectedIds={selectedUsers.map((u) => u.id)}
                  onToggle={toggleUserSelection}
                  chips={selectedUsers}
                  onRemoveChip={toggleUserSelection}
                  emptyText={`No ${PERSON_LABELS[targetType].toLowerCase()} match.`}
                  requireFilter
                  totalCount={userResultsTotal}
                />
              )}

              {targetType === "guest" && (
                <CheckboxTargetPicker
                  label="Select Guests"
                  filterValue={guestFilter}
                  onFilterChange={setGuestFilter}
                  placeholder="Search guest name…"
                  options={guestOptions}
                  getId={(g) => g.guest_id}
                  getLabel={(g) => g.guest_name}
                  selectedIds={selectedGuestIds}
                  onToggle={(g) => toggleGuestSelection(g.guest_id)}
                  showSelectAll
                  allVisibleSelected={guestOptions.length > 0 && guestOptions.every((g) => selectedGuestIds.includes(g.guest_id))}
                  onToggleAll={toggleSelectAllGuests}
                  emptyText="No connected guests match."
                  totalCount={guestMatches.length}
                />
              )}

              {(targetType === "section" || targetType === "course") && (
                <CheckboxTargetPicker
                  label={targetType === "section" ? "Select Sections" : "Select Courses"}
                  filterValue={catalogFilter}
                  onFilterChange={setCatalogFilter}
                  placeholder={targetType === "section" ? "Search section name…" : "Search course code or name…"}
                  options={catalogOptions}
                  getId={(c) => c.id}
                  getLabel={(c) => c.label}
                  selectedIds={selectedCatalog.map((c) => c.id)}
                  onToggle={toggleCatalogSelection}
                  chips={selectedCatalog}
                  onRemoveChip={toggleCatalogSelection}
                  emptyText="No matches."
                  totalCount={catalogMatches.length}
                />
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the emergency situation…"
                  rows={3}
                  className="w-full border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  required />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-slate-200 dark:border-wine-800 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-wine-800/40 transition">Cancel</button>
                <button type="submit" disabled={activating || previewLoading || !hasSelection()}
                  className="flex-1 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-red-200 dark:shadow-none disabled:opacity-60 disabled:shadow-none transition">
                  {activating ? "Activating…" : previewLoading ? "Checking…" : "Activate"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doConfirmedAction} onCancel={() => setConfirm(null)} />}
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
