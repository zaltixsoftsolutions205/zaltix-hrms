import { useMemo, useState } from 'react';
import {
  AlertCircle, CalendarDays, ChevronLeft, ChevronRight, GripVertical, List, Lock, MapPin, SquareKanban, Table2, User,
} from 'lucide-react';
import VisitCalendar from '../Visits/VisitCalendar';
import ClientBadge from '../Crm/ClientBadge';
import VisitListView from '../Visits/VisitListView';
import {
  addDays, placeFollowUp, rangeTitle, shiftCursor, startOfDay, startOfWeek, visibleRange,
} from '../Visits/visitDates';
import { formatFollowUp } from '../../utils/followUp';
import {
  PIPELINE_STAGES, STAGE_LABELS, activityStageOf, classifyStageChange, isClient, isStageLocked, normalizeStage,
} from '../../hooks/useGlobalTableColumns';

/**
 * Other ways to look at a list of leads, next to the table:
 *   ViewSwitcher       Table / Calendar / List / Kanban buttons (+ useViewPref to remember the choice)
 *   LeadCalendarPanel  leads by follow-up date: calendar or day-grouped list, Day / Week / Month
 *   StageKanban        one column per pipeline stage; optional drag to change the stage
 *   FollowUpKanban     one column per follow-up period (Overdue, Today, ...), for the stage pages
 * Clicking a lead calls onOpen / onSelect; the caller decides what that opens.
 */

export const VIEW_OPTIONS = [
  { value: 'table', label: 'Table', icon: Table2 },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'list', label: 'List', icon: List },
  { value: 'kanban', label: 'Kanban', icon: SquareKanban },
];
const VIEW_VALUES = VIEW_OPTIONS.map((v) => v.value);

/** [view, setView] remembered per screen in localStorage. */
export function useViewPref(storageKey, fallback = 'table') {
  const [view, setViewState] = useState(() => {
    try {
      const saved = storageKey ? localStorage.getItem(storageKey) : null;
      return VIEW_VALUES.includes(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const setView = (value) => {
    setViewState(value);
    try { if (storageKey) localStorage.setItem(storageKey, value); } catch { /* storage unavailable */ }
  };
  return [view, setView];
}

export function ViewSwitcher({ value, onChange, options = VIEW_OPTIONS }) {
  return (
    <div className="inline-flex rounded-lg border border-violet-200 p-0.5 bg-white" role="group" aria-label="View">
      {options.map(({ value: v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          title={label}
          onClick={() => onChange(v)}
          className={`gap-1 rounded-md px-2 py-1 text-xs font-semibold ${value === v ? 'bg-violet-600 text-white' : 'text-violet-700 hover:bg-violet-50'}`}
        >
          <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

const assigneeName = (lead, userLookup) => {
  const a = lead.assignedTo;
  if (!a) return '';
  if (typeof a === 'object') return a.name || userLookup?.[a._id]?.name || '';
  return userLookup?.[a]?.name || '';
};

const isOverdue = (lead) => {
  const place = placeFollowUp(lead.followUpDate);
  // A client on an activity page still has a live follow-up; other closed leads do not.
  return Boolean(place && place.day < startOfDay(new Date()) && activityStageOf(lead));
};

/* ------------------------------ calendar / list ------------------------------ */

const RANGES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/**
 * Leads placed by their follow-up date. `mode` is 'calendar' or 'list'.
 * Has its own period (Today, previous / next, Day / Week / Month).
 */
export function LeadCalendarPanel({ leads, mode, userLookup, onOpen, noun = 'lead' }) {
  const [range, setRange] = useState('month');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const { from, to } = useMemo(() => visibleRange(range, cursor), [range, cursor]);

  // Assignee names for the list cards (table records may hold only the id).
  const shown = useMemo(() => leads.map((l) => (typeof l.assignedTo === 'string' && userLookup?.[l.assignedTo]
    ? { ...l, assignedTo: userLookup[l.assignedTo] } : l)), [leads, userLookup]);
  const undated = useMemo(() => leads.filter((l) => !placeFollowUp(l.followUpDate)).length, [leads]);

  return (
    <div className="flex flex-col min-h-[560px]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-violet-100">
        <button type="button" onClick={() => setCursor(startOfDay(new Date()))} className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">Today</button>
        <div className="flex items-center">
          <button type="button" aria-label="Previous" onClick={() => setCursor((c) => shiftCursor(range, c, -1))} className="w-8 h-8 rounded-lg hover:bg-violet-50 text-violet-600"><ChevronLeft size={17} /></button>
          <button type="button" aria-label="Next" onClick={() => setCursor((c) => shiftCursor(range, c, 1))} className="w-8 h-8 rounded-lg hover:bg-violet-50 text-violet-600"><ChevronRight size={17} /></button>
        </div>
        <h3 className="text-sm font-bold text-gray-900 mr-auto">{rangeTitle(range, cursor)}</h3>
        {undated > 0 && (
          <span className="text-[11px] text-gray-500" title="Only leads with a Next Follow-up date are placed here">
            {undated} without a follow-up date
          </span>
        )}
        <div className="inline-flex rounded-lg bg-violet-50 p-0.5" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${range === r.value ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {mode === 'calendar' ? (
        <VisitCalendar
          range={range}
          cursor={cursor}
          leads={shown}
          selectedId={null}
          focusKey={null}
          noun={noun}
          onSelect={onOpen}
          onPickDay={(day) => { setCursor(day); setRange('day'); }}
        />
      ) : (
        <VisitListView from={from} to={to} leads={shown} selectedId={null} onSelect={onOpen} noun={noun} showDone={false} />
      )}
    </div>
  );
}

/* ---------------------------------- kanban ---------------------------------- */

function KanbanCard({ lead, userLookup, selected, draggable, onDragStart, onDragEnd, onClick }) {
  const overdue = isOverdue(lead);
  const who = assigneeName(lead, userLookup);
  const locked = isStageLocked(lead.pipelineStage);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      title={draggable ? 'Click to open · drag to another stage' : 'Click to open'}
      className={`group rounded-xl border bg-white p-2.5 text-left shadow-sm transition ${selected
        ? 'border-violet-500 ring-2 ring-violet-200'
        : 'border-violet-100 hover:border-violet-300 hover:shadow'} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div className="flex items-start gap-1.5">
        {draggable && <GripVertical size={14} className="mt-0.5 flex-shrink-0 text-gray-300 group-hover:text-violet-400" />}
        <span className="flex-1 min-w-0 text-[13px] font-semibold text-gray-900 break-words">{lead.name || '—'}</span>
        <ClientBadge lead={lead} />
        {locked && !isClient(lead) && <Lock size={12} className="mt-0.5 flex-shrink-0 text-gray-400" aria-label="Final stage" />}
      </div>
      {lead.mandal && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 truncate"><MapPin size={11} className="flex-shrink-0" /> {lead.mandal}</p>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1 text-gray-500 truncate"><User size={11} className="flex-shrink-0" /> {who || '—'}</span>
        {lead.followUpDate && (
          <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 font-semibold ${overdue ? 'bg-red-50 text-red-600' : 'bg-violet-50 text-violet-600'}`}>
            {formatFollowUp(lead.followUpDate, { withYear: false })}
          </span>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({ title, count, tone = 'violet', highlight, dimmed, children, dropProps }) {
  const head = {
    violet: 'text-violet-800',
    red: 'text-red-700',
    green: 'text-emerald-700',
    gray: 'text-gray-600',
    amber: 'text-amber-700',
  }[tone];
  return (
    <section
      aria-label={title}
      {...dropProps}
      className={`flex w-64 flex-shrink-0 flex-col rounded-xl border transition-colors ${highlight
        ? 'border-violet-400 bg-violet-100/70'
        : 'border-violet-100 bg-violet-50/40'} ${dimmed ? 'opacity-50' : ''}`}
    >
      <h3 className={`flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide ${head}`}>
        {title}
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600 normal-case">{count}</span>
      </h3>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 min-h-[120px] max-h-[62vh]">{children}</div>
    </section>
  );
}

const STAGE_TONE = { 'lead-won': 'green', 'lead-lost': 'red' };

/**
 * One column per pipeline stage. With `onMove(lead, toStage)` cards can be dragged
 * to another stage: the caller asks for confirmation (and Assign To + follow-up for
 * Visit … Feedback). Lead Won / Lead Lost are final, so their cards do not move.
 */
export function StageKanban({ leads, userLookup, onOpen, onMove, selectedId }) {
  const [drag, setDrag] = useState(null); // the lead being dragged
  const [over, setOver] = useState(null); // stage under the pointer

  const columns = useMemo(() => {
    const map = new Map(PIPELINE_STAGES.map((s) => [s, []]));
    leads.forEach((lead) => {
      const s = normalizeStage(lead.pipelineStage);
      (map.get(s) || map.get('lead')).push(lead);
    });
    return map;
  }, [leads]);

  const canDrop = (stage) => Boolean(drag) && normalizeStage(drag.pipelineStage) !== stage
    && classifyStageChange(drag.pipelineStage, stage).allowed;

  return (
    <div className="overflow-x-auto p-3">
      {onMove && <p className="mb-2 text-[11px] text-gray-500">Drag a card to another column to change its stage. Won and lost leads are changed from CRM › Clients.</p>}
      <div className="flex gap-3 items-stretch">
        {PIPELINE_STAGES.map((stage) => {
          const items = columns.get(stage);
          const dropProps = onMove ? {
            onDragOver: (e) => { if (canDrop(stage)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== stage) setOver(stage); } },
            onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === stage ? null : o)); },
            onDrop: (e) => {
              e.preventDefault();
              const lead = drag;
              setDrag(null);
              setOver(null);
              if (lead && canDrop(stage)) onMove(lead, stage);
            },
          } : {};
          return (
            <KanbanColumn
              key={stage}
              title={STAGE_LABELS[stage]}
              count={items.length}
              tone={STAGE_TONE[stage] || 'violet'}
              highlight={over === stage}
              dimmed={Boolean(drag) && !canDrop(stage) && normalizeStage(drag.pipelineStage) !== stage}
              dropProps={dropProps}
            >
              {items.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-gray-400">No leads</p>}
              {items.map((lead) => (
                <KanbanCard
                  key={lead._id}
                  lead={lead}
                  userLookup={userLookup}
                  selected={selectedId === lead._id}
                  draggable={Boolean(onMove) && !isStageLocked(lead.pipelineStage)}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', lead._id); setDrag(lead); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => onOpen(lead)}
                />
              ))}
            </KanbanColumn>
          );
        })}
      </div>
    </div>
  );
}

const FOLLOW_UP_BUCKETS = [
  { key: 'overdue', label: 'Overdue', tone: 'red' },
  { key: 'today', label: 'Today', tone: 'violet' },
  { key: 'tomorrow', label: 'Tomorrow', tone: 'violet' },
  { key: 'week', label: 'This week', tone: 'violet' },
  { key: 'later', label: 'Later', tone: 'gray' },
  { key: 'none', label: 'No follow-up', tone: 'amber' },
];

const followUpBucket = (lead) => {
  const place = placeFollowUp(lead.followUpDate);
  if (!place) return 'none';
  const today = startOfDay(new Date());
  if (place.day < today) return 'overdue';
  if (place.day.getTime() === today.getTime()) return 'today';
  if (place.day.getTime() === addDays(today, 1).getTime()) return 'tomorrow';
  if (place.day < addDays(startOfWeek(today), 7)) return 'week';
  return 'later';
};

/** Stage pages: the leads of the stage by when they are due. Read-only (no drag). */
export function FollowUpKanban({ leads, userLookup, onSelect, selectedId }) {
  const columns = useMemo(() => {
    const map = new Map(FOLLOW_UP_BUCKETS.map((b) => [b.key, []]));
    leads.forEach((lead) => map.get(followUpBucket(lead)).push(lead));
    map.forEach((items) => items.sort((a, b) => (placeFollowUp(a.followUpDate)?.date || 0) - (placeFollowUp(b.followUpDate)?.date || 0)));
    return map;
  }, [leads]);

  if (!leads.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle size={26} className="text-violet-300" />
        <p className="mt-2 text-sm text-gray-500">No leads here.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-3">
      <div className="flex gap-3 items-stretch">
        {FOLLOW_UP_BUCKETS.map((b) => {
          const items = columns.get(b.key);
          return (
            <KanbanColumn key={b.key} title={b.label} count={items.length} tone={b.tone}>
              {items.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-gray-400">No leads</p>}
              {items.map((lead) => (
                <KanbanCard key={lead._id} lead={lead} userLookup={userLookup} selected={selectedId === lead._id} onClick={() => onSelect(lead)} />
              ))}
            </KanbanColumn>
          );
        })}
      </div>
    </div>
  );
}
