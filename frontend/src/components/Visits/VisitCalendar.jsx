import { useMemo } from 'react';
import {
  WEEKDAYS, addDays, dayKey, formatTime, hourLabel, monthGrid, placeFollowUp, sameDay, startOfWeek,
} from './visitDates';
import { isClient } from '../../hooks/useGlobalTableColumns';

/**
 * Calendar of the leads to visit, placed by their follow-up date.
 *   month: 6-week grid, each day shows how many visits and the first names
 *   week:  7 columns of lead chips (all-day first, then by time)
 *   day:   an "All day" strip and one row per hour
 * `focusKey` (the selected lead's follow-up day) is tinted so it stays easy to find.
 *
 * Note: the app's base CSS makes every <button> inline-flex in a row, so the
 * buttons holding stacked content below set `flex flex-col` explicitly.
 */

const byTime = (a, b) => (a.place.allDay === b.place.allDay
  ? a.place.date - b.place.date || a.lead.name.localeCompare(b.lead.name)
  : a.place.allDay ? -1 : 1);

/** Map(dayKey -> [{ lead, place }]) sorted by time. */
export const groupByDay = (leads) => {
  const map = new Map();
  leads.forEach((lead) => {
    const place = placeFollowUp(lead.followUpDate);
    if (!place) return;
    if (!map.has(place.key)) map.set(place.key, []);
    map.get(place.key).push({ lead, place });
  });
  map.forEach((items) => items.sort(byTime));
  return map;
};

function LeadChip({ item, selected, onSelect, compact = false }) {
  const { lead, place } = item;
  const when = place.allDay ? 'All day' : formatTime(place.date);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(lead); }}
      aria-pressed={selected}
      title={`${lead.name}${isClient(lead) ? ' (Client)' : ''} · ${when}${lead.mandal ? ` · ${lead.mandal}` : ''}`}
      className={`w-full !flex flex-col !items-stretch !justify-start text-left rounded-lg border-l-[3px] px-2 ${compact ? 'py-0.5' : 'py-1.5'} transition-colors ${selected
        ? 'bg-violet-600 border-violet-900 text-white shadow-sm'
        : 'bg-violet-50 border-violet-400 text-violet-900 hover:bg-violet-100'}`}
    >
      <span className="block w-full truncate text-[11px] font-semibold leading-tight">{isClient(lead) ? '★ ' : ''}{lead.name}</span>
      {!compact && (
        <span className={`block w-full truncate text-[10px] leading-tight mt-0.5 ${selected ? 'text-violet-100' : 'text-violet-500'}`}>
          {when}{lead.mandal ? ` · ${lead.mandal}` : ''}
        </span>
      )}
    </button>
  );
}

const DayNumber = ({ day, isToday, muted = false, large = false }) => (
  <span className={`inline-flex items-center justify-center rounded-full ${large ? 'w-8 h-8 text-base' : 'w-6 h-6 text-[11px]'} ${isToday
    ? 'bg-violet-600 text-white font-bold'
    : muted ? 'text-gray-300' : 'text-gray-700 font-medium'}`}
  >
    {day.getDate()}
  </span>
);

function MonthView({ cursor, groups, selectedId, focusKey, onSelect, onPickDay, noun }) {
  const today = new Date();
  const days = monthGrid(cursor);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="grid grid-cols-7 border-b border-violet-100 text-[11px] font-semibold text-violet-500 uppercase tracking-wide">
        {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-[480px]">
        {days.map((day) => {
          const key = dayKey(day);
          const items = groups.get(key) || [];
          const outside = day.getMonth() !== cursor.getMonth();
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onPickDay(day)}
              onKeyDown={(e) => { if (e.key === 'Enter') onPickDay(day); }}
              aria-label={`${day.toDateString()}: ${items.length} ${noun}${items.length !== 1 ? 's' : ''}`}
              className={`min-h-0 overflow-hidden border-b border-r border-violet-50 p-1.5 cursor-pointer transition-colors hover:bg-violet-50/60 ${outside ? 'bg-gray-50/70' : ''} ${focusKey === key ? '!bg-violet-100/60' : ''}`}
            >
              <div className="flex items-center justify-between gap-1">
                <DayNumber day={day} isToday={sameDay(day, today)} muted={outside} />
                {items.length > 0 && (
                  <span className="rounded-full bg-violet-100 text-violet-700 px-1.5 text-[10px] font-semibold">{items.length}</span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((item) => (
                  <LeadChip key={item.lead._id} item={item} compact selected={selectedId === item.lead._id} onSelect={onSelect} />
                ))}
                {items.length > 3 && <span className="block text-[10px] font-semibold text-violet-500 px-1">+{items.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ cursor, groups, selectedId, focusKey, onSelect, onPickDay, noun }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="grid grid-cols-7 min-w-[700px] h-full min-h-[480px]">
        {days.map((day) => {
          const key = dayKey(day);
          const items = groups.get(key) || [];
          const isToday = sameDay(day, today);
          return (
            <div key={key} className={`border-r border-violet-50 last:border-r-0 flex flex-col min-h-0 ${isToday ? 'bg-violet-50/40' : ''} ${focusKey === key ? '!bg-violet-100/50' : ''}`}>
              <button
                type="button"
                onClick={() => onPickDay(day)}
                title="Open this day"
                className="sticky top-0 z-10 !flex flex-col items-center gap-1 px-2 py-2 border-b border-violet-100 bg-white/95 backdrop-blur hover:bg-violet-50"
              >
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-violet-700' : 'text-violet-500'}`}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <DayNumber day={day} isToday={isToday} large />
                <span className="text-[10px] text-gray-400 h-3">{items.length ? `${items.length} ${noun}${items.length !== 1 ? 's' : ''}` : ''}</span>
              </button>
              <div className="p-1.5 space-y-1.5 flex-1">
                {items.map((item) => (
                  <LeadChip key={item.lead._id} item={item} selected={selectedId === item.lead._id} onSelect={onSelect} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ cursor, groups, selectedId, onSelect }) {
  const items = groups.get(dayKey(cursor)) || [];
  const allDay = items.filter((i) => i.place.allDay);
  const byHour = new Map();
  items.filter((i) => !i.place.allDay).forEach((i) => {
    if (!byHour.has(i.place.hour)) byHour.set(i.place.hour, []);
    byHour.get(i.place.hour).push(i);
  });
  const nowHour = sameDay(cursor, new Date()) ? new Date().getHours() : -1;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="sticky top-0 z-10 flex border-b border-violet-100 bg-violet-50/95 backdrop-blur">
        <div className="w-16 flex-shrink-0 px-2 py-2.5 text-[10px] font-semibold text-violet-500 uppercase">All day</div>
        <div className="flex-1 p-1.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {allDay.length === 0 && <span className="text-[11px] text-gray-400 py-1">Nothing without a time</span>}
          {allDay.map((item) => (
            <LeadChip key={item.lead._id} item={item} selected={selectedId === item.lead._id} onSelect={onSelect} />
          ))}
        </div>
      </div>
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className={`flex border-b border-violet-50 min-h-[44px] ${h === nowHour ? 'bg-amber-50/60' : ''}`}>
          <div className={`w-16 flex-shrink-0 px-2 py-1 text-[10px] text-right ${h === nowHour ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{hourLabel(h)}</div>
          <div className="flex-1 p-1 grid gap-1 sm:grid-cols-2 xl:grid-cols-3 border-l border-violet-50">
            {(byHour.get(h) || []).map((item) => (
              <LeadChip key={item.lead._id} item={item} selected={selectedId === item.lead._id} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VisitCalendar({ range, cursor, leads, selectedId, focusKey, onSelect, onPickDay, noun = 'visit' }) {
  const groups = useMemo(() => groupByDay(leads), [leads]);
  const props = { cursor, groups, selectedId, focusKey, onSelect, onPickDay, noun };
  if (range === 'month') return <MonthView {...props} />;
  if (range === 'week') return <WeekView {...props} />;
  return <DayView {...props} />;
}
