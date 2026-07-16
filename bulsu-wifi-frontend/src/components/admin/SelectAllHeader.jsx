// Header checkbox shared by admin table headers (users, trash, feedback) whose
// first column selects/deselects every row currently on the page.
export default function SelectAllHeader({ checked, onChange }) {
  return (
    <input type="checkbox" checked={checked} onChange={onChange}
      className="rounded border-gray-300" aria-label="Select all on this page" />
  );
}
