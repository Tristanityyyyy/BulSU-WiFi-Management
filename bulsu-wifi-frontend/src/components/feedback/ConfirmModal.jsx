import Modal from "../ui/Modal";
import Button from "../ui/Button";

export default function ConfirmModal({ onClose }) {
  return (
    <Modal>
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <span className="text-5xl">🎉</span>
        </div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">Thank you!</h2>
        <p className="text-xs text-gray-400 mb-6">Your feedback has been submitted successfully.</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
