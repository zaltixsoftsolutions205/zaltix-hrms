import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { joinFollowUp, splitFollowUp } from '../../utils/followUp';

/**
 * Follow-up picker: a date and an optional time ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM').
 * Without a time the lead shows as "All day" on the calendars.
 */
export default function FollowUpInput({
  value, onChange, dense = false, invalid = false, autoFocus = false, label = 'Follow-up', idPrefix,
}) {
  const { day, time } = splitFollowUp(value);
  const cls = `${dense ? 'input-field !py-1 !text-xs' : 'input-field'} ${invalid ? 'border-red-500' : ''}`;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <input
        id={idPrefix ? `${idPrefix}-day` : undefined}
        type="date"
        autoFocus={autoFocus}
        aria-label={`${label} date`}
        aria-invalid={invalid}
        value={day}
        onChange={(e) => onChange(joinFollowUp(e.target.value, time))}
        className={`${cls} flex-1 min-w-0`}
      />
      <input
        id={idPrefix ? `${idPrefix}-time` : undefined}
        type="time"
        aria-label={`${label} time (optional)`}
        title={day ? 'Optional: leave empty for all day' : 'Pick a date first'}
        disabled={!day}
        value={time}
        onChange={(e) => onChange(joinFollowUp(day, e.target.value))}
        className={`${cls} w-[7.5rem] flex-shrink-0 disabled:opacity-50`}
      />
      {time && (
        <button type="button" onClick={() => onChange(joinFollowUp(day, ''))} aria-label="Remove the time" title="Remove the time (all day)"
          className="w-6 h-6 flex-shrink-0 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Grid cell editor: Enter / Tab saves, Esc cancels, clicking outside saves.
 * onCommit(value, nav) / onCancel() like the other cell editors.
 */
export function FollowUpCellEditor({ initial, label, onCommit, onCancel }) {
  const [draft, setDraft] = useState(initial || '');
  const done = useRef(false);
  const wrap = useRef(null);
  const finish = (fn) => { if (done.current) return; done.current = true; fn(); };

  return (
    <div
      ref={wrap}
      className="bg-white rounded-lg shadow-lg ring-1 ring-violet-200 p-1 min-w-[15rem]"
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget)) finish(() => onCommit(draft, 'stay')); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(() => onCommit(draft, 'down')); }
        else if (e.key === 'Tab') {
          // Tab moves date -> time inside the editor; leaving it saves and moves to the next cell.
          const leaving = e.shiftKey ? e.target.type === 'date' : (e.target.type !== 'date' || e.target.nextElementSibling?.disabled);
          if (leaving) { e.preventDefault(); finish(() => onCommit(draft, e.shiftKey ? 'prev' : 'next')); }
        } else if (e.key === 'Escape') { e.preventDefault(); finish(onCancel); }
        e.stopPropagation();
      }}
    >
      <FollowUpInput value={draft} onChange={setDraft} dense autoFocus label={label} />
    </div>
  );
}
