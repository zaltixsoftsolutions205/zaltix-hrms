import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS, WEEKDAYS, addMonths, dayKey, monthGrid, sameDay } from './visitDates';

/**
 * Small month picker, tied to the big calendar:
 *   - the period shown in the middle (from..to) is tinted
 *   - planned: days with leads to visit (violet dot)
 *   - done:    days the selected lead was visited (green dot)
 *   - focusKey: the selected lead's follow-up day (ring)
 *   - hoverKey: the day of the visit card under the pointer (ring)
 */
export default function MiniCalendar({ value, from, to, onPick, planned, done, focusKey, hoverKey }) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  useEffect(() => { setMonth(new Date(value.getFullYear(), value.getMonth(), 1)); }, [value]);
  // A hovered visit card in another month brings that month into view.
  useEffect(() => {
    if (!hoverKey) return;
    const [y, m] = hoverKey.split('-').map(Number);
    setMonth(new Date(y, m - 1, 1));
  }, [hoverKey]);

  const today = new Date();
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-gray-900">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} className="w-7 h-7 rounded-lg hover:bg-violet-50 text-violet-600"><ChevronLeft size={15} /></button>
          <button type="button" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} className="w-7 h-7 rounded-lg hover:bg-violet-50 text-violet-600"><ChevronRight size={15} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-gray-400 mb-1">
        {WEEKDAYS.map((d) => <span key={d}>{d[0]}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {monthGrid(month).map((day) => {
          const key = dayKey(day);
          const outside = day.getMonth() !== month.getMonth();
          const isCursor = sameDay(day, value);
          const isToday = sameDay(day, today);
          const inView = from && to && day >= from && day < to;
          const ring = key === hoverKey || key === focusKey;
          return (
            <div key={key} className={`py-0.5 ${inView ? 'bg-violet-50' : ''}`}>
              <button
                type="button"
                onClick={() => onPick(day)}
                aria-label={day.toDateString()}
                aria-pressed={isCursor}
                className={`relative w-7 h-7 rounded-full text-[11px] transition-colors ${isCursor
                  ? 'bg-violet-600 text-white font-bold'
                  : isToday ? 'text-violet-700 font-bold bg-white'
                    : outside ? 'text-gray-300 hover:bg-gray-100' : 'text-gray-700 hover:bg-violet-100'} ${ring ? 'ring-2 ring-amber-400' : ''}`}
              >
                {day.getDate()}
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {planned?.has(key) && <span className={`w-1 h-1 rounded-full ${isCursor ? 'bg-white' : 'bg-violet-500'}`} />}
                  {done?.has(key) && <span className={`w-1 h-1 rounded-full ${isCursor ? 'bg-white' : 'bg-emerald-500'}`} />}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Planned</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Visited (selected lead)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-400" /> Follow-up</span>
      </div>
    </div>
  );
}
