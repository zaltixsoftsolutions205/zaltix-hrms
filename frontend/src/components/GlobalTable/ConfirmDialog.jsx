import { useEffect, useRef } from 'react';

/**
 * Used for the two serious deletes:
 *   - delete a Lead (entity)   - delete a field (column)
 * Focus starts on Cancel so Enter never destroys data by accident.
 */
const ConfirmDialog = ({
  title, children, confirmLabel = 'Delete', busy = false, onConfirm, onCancel,
}) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gt-confirm-title"
        className="w-full max-w-sm bg-white rounded-xl border border-violet-100 shadow-xl p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="gt-confirm-title" className="text-sm font-semibold text-violet-900">{title}</h2>
        <div className="mt-2 text-xs text-violet-600 leading-relaxed">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;