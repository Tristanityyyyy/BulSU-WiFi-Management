import { Siren } from "lucide-react";
import Modal from "../../ui/Modal";
import CheckboxTargetPicker from "./CheckboxTargetPicker";
import { TARGET_TYPES, PERSON_TARGET_TYPES } from "./targetHelpers";

const PERSON_LABELS = { student: "Students", faculty: "Faculty", staff: "Staff" };

// Renders the "Activate Emergency Priority" modal. `emergency` is the object returned
// by useEmergencyActivation() — this component only reads/dispatches through it.
export default function ActivateEmergencyModal({ emergency }) {
  if (!emergency.activateModal) return null;

  const {
    closeModal, targetType, handleTargetTypeChange, reason, setReason,
    activating, previewLoading, formError, handleSubmit, hasSelection,
    userSearch, setUserSearch, userResults, userResultsTotal, selectedUsers, toggleUserSelection,
    catalogFilter, setCatalogFilter, selectedCatalog, toggleCatalogSelection, catalogOptions, catalogMatches,
    guestFilter, setGuestFilter, selectedGuestIds, toggleGuestSelection, toggleSelectAllGuests, guestOptions, guestMatches,
  } = emergency;

  return (
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
  );
}
