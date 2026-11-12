import { CalendarCheck, Clock, Paperclip, Plus, Star, User } from 'lucide-react';
import { formatDay, formatTime, placeFollowUp } from '../Visits/visitDates';
import { entryDate } from './activityTypes';

/** Readable text for a main field value (select label, amount, file name). */
export const mainText = (m, value) => {
  if (value === null || value === undefined || value === '') return '';
  if (m.type === 'select') return (m.options || []).find((o) => o.value === value)?.label || value;
  if (m.type === 'number') return m.currency ? `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : String(value);
  if (m.type === 'file') return value.originalName || 'Attached';
  return String(value);
};

export const Stars = ({ value, size = 12 }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value} of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
    ))}
  </span>
);

/**
 * A lead's entries of one type as horizontal cards (oldest first), with "Add"
 * at the end. The card reads the type's fields from `detail.mainFields`;
 * 'details' fields are listed at the bottom only when filled.
 *   readOnly: no "Add" card (lead drawer / lead page)   showAll: every detail on the card
 */
export default function ActivityCards({ detail, page, onOpen, onAdd, onHoverDay, readOnly = false, showAll = false }) {
  const { entries, canAdd, mainFields, type } = detail;
  const single = type?.single;
  const times = mainFields.filter((m) => m.type === 'time');
  const people = mainFields.filter((m) => m.type === 'user' || m.type === 'actor');
  const extras = mainFields.filter((m) => m.section !== 'details' && ['text', 'rating', 'select', 'number', 'file'].includes(m.type));
  const details = mainFields.filter((m) => m.section === 'details');
  const hover = (entry) => onHoverDay?.(entry ? placeFollowUp(entryDate(mainFields, entry))?.key || null : null);
  const showAdd = !readOnly && !(single && entries.length > 0);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x" role="list" aria-label={`${page.title} of this lead`}>
      {entries.length === 0 && (
        <div className="flex-shrink-0 w-52 rounded-xl border border-dashed border-gray-200 p-4 text-center">
          <CalendarCheck size={22} className="mx-auto text-gray-300" />
          <p className="mt-2 text-xs text-gray-500">No {page.noun} recorded yet.</p>
        </div>
      )}

      {entries.map((entry, i) => {
        const filled = details
          .map((f) => ({ f, text: mainText(f, entry[f.key]) }))
          .filter((x) => x.text);
        const [from, to] = times.map((t) => entry[t.key]);
        return (
          <button
            key={entry._id}
            type="button"
            role="listitem"
            onClick={() => onOpen(entry)}
            onMouseEnter={() => hover(entry)}
            onMouseLeave={() => hover(null)}
            onFocus={() => hover(entry)}
            onBlur={() => hover(null)}
            className="snap-start flex-shrink-0 w-60 !flex flex-col !items-stretch !justify-start text-left leading-normal rounded-xl border border-violet-100 bg-white p-3 hover:border-violet-300 hover:shadow-md transition"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-violet-600 text-white px-2 py-0.5 text-[10px] font-bold">{single ? page.label : `${page.label} ${i + 1}`}</span>
              <span className="text-[11px] font-semibold text-gray-700">{formatDay(entryDate(mainFields, entry))}</span>
            </span>
            {times.length > 0 && (
              <span className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                <Clock size={12} className="flex-shrink-0" />
                {from || to ? `${formatTime(from) || '—'} – ${formatTime(to) || '—'}` : 'No time recorded'}
              </span>
            )}
            {people.map((p) => (
              <span key={p.key} className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                <User size={12} className="flex-shrink-0" /> {entry[p.key]?.name || '—'}
              </span>
            ))}
            {extras.map((m) => (
              <span key={m.key} className="mt-1 block text-[11px] leading-snug">
                <span className="block text-gray-400">{m.label}</span>
                {m.type === 'rating' ? <Stars value={entry[m.key]} />
                  : m.type === 'file' ? <span className="flex items-center gap-1 text-gray-800 font-medium truncate">{entry[m.key] ? <><Paperclip size={11} /> {mainText(m, entry[m.key])}</> : '—'}</span>
                    : <span className="block text-gray-800 font-medium truncate">{mainText(m, entry[m.key]) || '—'}</span>}
              </span>
            ))}
            <span className="mt-2 pt-2 border-t border-violet-50 block space-y-1.5">
              {(showAll ? filled : filled.slice(0, 3)).map(({ f, text }) => (
                <span key={f.key} className="block text-[11px] leading-snug">
                  <span className="block text-gray-400 truncate">{f.label}</span>
                  <span className={`block text-gray-800 font-medium ${showAll ? 'break-words' : 'truncate'}`}>{text}</span>
                </span>
              ))}
              {!showAll && filled.length > 3 && <span className="block text-[10px] font-semibold text-violet-600">+{filled.length - 3} more · open</span>}
              {filled.length === 0 && <span className="block text-[11px] text-gray-400">No details recorded</span>}
            </span>
          </button>
        );
      })}

      {showAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          title={canAdd ? `Record a ${page.noun}` : `Only while the lead is in the ${page.label} stage`}
          className="snap-start flex-shrink-0 w-36 !flex flex-col gap-1.5 rounded-xl border-2 border-dashed border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-400 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed text-xs font-semibold p-3 min-h-[170px]"
        >
          <span className="w-9 h-9 rounded-full bg-violet-100 inline-flex items-center justify-center"><Plus size={18} /></span>
          Add {page.noun}
          {!canAdd && <span className="text-[10px] font-normal text-gray-400 text-center leading-snug">Lead is not in the {page.label} stage</span>}
        </button>
      )}
    </div>
  );
}
