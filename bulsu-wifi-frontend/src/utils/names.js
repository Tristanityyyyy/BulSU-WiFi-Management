// Accounts are stored as "Last, First Middle" (see admin/users/UserFormModal).
// A greeting should use the name the person actually answers to, so take the
// first name out of that shape; a record that was free-typed without a comma
// falls back to its first word, and a blank name to no name at all.
export function greetingName(fullName) {
  const raw = (fullName || "").trim();
  if (!raw) return "";
  const afterComma = raw.split(",").slice(1).join(",").trim();
  return (afterComma || raw).split(/\s+/)[0] || "";
}
