import { XIcon } from "./Icons";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "default";
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-lg border border-[#c8ece8] w-full max-w-sm mx-4 p-6 space-y-5 animate-in fade-in zoom-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-[#1a4a45]">{title}</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-[#a3c9c3] hover:text-[#6b9e97] hover:bg-[#e8f8f5] transition-colors shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <p className="text-sm text-[#6b9e97] leading-relaxed">{message}</p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#6b9e97] hover:text-[#2d5a55] hover:bg-[#e8f8f5] rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              variant === "danger"
                ? "px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                : "px-4 py-2 text-sm font-medium text-white bg-[#81d8d0] hover:bg-[#6ac4bc] rounded-lg transition-colors"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
