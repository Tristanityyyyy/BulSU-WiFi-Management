import { PartyPopper } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

export default function ConfirmModal({ onClose }) {
  return (
    <Modal>
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <span className="w-14 h-14 rounded-full bg-pink-50 border border-pink-200 flex items-center justify-center">
            <PartyPopper size={28} className="text-pink-500" />
          </span>
        </div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">Thank you!</h2>
        <p className="text-xs text-gray-400 mb-6">Your feedback has been submitted successfully.</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
