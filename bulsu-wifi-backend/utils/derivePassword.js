// birth_date arrives as a "YYYY-MM-DD" string when it comes straight from a CSV/XLSX
// row, but as a JS Date when it comes back from a mysql2 SELECT (no `dateStrings`
// option is set on the pool) — normalize both to "YYYY-MM-DD" before validating.
function normalizeBirthDate(birth_date) {
  if (birth_date instanceof Date) {
    const y = birth_date.getFullYear();
    const m = String(birth_date.getMonth() + 1).padStart(2, '0');
    const d = String(birth_date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return birth_date?.trim();
}

// Default password formula used at account creation, CSV import, and admin resets:
// LastName + birthdate (YYYYMMDD). Falls back to the student number, then a fixed
// string, if there's no usable birth date to derive from.
function derivePassword({ birth_date, full_name, student_number }) {
  const birthDate = normalizeBirthDate(birth_date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    const [year, month, day] = birthDate.split('-');
    const lastName = full_name?.split(',')[0]?.trim() || student_number;
    return `${lastName}${year}${month}${day}`;
  }
  return student_number || 'password123';
}

module.exports = { derivePassword };
