import { useMemo } from 'react';
import { CalendarDays, MapPin, User } from 'lucide-react';
import { groupByDay } from './VisitCalendar';
import { addDays, dayKey, formatTime, sameDay } from './visitDates';

/** The same Day / Week / Month range as cards, one group per day. */
export default function VisitListView({ from, to, leads, selectedId, onSelect, noun = 'visit', showDone = true }) {
  const groups = useMemo(() => groupByDay(leads), [leads]);
  const days = useMemo(() => {
    const out = [];
    for (let d = from; d < to; d = addDays(d, 1)) if (groups.has(dayKey(d))) out.push(d);
    return out;
  }, [from, to, groups]);

  if (!days.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <CalendarDays size={28} className="text-violet-300" />
        <p className="mt-2 text-sm text-gray-500">Nothing planned in this period.</p>
      </div>
    );
  }

  const today = new Date();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-5">
      {days.map((day) => {
        const items = groups.get(dayKey(day));
        const isToday = sameDay(day, today);
        return (
          <section key={dayKey(day)} aria-label={day.toDateString()}>
            <h3 className="sticky top-0 z-10 -mx-3 px-3 py-1.5 mb-2 bg-white/95 backdrop-blur flex items-center gap-2 text-xs font-bold text-gray-700">
              <span className={isToday ? 'text-violet-700' : ''}>{day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              {isToday && <span className="rounded-full bg-violet-600 text-white px-2 py-0.5 text-[10px]">Today</span>}
              <span className="ml-auto font-medium text-gray-400">{items.length} {noun}{items.length !== 1 ? 's' : ''}</span>
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {items.map(({ lead, place }) => {
                const selected = selectedId === lead._id;
                return (
                  <button
                    key={lead._id}
                    type="button"
                    onClick={() => onSelect(lead)}
                    aria-pressed={selected}
                    className={`!flex flex-col !items-stretch !justify-start gap-1.5 text-left leading-normal rounded-xl border p-3 transition ${selected
                      ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200'
                      : 'border-violet-100 bg-white hover:border-violet-300 hover:shadow-sm'}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-gray-900 truncate">{lead.name}</span>
                      <span className="flex-shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        {place.allDay ? 'All day' : formatTime(place.date)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500 truncate">
                      <MapPin size={12} className="flex-shrink-0" /> {[lead.mandal, lead.product?.name].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1 truncate"><User size={12} className="flex-shrink-0" /> {lead.assignedTo?.name || '—'}</span>
                      {showDone && <span className="flex-shrink-0">{lead.activityCount ?? lead.visitCount ?? 0} done</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
