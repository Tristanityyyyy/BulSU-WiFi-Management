import { useState } from "react";
import * as usersApi from "./usersApi";

// Course/section/enrollment_status only appear in the student template — the faculty/staff
// template omits them, so only these three are ever required. School year/semester are no
// longer per-row columns: every imported student is stamped with whichever period is set as
// current in Settings.
const REQUIRED_HEADERS = ["student_number", "full_name", "birth_date"];

// Mirrors the server's rule (utils/constants.js) so bad numbers are caught in the
// preview instead of coming back as a rejected import.
const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;

// How many rows of a big roster the preview table renders before truncating.
const PREVIEW_ROW_LIMIT = 50;
// Flagged rows past that cut-off are pulled back in so they stay visible, but only up to
// this many: the usual failure is systemic — a roster that was already imported, or a course
// code the catalog doesn't know — and flags every row, which would render the whole file.
const PREVIEW_FLAGGED_ROW_LIMIT = 50;

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

// Manages the whole CSV/XLSX roster import pipeline: file parsing, preview,
// duplicate/invalid-row detection, and the actual import call. `onReset` is called
// whenever the pipeline resets, so the caller can clear its own file input ref —
// this hook intentionally owns no refs itself (a ref must stay in the component
// that renders the DOM node it's attached to).
export default function useCsvImport({ catalog, onImported, onReset }) {
  const [csvState, setCsvState] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [existingStudentNumbers, setExistingStudentNumbers] = useState([]);
  const [showDuplicateNotice, setShowDuplicateNotice] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [importRole, setImportRole] = useState("student");
  const [templateRole, setTemplateRole] = useState("student");

  // course_code only exists in the student template; faculty/staff templates are byte-identical
  // to each other, so this can only distinguish student vs. non-student — not faculty vs. staff.
  const deriveDefaultRole = (header) =>
    header.includes("course_code") ? "student" : (templateRole !== "student" ? templateRole : "faculty");

  const buildRowsFromTable = (header, dataRows) => {
    const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
    if (missing.length) {
      alert(`Template mismatch. Missing columns: ${missing.join(", ")}`);
      return null;
    }
    const idx = (name) => header.indexOf(name);
    return dataRows.map((values) => ({
      student_number: values[idx("student_number")]?.trim() || "",
      full_name: values[idx("full_name")]?.trim() || "",
      birth_date: values[idx("birth_date")]?.trim() || "",
      course_code: values[idx("course_code")]?.trim() || "",
      section_name: values[idx("section_name")]?.trim() || "",
      enrollment_status: values[idx("enrollment_status")]?.trim() || "",
    }));
  };

  const showPreview = async (header, rows) => {
    setImportRole(deriveDefaultRole(header));
    setCsvRows(rows);
    try {
      const res = await usersApi.checkExisting(rows.map((r) => r.student_number));
      const existing = res.data.existing || [];
      setExistingStudentNumbers(existing);
      setShowDuplicateNotice(existing.length > 0);
    } catch {
      setExistingStudentNumbers([]);
    }
    setCsvState("preview");
  };

  const processCsvFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), "").trim();
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length < 2) {
        alert("File must contain a header row and at least one data row.");
        return;
      }
      const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
      const dataRows = lines.slice(1).map((line) => parseCsvLine(line));
      const rows = buildRowsFromTable(header, dataRows);
      if (!rows) return;
      showPreview(header, rows);
    };
    reader.readAsText(file);
  };

  const processXlsxFile = (file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await usersApi.parseXlsx(ev.target.result);
        const header = res.data.header.map((h) => h.trim().toLowerCase());
        const rows = buildRowsFromTable(header, res.data.rows);
        if (!rows) return;
        showPreview(header, rows);
      } catch (err) {
        alert(err.response?.data?.message || "Failed to read the Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      processXlsxFile(file);
    } else {
      processCsvFile(file);
    }
  };

  const confirmCsvImport = async () => {
    setCsvState("importing");
    try {
      const res = await usersApi.csvImport(csvRows, importRole);
      setCsvResult(res.data);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.invalid_rows) {
        setCsvResult({ rejected: true, message: err.response.data.message, invalid_rows: err.response.data.invalid_rows });
      } else {
        setCsvResult({ success: 0, failed: csvRows.length, message: err.response?.data?.message || "Import failed." });
      }
    } finally {
      setCsvState("done");
    }
  };

  const resetCsv = () => {
    setCsvState(null);
    setCsvRows([]);
    setExistingStudentNumbers([]);
    setShowDuplicateNotice(false);
    setCsvResult(null);
    setImportRole("student");
    onReset?.();
  };

  const finishImport = () => {
    resetCsv();
    onImported?.();
  };

  const removeCsvRow = (index) => {
    setCsvRows((prev) => prev.filter((_, i) => i !== index));
  };

  const removeDuplicateRows = () => {
    const remaining = csvRows.filter((r) => !existingStudentNumbers.includes((r.student_number || "").trim()));
    setShowDuplicateNotice(false);
    if (remaining.length === 0) {
      // every row in the file was a duplicate — nothing left to import, so back out
      // to the Users table instead of leaving the admin on an empty preview.
      resetCsv();
    } else {
      setCsvRows(remaining);
    }
  };

  const downloadCsvTemplate = async () => {
    try {
      const res = await usersApi.csvTemplate(templateRole);
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${templateRole}_template.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download template:", err);
      alert("Failed to download template. Check console for details.");
    }
  };

  const isImportRowValid = (row) => {
    if (importRole !== "student") return true;
    if (!row.course_code && !row.section_name) return true;
    if (!row.course_code) return false;
    const course = (catalog.courses || []).find((c) => (c.code || c.name || "").trim().toUpperCase() === row.course_code.trim().toUpperCase());
    if (!course) return false;
    if (!row.section_name) return true;
    return (catalog.sections || []).some((s) => s.course_id === course.id && (s.name || "").trim().toUpperCase() === row.section_name.trim().toUpperCase());
  };
  const isDuplicateRow = (row) => existingStudentNumbers.includes((row.student_number || "").trim());
  // A blank number is left alone here — it fails the server's required-fields check as a
  // single row, whereas a malformed one rejects the whole file. Only flag what's present.
  const hasValidAccountNumber = (row) => {
    const value = (row.student_number || "").trim();
    return !value || ACCOUNT_NUMBER_PATTERN.test(value);
  };
  // A row can trip more than one check — a legacy short number that also already exists in
  // the system, say — but the table can only paint it one colour. Deciding the row's single
  // flag here keeps each banner's count equal to the number of rows actually highlighted in
  // that colour. isImportRowValid() is a no-op for faculty/staff, so "invalid" is student-only.
  const rowFlag = (row) => {
    if (!hasValidAccountNumber(row)) return "badNumber";
    if (isDuplicateRow(row)) return "duplicate";
    if (!isImportRowValid(row)) return "invalid";
    return null;
  };

  const rowFlags = csvRows.map(rowFlag);
  const invalidCsvRowCount = rowFlags.filter((f) => f === "invalid").length;
  const duplicateCsvRowCount = rowFlags.filter((f) => f === "duplicate").length;
  const badNumberCsvRowCount = rowFlags.filter((f) => f === "badNumber").length;
  // removeDuplicateRows drops every row whose number already exists, including any that the
  // flags above filed under badNumber — so the notice offering that has to count them too.
  const existingNumberRowCount = csvRows.filter(isDuplicateRow).length;

  // Large rosters are truncated in the preview, but a flagged row past the cut-off would be
  // invisible *and* unremovable while still blocking the import — so those are pulled back
  // in, up to a cap of their own: the flags that matter at that volume are systemic (a
  // re-imported roster, an unknown course code) and trip every row in the file. The banner
  // counts above stay whole-file regardless.
  // The index travels with the row because the ✕ button removes by position.
  const previewRows = [];
  let hiddenFlaggedRowCount = 0;
  csvRows.forEach((row, index) => {
    const flag = rowFlags[index];
    if (index < PREVIEW_ROW_LIMIT) previewRows.push({ row, index, flag });
    else if (!flag) return;
    else if (previewRows.length < PREVIEW_ROW_LIMIT + PREVIEW_FLAGGED_ROW_LIMIT) previewRows.push({ row, index, flag });
    else hiddenFlaggedRowCount += 1;
  });
  const hiddenPreviewRowCount = csvRows.length - previewRows.length;

  return {
    csvState, csvRows, csvResult,
    importRole, setImportRole, templateRole, setTemplateRole,
    handleFileSelected, downloadCsvTemplate,
    confirmCsvImport, resetCsv, finishImport, removeCsvRow,
    showDuplicateNotice, setShowDuplicateNotice, removeDuplicateRows,
    previewRows, hiddenPreviewRowCount, hiddenFlaggedRowCount,
    previewRowLimit: PREVIEW_ROW_LIMIT,
    invalidCsvRowCount, duplicateCsvRowCount, badNumberCsvRowCount, existingNumberRowCount,
    accountNumberLength: ACCOUNT_NUMBER_LENGTH,
  };
}
