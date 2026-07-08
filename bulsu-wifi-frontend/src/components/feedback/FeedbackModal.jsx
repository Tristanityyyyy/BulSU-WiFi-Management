import { useState } from "react";
import { MessageSquareHeart, Star } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import AlertBanner from "../ui/AlertBanner";

const MAX_COMMENT = 500;
const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export default function FeedbackModal({ onSubmit, onCancel }) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const active = hovered || stars;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ stars, comment: comment.trim() });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit feedback. Please try again.");
      setSubmitting(false);
    }
  };
  const handleCancel = () => { setStars(0); setHovered(0); setComment(""); onCancel(); };

  return (
    <Modal
      onClose={handleCancel}
      title="Rate your experience"
      subtitle="How was your session with BulSU Wi-Fi?"
      icon={<MessageSquareHeart size={18} />}
    >
      <AlertBanner message={error} />
      <div className="flex justify-center gap-1.5 mb-2" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStars(s)}
            onMouseEnter={() => setHovered(s)}
            aria-label={`${s} star${s > 1 ? "s" : ""}`}
            className="p-1 transition-transform duration-150 hover:scale-125 active:scale-95"
          >
            <Star
              size={30}
              strokeWidth={1.5}
              className={`transition-colors ${active >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
            />
          </button>
        ))}
      </div>
      <p className={`text-center text-xs font-medium mb-5 h-4 transition-colors ${active ? "text-gray-600" : "text-gray-300"}`}>
        {active ? RATING_LABELS[active] : "Tap a star to rate"}
      </p>

      <div className="relative mb-5">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
          placeholder="Tell us more about your experience… (optional)"
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 pb-6 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition placeholder:text-gray-400"
        />
        <span className="absolute bottom-2.5 right-3 text-[10px] text-gray-300 select-none">
          {comment.length}/{MAX_COMMENT}
        </span>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleCancel} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={stars === 0 || submitting}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </Modal>
  );
}
