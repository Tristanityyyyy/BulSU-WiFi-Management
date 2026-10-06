import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, UserPlus } from "lucide-react";
import PageBackground from "./layout/PageBackground";
import Card from "./layout/Card";
import BulsuHeader from "./layout/BulsuHeader";
import Button from "./ui/Button";
import { API_BASE } from "../config/api";

const inputClass = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition";

export default function RegistrationPage() {
  const [catalog, setCatalog] = useState({ courses: [], sections: [] });
  const [form, setForm] = useState({
    student_number: "",
    last_name: "",
    first_name: "",
    middle_initial: "",
    birthdate: "",
    course_id: "",
    year_level: "",
    section_id: "",
  });
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/auth/registration-options`)
      .then((res) => { if (!cancelled) setCatalog(res.data); })
      .catch(() => { if (!cancelled) setError("Unable to load courses right now. Please try again later."); })
      .finally(() => { if (!cancelled) setLoadingOptions(false); });
    return () => { cancelled = true; };
  }, []);

  const availableSections = catalog.sections.filter(
    (section) => String(section.course_id) === form.course_id
  );
  const availableYears = [...new Set(availableSections.map((section) => section.year_level).filter((year) => year != null))];
  const yearSections = availableSections.filter((section) => String(section.year_level) === form.year_level);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.student_number.length !== 10) {
      setError("Student number must be exactly 10 digits.");
      return;
    }
    if (!policyAccepted) {
      setError("Accept the Terms and Policy before creating an account.");
      return;
    }
    setSubmitting(true);
    try {
      const fullName = `${form.last_name.trim()}, ${form.first_name.trim()}${form.middle_initial.trim() ? ` ${form.middle_initial.trim()}` : ""}`;
      const payload = {
        student_number: form.student_number,
        full_name: fullName,
        birthdate: form.birthdate,
        course_id: form.course_id,
        year_level: form.year_level,
        section_id: form.section_id,
        accepted_terms: policyAccepted,
      };
      const response = await axios.post(`${API_BASE}/auth/register`, payload);
      setSuccess(response.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit registration.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageBackground>
      <Card>
        <BulsuHeader subtitle="Create a student account" />
        {success ? (
          <div className="text-center">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 mb-5">{success}</p>
            <p className="text-sm text-gray-600 mb-5">
              After approval, sign in with your student number and temporary password:
              <span className="block font-mono font-semibold text-gray-800 mt-1">
                {form.last_name.trim()}{form.birthdate.replace(/-/g, "")}
              </span>
              You will be asked to change it when you first log in.
            </p>
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-pink-600 hover:text-pink-700">
              <ArrowLeft size={15} /> Back to login
            </Link>
          </div>
        ) : (
          <>
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Student Number</label>
                <input type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={form.student_number}
                  onChange={(event) => update("student_number", event.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit student number" className={`${inputClass} font-mono`} required />
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Last Name</label>
                <input type="text" autoComplete="family-name" value={form.last_name} onChange={(event) => update("last_name", event.target.value)}
                  placeholder="As shown on your student record" className={inputClass} maxLength={255} required />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">First Name</label>
                  <input type="text" autoComplete="given-name" value={form.first_name} onChange={(event) => update("first_name", event.target.value)}
                    className={inputClass} maxLength={255} required />
                </div>
                <div className="w-20 shrink-0">
                  <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">M.I.</label>
                  <input type="text" value={form.middle_initial} onChange={(event) => update("middle_initial", event.target.value)}
                    className={inputClass} maxLength={10} />
                </div>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Course</label>
                <select value={form.course_id} onChange={(event) => setForm((current) => ({ ...current, course_id: event.target.value, year_level: "", section_id: "" }))}
                  className={inputClass} required disabled={loadingOptions || catalog.courses.length === 0}>
                  <option value="">{loadingOptions ? "Loading courses..." : "Select course"}</option>
                  {catalog.courses.map((course) => <option key={course.id} value={course.id}>{course.code || course.name} - {course.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Year Level</label>
                <select value={form.year_level} onChange={(event) => setForm((current) => ({ ...current, year_level: event.target.value, section_id: "" }))}
                  className={inputClass} required disabled={!form.course_id}>
                  <option value="">Select year</option>
                  {availableYears.map((year) => <option key={year} value={year}>Year {year}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Section</label>
                <select value={form.section_id} onChange={(event) => update("section_id", event.target.value)}
                  className={inputClass} required disabled={!form.year_level}>
                  <option value="">Select section</option>
                  {yearSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-600 block mb-1">Birthday</label>
                <input type="date" value={form.birthdate} onChange={(event) => update("birthdate", event.target.value)}
                  max={new Date().toISOString().split("T")[0]} className={inputClass} required />
              </div>
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={policyAccepted}
                  onChange={(event) => setPolicyAccepted(event.target.checked)}
                  className="mt-0.5 accent-pink-600" required />
                <span>I agree to the Terms and BulSU Acceptable Use Policy.</span>
              </label>
              <Button type="submit" disabled={submitting || loadingOptions || catalog.courses.length === 0 || !policyAccepted}>
                <span className="inline-flex items-center justify-center gap-2"><UserPlus size={16} />{submitting ? "Submitting..." : "Submit registration"}</span>
              </Button>
            </form>
            <p className="text-xs text-gray-500 text-center mt-4">Your account must be approved by an administrator before you can log in.</p>
            <Link to="/" className="flex items-center justify-center gap-1.5 text-xs text-pink-600 font-medium hover:text-pink-700 mt-3">
              <ArrowLeft size={13} /> Back to login
            </Link>
          </>
        )}
      </Card>
    </PageBackground>
  );
}