export const TARGET_TYPES = [
  { value: "student", label: "Student" },
  { value: "faculty", label: "Faculty" },
  { value: "staff", label: "Staff" },
  { value: "guest", label: "Guest" },
  { value: "section", label: "Section" },
  { value: "course", label: "Course" },
];

// student/faculty/staff all pick individual people the same way (search + checkbox list against
// /admin/users, scoped by role) — they share one picker instance instead of three copies.
export const PERSON_TARGET_TYPES = ["student", "faculty", "staff"];

// Target selection, as (isEmpty, payload-shaped-id) — same shape the backend expects for
// both the preview and create endpoints, so there's exactly one place that knows the mapping.
export function getTargetId(targetType, { selectedGuestIds, selectedUsers, selectedCatalog }) {
  if (targetType === "guest") return selectedGuestIds;
  if (PERSON_TARGET_TYPES.includes(targetType)) return selectedUsers.map((u) => u.id);
  return selectedCatalog.map((c) => c.id); // section/course
}

export function hasSelection(targetType, { selectedGuestIds, selectedUsers, selectedCatalog }) {
  if (targetType === "guest") return selectedGuestIds.length > 0;
  if (PERSON_TARGET_TYPES.includes(targetType)) return selectedUsers.length > 0;
  return selectedCatalog.length > 0; // section/course
}

// Shared by closeModal and handleTargetTypeChange — both need to blank out every picker's
// filter/selection state, just with a different set of surrounding resets around this core.
export function resetPickers({
  setUserSearch, setUserResults, setUserResultsTotal, setSelectedUsers,
  setCatalogFilter, setSelectedCatalog, setGuestFilter, setSelectedGuestIds,
}) {
  setUserSearch("");
  setUserResults([]);
  setUserResultsTotal(0);
  setSelectedUsers([]);
  setCatalogFilter("");
  setSelectedCatalog([]);
  setGuestFilter("");
  setSelectedGuestIds([]);
}
