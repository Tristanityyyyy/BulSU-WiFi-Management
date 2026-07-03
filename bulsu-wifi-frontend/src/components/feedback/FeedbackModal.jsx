import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

export default function FeedbackModal({ onSubmit, onCancel }) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");

  const handleSubmit = () => onSubmit({ stars, comment });
  const handleCancel = () => { setStars(0); setHovered(0); setComment(""); onCancel(); };

  return (
    <Modal>
      <h2 className="text-base font-semibold text-gray-800 mb-1">Submit a Feedback</h2>
      <p className="text-xs text-gray-400 mb-5">How was your experience with BulSU Wi-Fi?</p>

      <div className="flex justify-center gap-2 mb-5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStars(s)}
            onMouseEnter={() => setHovered(s)}
            onMouseLeave={() => setHovered(0)}
            className="text-3xl transition-transform hover:scale-110"
          >
            <span className={(hovered || stars) >= s ? "text-yellow-400" : "text-gray-300"}>★</span>
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write your comment here..."
        rows={3}
        className="w-full border border-pink-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition mb-5"
      />

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={stars === 0}>Submit</Button>
      </div>
    </Modal>
  );
}
