import { useEffect, useRef, useState } from "react";
import adminApi from "../adminApi";
import { PERSON_TARGET_TYPES, getTargetId as resolveTargetId, hasSelection as resolveHasSelection, resetPickers } from "./targetHelpers";

// Owns the whole "Activate Emergency Priority" modal: open/close state, the three
// target pickers (person/guest/catalog), the reason field, and the preview→confirm→
// activate flow. `onActivated(toastMessage)` fires after a successful activation so the
// shell can refresh its list; `onNeedsConfirm({action:"activate",label})` fires instead of
// activating immediately when a preview needs a yes/no step first — the confirm dialog
// itself stays owned by the shell since it's shared with the list's deactivate actions.
export default function useEmergencyActivation({ onActivated, onNeedsConfirm }) {
  const [activateModal, setActivateModal] = useState(false);
  const [targetType, setTargetType] = useState("student");
  const [reason, setReason] = useState("");
  const [activating, setActivating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [formError, setFormError] = useState("");

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

  const pickerSetters = {
    setUserSearch, setUserResults, setUserResultsTotal, setSelectedUsers,
    setCatalogFilter, setSelectedCatalog, setGuestFilter, setSelectedGuestIds,
  };

  const openModal = () => setActivateModal(true);

  const closeModal = () => {
    // Invalidates any in-flight preview call so it can't pop a confirm dialog for a selection
    // the admin already backed out of, and immediately un-sticks the Activate button instead of
    // waiting for that stale request to settle.
    requestGen.current += 1;
    setActivateModal(false);
    setTargetType("student");
    setReason("");
    resetPickers(pickerSetters);
    setFormError("");
    setPreviewLoading(false);
  };

  const handleTargetTypeChange = (t) => {
    setTargetType(t);
    resetPickers(pickerSetters);
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

  const selectionState = { selectedGuestIds, selectedUsers, selectedCatalog };
  const getTargetId = () => resolveTargetId(targetType, selectionState);
  const hasSelection = () => resolveHasSelection(targetType, selectionState);

  const activate = async () => {
    setActivating(true);
    setFormError("");
    try {
      const res = await adminApi.post("/admin/emergency", { reason: reason.trim(), target_type: targetType, target_id: getTargetId() });
      closeModal();
      const { activated, already_active, already_active_names } = res.data;
      onActivated(activated > 0
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
    if (skipPreview) { await activate(); return; }

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
      onNeedsConfirm({ action: "activate", label: `This will activate emergency priority for ${count} ${count === 1 ? "user" : "users"} — ${target_label}${skipNote}. Continue?` });
    } catch (err) {
      if (requestGen.current !== gen) return;
      setFormError(err.response?.data?.message || "Failed to preview target.");
    } finally {
      if (requestGen.current === gen) setPreviewLoading(false);
    }
  };

  return {
    activateModal, openModal, closeModal,
    targetType, handleTargetTypeChange, reason, setReason,
    activating, previewLoading, formError,
    handleSubmit, activate, hasSelection,

    userSearch, setUserSearch, userResults, userResultsTotal, selectedUsers, toggleUserSelection,
    catalogFilter, setCatalogFilter, selectedCatalog, toggleCatalogSelection, catalogOptions, catalogMatches,
    guestFilter, setGuestFilter, selectedGuestIds, toggleGuestSelection, toggleSelectAllGuests, guestOptions, guestMatches,
  };
}
