import { useState } from "react";
import * as usersApi from "./usersApi";

const REQUIRED_HEADERS = ["student_number", "transition_type"];

// Manages the semester-transition pipeline: parse the registrar xlsx, ask the
// backend to classify + validate the whole batch (nothing is written), preview
// the buckets, then commit atomically. Unlike the new-student import, all
// classification/whitelist logic lives on the backend — this hook just moves the
// file through it. `onReset` clears the caller's file input ref.
export default function useEnrollmentTransition({ onCommitted, onReset }) {
  const [state, setState] = useState(null); // null | preview | committing | done
  const [rows, setRows] = useState([]);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);

  const buildRows = (header, dataRows) => {
    const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
    if (missing.length) {
      alert(`Template mismatch. Missing columns: ${missing.join(", ")}`);
      return null;
    }
    const idx = (name) => header.indexOf(name);
    return dataRows.map((values) => ({
      student_number: values[idx("student_number")]?.trim() || "",
      transition_type: values[idx("transition_type")]?.trim() || "",
      course_code: header.includes("course_code") ? values[idx("course_code")]?.trim() || "" : "",
      section_name: header.includes("section_name") ? values[idx("section_name")]?.trim() || "" : "",
    })).filter((r) => r.student_number || r.transition_type);
  };

  const showPreview = async (parsed) => {
    setRows(parsed);
    try {
      const res = await usersApi.transitionValidate(parsed);
      setValidation(res.data);
      setState("preview");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to validate the transition file.");
    }
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      alert("Please upload the .xlsx transition template.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await usersApi.parseXlsx(ev.target.result);
        const header = res.data.header.map((h) => h.trim().toLowerCase());
        const parsed = buildRows(header, res.data.rows);
        if (parsed) await showPreview(parsed);
      } catch (err) {
        alert(err.response?.data?.message || "Failed to read the Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmCommit = async () => {
    setState("committing");
    try {
      const res = await usersApi.transitionCommit(rows);
      setResult(res.data);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.invalid_rows) {
        setResult({ rejected: true, message: err.response.data.message, invalid_rows: err.response.data.invalid_rows });
      } else {
        setResult({ error: true, message: err.response?.data?.message || "Transition failed." });
      }
    } finally {
      setState("done");
    }
  };

  const reset = () => {
    setState(null);
    setRows([]);
    setValidation(null);
    setResult(null);
    onReset?.();
  };

  const finish = () => {
    reset();
    onCommitted?.();
  };

  const downloadTemplate = async () => {
    try {
      const res = await usersApi.transitionTemplate();
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "semester_transition_template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download the transition template.");
    }
  };

  const invalidRowNumbers = new Set((validation?.invalid_rows || []).map((r) => r.row));

  return {
    state, rows, validation, result,
    handleFileSelected, downloadTemplate,
    confirmCommit, reset, finish,
    invalidRowNumbers,
  };
}
