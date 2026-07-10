import { useState } from "react";

// Generic checkbox-selection state for a paginated list. `toggleAllOnPage` takes
// the current page's items (each needs an `id`) so it can be reused for any list.
export default function useSelectableSet() {
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = (items) => {
    const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((item) => (allSelected ? next.delete(item.id) : next.add(item.id)));
      return next;
    });
  };

  const clear = () => setSelected(new Set());

  return { selected, toggle, toggleAllOnPage, clear };
}
