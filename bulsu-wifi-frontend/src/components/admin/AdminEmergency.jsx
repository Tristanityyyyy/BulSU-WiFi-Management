import { useEffect, useState } from "react";
import { Siren, PowerOff } from "lucide-react";
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

  // User picker
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState([]);

  // Section/Course picker
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const [catalogFilter, setCatalogFilter] = useState("");

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
    setCatalogFilter("");
    setGuestFilter("");
    setSelectedGuestIds([]);
    setFormError("");
  };

  const handleTargetTypeChange = (t) => {
    setTargetType(t);
    setSelectedTarget(null);
    setUserSearch("");
    setUserResults([]);
    setCatalogFilter("");
    setGuestFilter("");
    setSelectedGuestIds([]);
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
    if (!selectedTarget) { setFormError("Please select a target."); return; }
    if (targetType === "user") { await doActivate(); return; }

    setPreviewLoading(true);
    try {
      const params = { limit: 1 };
      if (targetType === "role") params.role = selectedTarget.id;
      if (targetType === "course") params.course_id = selectedTarget.id;
      if (targetType === "section") params.section_id = selectedTarget.id;
      const res = await adminApi.get("/admin/users", { params });
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
      <td className="px-4 py-2 text-gray-800 text-sm">
        {p.target_label}
        {p.user_count > 1 && (
          <span className="ml-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">{p.user_count}</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-700 text-sm">{p.reason}</td>
      <td className="px-4 py-2 text-gray-600 text-xs">{p.activated_by_name}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{new Date(p.activated_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
          p.status === "active" ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-100 text-gray-500 border-gray-200"
        }`}>{p.status}</span>
      </td>
      <td className="px-4 py-2">
        {p.status === "active" && (
          <button onClick={() => setConfirm(p.batch_id
            ? { action: "deactivate-batch", batchId: p.batch_id, label: `Deactivate emergency priority for ${p.target_label} (${p.user_count} users)?` }
            : { action: "deactivate-single", id: p.id, label: `Deactivate emergency priority for ${p.target_label}?` })}
            className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline font-medium">
            <PowerOff size={12} /> Deactivate
          </button>
        )}
      </td>
    </>
  ));

  return (
    <div className="space-y-4">
      {/* Urgent header banner */}
      <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <Siren size={22} className="text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Emergency Priority Mode</p>
          <p className="text-xs text-red-600 mt-0.5">
            Activating priority grants elevated bandwidth and session persistence to a user, guest, section, course, or role.
            Use only for critical situations. All activations are logged.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Priority List</h2>
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
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white min-w-[200px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
        <select value={targetTypeFilter} onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
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
          {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{formError}</p>}
          <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Target Type</label>
                <div className="inline-flex rounded-xl border border-red-200 overflow-hidden">
                  {TARGET_TYPES.map((t) => (
                    <button key={t.value} type="button" onClick={() => handleTargetTypeChange(t.value)}
                      className={`px-3 py-1.5 text-xs font-medium transition ${targetType === t.value ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-red-50"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {targetType === "user" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Search User</label>
                  <input value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setSelectedTarget(null); }}
                    placeholder="Name or student number…"
                    className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  {!selectedTarget && userResults.length > 0 && (
                    <div className="mt-1 border border-red-100 rounded-xl divide-y divide-red-50 max-h-40 overflow-y-auto">
                      {userResults.map((u) => (
                        <button key={u.id} type="button"
                          onClick={() => { setSelectedTarget({ id: u.id, label: u.full_name }); setUserSearch(u.full_name); setUserResults([]); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-red-50">
                          <span className="text-gray-800">{u.full_name}</span>
                          <span className="text-gray-400 ml-1">({u.student_number})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {targetType === "guest" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Select Guests {selectedGuestIds.length > 0 && <span className="text-gray-400 font-normal">({selectedGuestIds.length} selected)</span>}
                  </label>
                  <input value={guestFilter}
                    onChange={(e) => setGuestFilter(e.target.value)}
                    placeholder="Search guest name…"
                    className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  <label className="flex items-center gap-2 px-1 py-2 text-xs font-medium text-gray-600 cursor-pointer">
                    <input type="checkbox"
                      checked={guestOptions.length > 0 && guestOptions.every((g) => selectedGuestIds.includes(g.guest_id))}
                      onChange={toggleSelectAllGuests}
                      className="accent-red-600" />
                    Select all {guestFilter ? "matching " : ""}({guestOptions.length})
                  </label>
                  <div className="border border-red-100 rounded-xl divide-y divide-red-50 max-h-44 overflow-y-auto">
                    {guestOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No connected guests match.</p>
                    ) : guestOptions.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-800 hover:bg-red-50 cursor-pointer">
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
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {targetType === "section" ? "Search Section" : "Search Course"}
                  </label>
                  <input value={catalogFilter}
                    onChange={(e) => { setCatalogFilter(e.target.value); setSelectedTarget(null); }}
                    placeholder={targetType === "section" ? "Section name…" : "Course code or name…"}
                    className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  {!selectedTarget && (
                    <div className="mt-1 border border-red-100 rounded-xl divide-y divide-red-50 max-h-40 overflow-y-auto">
                      {catalogOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>
                      ) : catalogOptions.map((opt) => (
                        <button key={opt.id} type="button"
                          onClick={() => { setSelectedTarget(opt); setCatalogFilter(opt.label); }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-red-50">
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {targetType === "role" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
                  <div className="inline-flex rounded-xl border border-red-200 overflow-hidden">
                    {ROLES.map((r) => (
                      <button key={r} type="button"
                        onClick={() => setSelectedTarget({ id: r, label: `Role: ${r[0].toUpperCase() + r.slice(1)}` })}
                        className={`px-3 py-1.5 text-xs font-medium capitalize transition ${selectedTarget?.id === r ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-red-50"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the emergency situation…"
                  rows={3}
                  className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  required />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-slate-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
                <button type="submit" disabled={activating || previewLoading || (targetType === "guest" ? selectedGuestIds.length === 0 : !selectedTarget)}
                  className="flex-1 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-md shadow-red-200 disabled:opacity-60 disabled:shadow-none transition">
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
