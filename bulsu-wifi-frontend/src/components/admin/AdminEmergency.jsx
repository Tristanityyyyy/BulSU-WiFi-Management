import { useEffect, useState } from "react";
import { Siren, PowerOff, X } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "../ui/Modal";

const PAGE_SIZE = 20;
const TARGET_TYPES = [
  { value: "user", label: "User" },
  { value: "guest", label: "Guest" },
  { value: "section", label: "Section" },
  { value: "course", label: "Course" },
  { value: "role", label: "Role" },
];
const ROLES = ["student", "faculty", "staff"];

const emptyForm = () => ({ targetType: "user", selectedTarget: null, reason: "" });

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
  const [targetType, setTargetType] = useState("user");
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [activating, setActivating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // User picker — multi-select via checkboxes, searched against the users API
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

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
    adminApi.get("/admin/sessions/guests", { params: { status: "active", limit: 50 } }).then((res) => setGuestsList(res.data.sessions)).catch(() => {});
  }, []);

  useEffect(() => {
    if (targetType !== "user" || !userSearch.trim()) { setUserResults([]); return; }
    adminApi.get("/admin/users", { params: { search: userSearch, limit: 8 } })
      .then((res) => setUserResults(res.data.users))
      .catch(() => setUserResults([]));
  }, [userSearch, targetType]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const closeModal = () => {
    setActivateModal(false);
    const f = emptyForm();
    setTargetType(f.targetType);
    setSelectedTarget(f.selectedTarget);
    setReason(f.reason);
    setUserSearch("");
    setUserResults([]);
    setSelectedUsers([]);
    setCatalogFilter("");
    setSelectedCatalog([]);
    setGuestFilter("");
    setSelectedGuestIds([]);
    setFormError("");
  };

  const handleTargetTypeChange = (t) => {
    setTargetType(t);
    setSelectedTarget(null);
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
  const guestOptions = guestsList
    .filter((g) => g.guest_name && g.guest_name.toLowerCase().includes(guestFilter.toLowerCase()))
    .slice(0, 20);

  const courseLabelById = Object.fromEntries((catalog.courses || []).map((c) => [c.id, c.code || c.name]));
  const catalogOptions = (targetType === "section" ? catalog.sections : targetType === "course" ? catalog.courses : [])
    .filter((item) => {
      const text = targetType === "section" ? item.name : `${item.code || ""} ${item.name || ""}`;
      return text.toLowerCase().includes(catalogFilter.toLowerCase());
    })
    .map((item) => ({
      id: item.id,
      label: targetType === "section"
        ? `${item.name}${courseLabelById[item.course_id] ? ` (${courseLabelById[item.course_id]})` : ""}`
        : (item.code || item.name),
    }))
    .slice(0, 20);

  const doActivate = async () => {
    setActivating(true);
    setFormError("");
    try {
      const payload = targetType === "guest"
        ? { reason, target_type: "guest", target_id: selectedGuestIds }
        : targetType === "user"
        ? { reason, target_type: "user", target_id: selectedUsers.map((u) => u.id) }
        : targetType === "section" || targetType === "course"
        ? { reason, target_type: targetType, target_id: selectedCatalog.map((c) => c.id) }
        : { reason, target_type: targetType, target_id: selectedTarget.id };
      await adminApi.post("/admin/emergency", payload);
      closeModal();
      fetchPriorities(1);
      setPage(1);
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to activate.");
    } finally {
      setActivating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (targetType === "guest") {
      if (selectedGuestIds.length === 0) { setFormError("Please select at least one guest."); return; }
      if (selectedGuestIds.length === 1) { await doActivate(); return; }
      setConfirm({ action: "activate", label: `This will activate emergency priority for ${selectedGuestIds.length} guests. Continue?` });
      return;
    }
    if (targetType === "user") {
      if (selectedUsers.length === 0) { setFormError("Please select at least one user."); return; }
      if (selectedUsers.length === 1) { await doActivate(); return; }
      setConfirm({ action: "activate", label: `This will activate emergency priority for ${selectedUsers.length} users. Continue?` });
      return;
    }
    if (targetType === "section" || targetType === "course") {
      if (selectedCatalog.length === 0) { setFormError(`Please select at least one ${targetType}.`); return; }
      setPreviewLoading(true);
      try {
        // The users API filters by a single section/course id, so preview one request per
        // selection and sum — a user belongs to exactly one of each, so no double counting.
        const key = targetType === "course" ? "course_id" : "section_id";
        const totals = await Promise.all(selectedCatalog.map((c) =>
          adminApi.get("/admin/users", { params: { limit: 1, [key]: c.id } }).then((r) => r.data.total)
        ));
        const count = totals.reduce((a, b) => a + b, 0);
        if (count === 0) { setFormError("No users match this target."); return; }
        setConfirm({ action: "activate", label: `This will activate emergency priority for ${count} user(s) — ${selectedCatalog.map((c) => c.label).join(", ")}. Continue?` });
      } catch {
        setFormError("Failed to preview target count.");
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    if (!selectedTarget) { setFormError("Please select a target."); return; }

    setPreviewLoading(true);
    try {
      const res = await adminApi.get("/admin/users", { params: { limit: 1, role: selectedTarget.id } });
      const count = res.data.total;
      if (count === 0) { setFormError("No users match this target."); return; }
      setConfirm({ action: "activate", label: `This will activate emergency priority for ${count} user(s) — ${selectedTarget.label}. Continue?` });
    } catch {
      setFormError("Failed to preview target count.");
    } finally {
      setPreviewLoading(false);
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
            Activating priority grants elevated bandwidth and session persistence to a user, guest, section, course, or role.
            Use only for critical situations. All activations are logged.
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

              {targetType === "user" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                    Select Users {selectedUsers.length > 0 && <span className="text-gray-400 dark:text-gray-500 font-normal">({selectedUsers.length} selected)</span>}
                  </label>
                  <input value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name or student number…"
                    className="w-full border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedUsers.map((u) => (
                        <span key={u.id} className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-full pl-2.5 pr-1 py-0.5 text-xs">
                          {u.full_name}
                          <button type="button" onClick={() => toggleUserSelection(u)}
                            aria-label={`Remove ${u.full_name}`}
                            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-100 transition">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {userSearch.trim() && (
                    <div className="mt-2 border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70 max-h-40 overflow-y-auto">
                      {userResults.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No users match.</p>
                      ) : userResults.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer">
                          <input type="checkbox"
                            checked={selectedUsers.some((s) => s.id === u.id)}
                            onChange={() => toggleUserSelection(u)}
                            className="accent-red-600" />
                          <span className="text-gray-800 dark:text-gray-100">{u.full_name}</span>
                          <span className="text-gray-400 dark:text-gray-500">({u.student_number})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {targetType === "guest" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                    Select Guests {selectedGuestIds.length > 0 && <span className="text-gray-400 dark:text-gray-500 font-normal">({selectedGuestIds.length} selected)</span>}
                  </label>
                  <input value={guestFilter}
                    onChange={(e) => setGuestFilter(e.target.value)}
                    placeholder="Search guest name…"
                    className="w-full border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  <label className="flex items-center gap-2 px-1 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox"
                      checked={guestOptions.length > 0 && guestOptions.every((g) => selectedGuestIds.includes(g.guest_id))}
                      onChange={toggleSelectAllGuests}
                      className="accent-red-600" />
                    Select all {guestFilter ? "matching " : ""}({guestOptions.length})
                  </label>
                  <div className="border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70 max-h-44 overflow-y-auto">
                    {guestOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No connected guests match.</p>
                    ) : guestOptions.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-800 dark:text-gray-100 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer">
                        <input type="checkbox"
                          checked={selectedGuestIds.includes(g.guest_id)}
                          onChange={() => toggleGuestSelection(g.guest_id)}
                          className="accent-red-600" />
                        {g.guest_name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {(targetType === "section" || targetType === "course") && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                    {targetType === "section" ? "Select Sections" : "Select Courses"}
                    {selectedCatalog.length > 0 && <span className="text-gray-400 dark:text-gray-500 font-normal"> ({selectedCatalog.length} selected)</span>}
                  </label>
                  <input value={catalogFilter}
                    onChange={(e) => setCatalogFilter(e.target.value)}
                    placeholder={targetType === "section" ? "Search section name…" : "Search course code or name…"}
                    className="w-full border border-red-200 dark:border-red-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  {selectedCatalog.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedCatalog.map((c) => (
                        <span key={c.id} className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-full pl-2.5 pr-1 py-0.5 text-xs">
                          {c.label}
                          <button type="button" onClick={() => toggleCatalogSelection(c)}
                            aria-label={`Remove ${c.label}`}
                            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-100 transition">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 border border-red-100 dark:border-red-900/60 rounded-xl divide-y divide-red-50 dark:divide-wine-800/70 max-h-40 overflow-y-auto">
                    {catalogOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No matches.</p>
                    ) : catalogOptions.map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-800 dark:text-gray-100 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer">
                        <input type="checkbox"
                          checked={selectedCatalog.some((c) => c.id === opt.id)}
                          onChange={() => toggleCatalogSelection(opt)}
                          className="accent-red-600" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {targetType === "role" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Role</label>
                  <div className="inline-flex rounded-xl border border-red-200 dark:border-red-900 overflow-hidden">
                    {ROLES.map((r) => (
                      <button key={r} type="button"
                        onClick={() => setSelectedTarget({ id: r, label: `Role: ${r[0].toUpperCase() + r.slice(1)}` })}
                        className={`px-3 py-1.5 text-xs font-medium capitalize transition ${selectedTarget?.id === r ? "bg-red-600 text-white" : "bg-white dark:bg-wine-900 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/30"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
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
                <button type="submit" disabled={activating || previewLoading || (
                  targetType === "guest" ? selectedGuestIds.length === 0
                  : targetType === "user" ? selectedUsers.length === 0
                  : targetType === "section" || targetType === "course" ? selectedCatalog.length === 0
                  : !selectedTarget)}
                  className="flex-1 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-red-200 dark:shadow-none disabled:opacity-60 disabled:shadow-none transition">
                  {activating ? "Activating…" : previewLoading ? "Checking…" : "Activate"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doConfirmedAction} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
