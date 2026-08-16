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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-studio-850 rounded-lg shadow-2xl border border-studio-700 w-full max-w-sm mx-4 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-ice-50">{title}</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-md text-ice-600 hover:text-ice-50 hover:bg-studio-800 transition-colors shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <p className="text-sm text-ice-400 leading-relaxed">{message}</p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-ice-400 hover:text-ice-50 hover:bg-studio-800 rounded-md transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              variant === "danger"
                ? "px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                : "px-4 py-2 text-sm font-medium text-studio-900 bg-tiffany-400 hover:bg-tiffany-300 rounded-md transition-colors"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
