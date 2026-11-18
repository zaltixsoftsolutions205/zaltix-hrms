import { AlertTriangle, Check, Loader2, Trash2 } from 'lucide-react';

/**
 * The right-edge controls of EVERY cell, whatever editor or display the cell uses:
 *   - status icon (saving / saved / error)
 *   - hover "clear value" trash
 *
 * The trash clears ONLY this cell's value. It never deletes the Lead (that is the far-right
 * row action) and never deletes the field (that is the column header menu).
 * It sits absolutely at the cell's right edge inside a reserved padding, so it never shifts the
 * value, and it stops mouse/click propagation so it can't start editing, open a dropdown or select a row.
 * It is visible on cell hover, when the cell is active, and when the button itself has keyboard focus.
 */
const CellActions = ({ status, canClear, active, label, onClear, systemManaged = false }) => {
  const statusIcon =
    status && status.s === 'saving' ? <Loader2 size={13} className="animate-spin text-violet-400" aria-label="Saving" />
    : status && status.s === 'error' ? <span title={status.m || 'Failed to save'}><AlertTriangle size={13} className="text-red-500" aria-label="Save failed" /></span>
    : status && status.s === 'saved' ? <Check size={13} className="text-emerald-500" aria-label="Saved" />
    : null;

  return (
    <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center" data-testid="cell-actions">
      {statusIcon}
      {!statusIcon && canClear && !systemManaged && (
        <button
          type="button"
          data-testid="cell-clear"
          title="Clear this value (the lead is not deleted)"
          aria-label={`Clear ${label}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className={`w-5 h-5 flex items-center justify-center rounded text-violet-300 hover:text-red-500 hover:bg-red-50 focus:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-300 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
};

export default CellActions;