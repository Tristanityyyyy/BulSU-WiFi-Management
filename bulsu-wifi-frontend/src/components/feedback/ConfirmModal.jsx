import { PartyPopper } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

export default function ConfirmModal({ onClose }) {
  return (
    <Modal onClose={onClose} showClose={false}>
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <span className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-50 to-rose-100 border border-pink-200 flex items-center justify-center animate-pop-in shadow-inner">
            <PartyPopper size={30} className="text-pink-500" />
          </span>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Thank you!</h2>
        <p className="text-sm text-gray-500 mb-6">
          Your feedback has been submitted successfully. It helps us make BulSU Wi-Fi better for everyone.
        </p>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
