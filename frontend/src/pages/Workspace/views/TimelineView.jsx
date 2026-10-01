/**
 * src/pages/Workspace/Tasks/TimelineView.jsx
 *
 * Full-width, pixel-based project-management timeline for the Tasks
 * module. Reuses the existing GlobalFilters (relationship AND-filtering,
 * active-filter chips) and the existing GET /api/tasks contract —
 * backend remains the single source of truth for filtering. Everything
 * in this file is presentation: day/month grid, lane packing for
 * overlapping tasks, zoom, sort, tooltip, avatars, milestones.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef, } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Plus, Minus, RefreshCw, AlertTriangle, ListTodo, SlidersHorizontal, ArrowUpDown, Settings2, Users, CalendarDays, Check, X, } from 'lucide-react';
import api from '../../../utils/api';
import GlobalFilters from '../../../components/UI/Globalfilters';

/* ============================================================
   CONSTANTS
============================================================ */

const DAY_WIDTH_MIN = 28;
const DAY_WIDTH_MAX = 80;
const DAY_WIDTH_DEFAULT = 44;
const DAY_WIDTH_STEP = 8;

const ROW_HEIGHT = 56;
const ROW_HEIGHT_COMPACT = 42;
const ROW_GAP = 8;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_META = {
  'not-started': { bar: 'bg-gray-300', ring: 'ring-gray-200', text: 'text-gray-600', dot: 'bg-gray-400', label: 'Not Started' },
  'in-progress': { bar: 'bg-violet-500', ring: 'ring-violet-200', text: 'text-white', dot: 'bg-violet-500', label: 'In Progress' },
  review: { bar: 'bg-blue-500', ring: 'ring-blue-200', text: 'text-white', dot: 'bg-blue-500', label: 'Review' },
  completed: { bar: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-white', dot: 'bg-emerald-500', label: 'Completed' },
  cancelled: { bar: 'bg-red-400', ring: 'ring-red-200', text: 'text-white', dot: 'bg-red-500', label: 'Cancelled' },
};

const PRIORITY_META = {
  low: { dot: 'bg-blue-400', label: 'Low' },
  medium: { dot: 'bg-emerald-400', label: 'Medium' },
  high: { dot: 'bg-amber-400', label: 'High' },
  critical: { dot: 'bg-rose-500', label: 'Critical' },
};

const TIMELINE_ENABLED_FILTERS = [
  'search',
  'department',
  'project',
  'employee',
  'manager',
  'teamLead',
  'status',
  'priority',
];

const SORT_OPTIONS = [
  { value: 'startDate', label: 'Start date' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'createdAt', label: 'Created date' },
];

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK = { 'in-progress': 0, review: 1, 'not-started': 2, completed: 3, cancelled: 4 };

/* ============================================================
   DATE HELPERS
============================================================ */

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const addMonths = (date, n) => new Date(date.getFullYear(), date.getMonth() + n, 1);

const toISODate = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const stripTime = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const dayDiff = (a, b) => Math.round((stripTime(b) - stripTime(a)) / DAY_MS);
const isSameDay = (a, b) => dayDiff(a, b) === 0;
const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

const titleCase = (s = '') => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

/** Every calendar day between rangeStart and rangeEnd, inclusive. */
function buildDayList(rangeStart, rangeEnd) {
  const days = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Groups a day list into contiguous month spans for the month header row. */
function buildMonthSpans(days) {
  const spans = [];
  days.forEach((day, index) => {
    const key = `${day.getFullYear()}-${day.getMonth()}`;
    const last = spans[spans.length - 1];
    if (last && last.key === key) {
      last.count += 1;
    } else {
      spans.push({
        key,
        count: 1,
        startIndex: index,
        label: day.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
  });
  return spans;
}

/* ============================================================
   AVATAR HELPERS
============================================================ */

const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

const AVATAR_PALETTE = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
];

const colorForName = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const AssigneeAvatar = ({ user, size = 18 }) => {
  const name = user?.name || 'Unassigned';
  if (user?.profilePicture) {
    return (
      <img
        src={user.profilePicture}
        alt={name}
        className="rounded-full object-cover border border-white shadow-sm shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center rounded-full border border-white shadow-sm font-bold shrink-0 ${colorForName(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
};

const AssigneeStack = ({ assignees = [], size = 18, max = 2 }) => {
  const users = assignees.map((a) => a.user).filter(Boolean);
  if (users.length === 0) {
    return <span className="text-[10px] text-gray-300 font-medium">Unassigned</span>;
  }
  const visible = users.slice(0, max);
  const extra = users.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((user, i) => (
        <AssigneeAvatar key={user._id || i} user={user} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-gray-100 text-gray-500 border border-white shadow-sm font-bold shrink-0"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
};

/* ============================================================
   LANE PACKING
   ------------------------------------------------------------
   Greedy interval scheduling: sort tasks (by the active sort),
   then place each task in the first lane whose last-placed task
   ends before this one starts. Overlapping tasks fall into
   different lanes instead of covering each other.
============================================================ */

function getEffectiveRange(task) {
  const rawStart = task.startDate ? stripTime(task.startDate) : null;
  const rawEnd = task.deadline ? stripTime(task.deadline) : null;
  if (!rawStart && !rawEnd) return null;
  let start = rawStart || rawEnd;
  let end = rawEnd || rawStart;
  if (end < start) end = start;
  return { start, end, isMilestone: !rawEnd };
}

function sortTasks(tasks, sortBy) {
  const withDates = tasks.map((t) => ({ task: t, range: getEffectiveRange(t) }));
  const comparator = (a, b) => {
    switch (sortBy) {
      case 'deadline': {
        const av = a.task.deadline ? new Date(a.task.deadline).getTime() : Infinity;
        const bv = b.task.deadline ? new Date(b.task.deadline).getTime() : Infinity;
        return av - bv;
      }
      case 'priority':
        return (PRIORITY_RANK[a.task.priority] ?? 9) - (PRIORITY_RANK[b.task.priority] ?? 9);
      case 'status':
        return (STATUS_RANK[a.task.status] ?? 9) - (STATUS_RANK[b.task.status] ?? 9);
      case 'createdAt': {
        const av = a.task.createdAt ? new Date(a.task.createdAt).getTime() : 0;
        const bv = b.task.createdAt ? new Date(b.task.createdAt).getTime() : 0;
        return av - bv;
      }
      case 'startDate':
      default: {
        const av = a.range ? a.range.start.getTime() : Infinity;
        const bv = b.range ? b.range.start.getTime() : Infinity;
        return av - bv;
      }
    }
  };
  return withDates.sort(comparator).map((x) => x.task);
}

function packLanes(tasks) {
  const lanes = []; // lanes[i] = last effective end Date placed in that lane
  const placements = [];

  tasks.forEach((task) => {
    const range = getEffectiveRange(task);
    if (!range) {
      placements.push({ task, range: null, lane: 0 });
      return;
    }

    let laneIndex = lanes.findIndex((laneEnd) => range.start > laneEnd);
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push(range.end);
    } else {
      lanes[laneIndex] = range.end;
    }
    placements.push({ task, range, lane: laneIndex });
  });

  return { placements, laneCount: Math.max(lanes.length, 1) };
}
/* ============================================================
   TOOLBAR SUB-COMPONENTS
============================================================ */

const ToolbarButton = ({ icon: IconCmp, children, onClick, active, ...rest }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 transition-colors ${active
        ? 'border-violet-200 bg-violet-50 text-violet-700'
        : 'border-gray-100 bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-50'
      }`}
    {...rest}
  >
    {IconCmp && <IconCmp size={13} />}
    {children}
  </button>
);

function useOutsideClose(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

const Dropdown = ({ label, icon, children, open, setOpen }) => {
  const ref = useOutsideClose(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <ToolbarButton icon={icon} onClick={() => setOpen((o) => !o)} active={open}>
        {label}
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 rounded-xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60 p-1.5">
          {children}
        </div>
      )}
    </div>
  );
};

const SortMenu = ({ sortBy, setSortBy }) => {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.value === sortBy);
  return (
    <Dropdown label={`Sort: ${current?.label || 'Start date'}`} icon={ArrowUpDown} open={open} setOpen={setOpen}>
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => {
            setSortBy(opt.value);
            setOpen(false);
          }}
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${opt.value === sortBy ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
        >
          {opt.label}
          {opt.value === sortBy && <Check size={13} />}
        </button>
      ))}
    </Dropdown>
  );
};

const OptionsMenu = ({ options, setOptions }) => {
  const [open, setOpen] = useState(false);
  const toggle = (key) => setOptions((o) => ({ ...o, [key]: !o[key] }));

  const rows = [
    { key: 'showWeekends', label: 'Show weekends' },
    { key: 'showToday', label: 'Show today marker' },
    { key: 'compact', label: 'Compact rows' },
  ];

  return (
    <Dropdown label="Options" icon={Settings2} open={open} setOpen={setOpen}>
      {rows.map((row) => (
        <button
          key={row.key}
          onClick={() => toggle(row.key)}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {row.label}
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border ${options[row.key] ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-300 text-transparent'
              }`}
          >
            <Check size={11} />
          </span>
        </button>
      ))}
    </Dropdown>
  );
};

/* ============================================================
   HEADER
============================================================ */

const TimelineHeader = ({ total, loading, onRefresh }) => (
  <div className="flex items-end justify-between gap-3">
    <div>
      <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Timeline</h2>
      <p className="text-sm text-gray-400 mt-0.5">Plan and track work across your workspace</p>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
        {total} Task{total !== 1 ? 's' : ''}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        aria-label="Refresh timeline"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  </div>
);

/* ============================================================
   TOOLBAR
============================================================ */

const TimelineToolbar = ({
  anchorDate,
  onPrev,
  onNext,
  onToday,
  dayWidth,
  onZoomIn,
  onZoomOut,
  showFilters,
  setShowFilters,
  sortBy,
  setSortBy,
  options,
  setOptions,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-gray-100 rounded-2xl px-3 py-2.5 shadow-sm">
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => toast('Task creation from the Timeline is coming soon.')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3 py-2 rounded-xl shadow-sm transition-colors"
      >
        <Plus size={13} />
        Add Task
      </button>

      <div className="w-px h-5 bg-gray-100 mx-1" />

      <button
        onClick={onPrev}
        className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={15} />
      </button>
      <button
        onClick={onToday}
        className="text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3 py-2 rounded-lg transition-colors"
      >
        Today
      </button>
      <button
        onClick={onNext}
        className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        aria-label="Next month"
      >
        <ChevronRight size={15} />
      </button>

      <span className="ml-1 text-xs font-bold text-gray-700 flex items-center gap-1.5">
        <CalendarDays size={13} className="text-violet-400" />
        {anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </span>
    </div>

    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-lg border border-gray-100 px-1.5 py-1">
        <span className="text-[11px] font-semibold text-gray-400 px-1">Days</span>
        <button
          onClick={onZoomOut}
          disabled={dayWidth <= DAY_WIDTH_MIN}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors"
          aria-label="Zoom out"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={onZoomIn}
          disabled={dayWidth >= DAY_WIDTH_MAX}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors"
          aria-label="Zoom in"
        >
          <Plus size={12} />
        </button>
      </div>

      <ToolbarButton icon={SlidersHorizontal} onClick={() => setShowFilters((v) => !v)} active={showFilters}>
        Filter
      </ToolbarButton>

      <SortMenu sortBy={sortBy} setSortBy={setSortBy} />
      <OptionsMenu options={options} setOptions={setOptions} />
    </div>
  </div>
);

/* ============================================================
   MONTH / DAY HEADER
============================================================ */

const TimelineMonthHeader = ({ monthSpans, dayWidth }) => (
  <div className="flex h-7 border-b border-gray-100">
    {monthSpans.map((span) => (
      <div
        key={span.key}
        style={{ width: span.count * dayWidth }}
        className="flex items-center justify-center border-r border-gray-100 last:border-r-0"
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 truncate">
          {span.label}
        </span>
      </div>
    ))}
  </div>
);

const TimelineDayHeader = ({ days, dayWidth, today, showWeekends }) => (
  <div className="flex h-11 border-b border-gray-100 bg-gray-50/50">
    {days.map((day) => {
      const weekend = isWeekend(day);
      const isToday = isSameDay(day, today);
      return (
        <div
          key={day.toISOString()}
          style={{ width: dayWidth }}
          className={`flex flex-col items-center justify-center border-r border-gray-100 last:border-r-0 ${showWeekends && weekend ? 'bg-gray-100/70' : ''
            }`}
        >
          <span
            className={`text-[11px] font-bold leading-none ${isToday ? 'w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center' : 'text-gray-700'
              }`}
          >
            {day.getDate()}
          </span>
          <span className="text-[9px] font-medium text-gray-400 mt-1">{WEEKDAY_LABELS[day.getDay()]}</span>
        </div>
      );
    })}
  </div>
);

/* ============================================================
   TOOLTIP
============================================================ */

const TimelineTooltip = ({ task, position }) => {
  if (!task) return null;
  const statusMeta = STATUS_META[task.status] || STATUS_META['not-started'];
  const priorityMeta = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const assigneeNames = (task.assignees || []).map((a) => a.user?.name).filter(Boolean);

  return (
    <div
      className="fixed z-50 w-64 rounded-xl border border-gray-100 bg-white shadow-xl shadow-gray-300/40 p-3 pointer-events-none"
      style={{ left: position.x, top: position.y }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${priorityMeta.dot}`} />
        <span className="text-[10px] font-bold text-violet-500">{task.taskCode}</span>
      </div>
      <p className="text-sm font-bold text-gray-900 leading-snug mb-2">{task.title}</p>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <div>
          <p className="text-gray-400 font-medium">Project</p>
          <p className="text-gray-700 font-semibold truncate">{task.project?.name || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Status</p>
          <p className="flex items-center gap-1 text-gray-700 font-semibold">
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Start</p>
          <p className="text-gray-700 font-semibold">{shortDate(task.startDate)}</p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Deadline</p>
          <p className="text-gray-700 font-semibold">{task.deadline ? shortDate(task.deadline) : 'Milestone'}</p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Progress</p>
          <p className="text-gray-700 font-semibold">{Math.round(task.progress ?? 0)}%</p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Priority</p>
          <p className="text-gray-700 font-semibold">{priorityMeta.label}</p>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-50">
        <p className="text-gray-400 font-medium text-[11px] mb-1">Assignees</p>
        <p className="text-gray-700 font-semibold text-[11px] truncate">
          {assigneeNames.length ? assigneeNames.join(', ') : 'Unassigned'}
        </p>
      </div>
    </div>
  );
};

/* ============================================================
   TASK BAR / MILESTONE
============================================================ */

const TaskBar = ({ task, left, width, top, height, onHover, onLeave }) => {
  const statusMeta = STATUS_META[task.status] || STATUS_META['not-started'];
  const priorityMeta = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const isNarrow = width < 90;
  const isVeryNarrow = width < 46;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18 }}
      onMouseEnter={(e) => onHover(task, e)}
      onMouseMove={(e) => onHover(task, e)}
      onMouseLeave={onLeave}
      className={`absolute rounded-lg shadow-sm ring-1 ${statusMeta.bar} ${statusMeta.ring} flex items-center gap-1.5 px-2 cursor-default overflow-hidden`}
      style={{ left, width: Math.max(width, 8), top, height }}
    >
      {!isVeryNarrow && (
        <>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityMeta.dot} ring-1 ring-white/60`} />
          {!isNarrow && task.assignees?.length > 0 && (
            <AssigneeStack assignees={task.assignees} size={16} max={2} />
          )}
          <span className={`text-[11px] font-semibold truncate ${statusMeta.text}`}>{task.title}</span>
        </>
      )}
      {isVeryNarrow && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityMeta.dot}`} />}

      {typeof task.progress === 'number' && task.progress > 0 && task.progress < 100 && (
        <span
          className="absolute bottom-0 left-0 h-0.5 bg-white/70"
          style={{ width: `${Math.min(100, task.progress)}%` }}
        />
      )}
    </motion.div>
  );
};

const Milestone = ({ task, left, top, height, onHover, onLeave }) => {
  const statusMeta = STATUS_META[task.status] || STATUS_META['not-started'];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      onMouseEnter={(e) => onHover(task, e)}
      onMouseMove={(e) => onHover(task, e)}
      onMouseLeave={onLeave}
      className="absolute flex items-center gap-1.5 cursor-default"
      style={{ left: left - 6, top, height }}
    >
      <div className="flex items-center h-full">
        <span className={`w-3 h-3 rotate-45 rounded-[3px] shadow-sm ${statusMeta.bar}`} />
      </div>
      <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap bg-white/90 px-1 rounded">
        {task.title}
      </span>
    </motion.div>
  );
};

/* ============================================================
   GRID (weekend shading + vertical lines)
============================================================ */

const TimelineGrid = ({ days, dayWidth, showWeekends, bodyHeight }) => (
  <div className="absolute inset-0 flex" style={{ height: bodyHeight }}>
    {days.map((day) => (
      <div
        key={day.toISOString()}
        style={{ width: dayWidth }}
        className={`border-r border-gray-50 h-full ${showWeekends && isWeekend(day) ? 'bg-gray-50/60' : ''}`}
      />
    ))}
  </div>
);

const TodayMarker = ({ leftPx, bodyHeight }) => (
  <div className="absolute top-0 z-10 pointer-events-none" style={{ left: leftPx, height: bodyHeight }}>
    <div className="w-4 h-4 -ml-2 rounded-full bg-fuchsia-500 border-2 border-white shadow" />
    <div className="w-px bg-fuchsia-300" style={{ height: bodyHeight - 16 }} />
  </div>
);

/* ============================================================
   STATES
============================================================ */

const TimelineSkeleton = ({ dayWidth }) => (
  <div className="p-4 space-y-3">
    <div className="h-6 w-56 bg-gray-100 rounded-lg animate-pulse" />
    <div className="flex gap-1">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{ width: dayWidth }} className="h-8 bg-gray-50 border border-gray-100 rounded animate-pulse" />
      ))}
    </div>
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className="h-10 rounded-lg bg-gray-100 animate-pulse"
        style={{ width: `${40 + ((i * 17) % 40)}%`, marginLeft: `${(i * 13) % 30}%` }}
      />
    ))}
  </div>
);

const TimelineEmpty = ({ hasFilters, onClear }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
    <div className="w-11 h-11 rounded-xl bg-gray-100 border border-gray-200 text-gray-400 flex items-center justify-center">
      <ListTodo size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">No tasks in this timeline</p>
    <p className="text-xs text-gray-400 max-w-xs">
      No tasks match your current filters or date range.
    </p>
    {hasFilters && (
      <button
        onClick={onClear}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors"
      >
        <X size={13} />
        Clear filters
      </button>
    )}
  </div>
);

const TimelineError = ({ onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center">
      <AlertTriangle size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">Unable to load timeline</p>
    <button
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors"
    >
      <RefreshCw size={13} />
      Retry
    </button>
  </div>
);

/* ============================================================
   MAIN COMPONENT
============================================================ */

const emptyFilters = {
  search: '',
  department: '',
  project: '',
  employee: '',
  manager: '',
  teamLead: '',
  status: '',
  priority: '',
};

const TimelineView = () => {
  const [filters, setFilters] = useState(emptyFilters);
  const [anchorDate, setAnchorDate] = useState(() => startOfMonth(new Date()));
  const [state, setState] = useState({ status: 'loading', tasks: [] });
  const [dayWidth, setDayWidth] = useState(DAY_WIDTH_DEFAULT);
  const [showFilters, setShowFilters] = useState(true);
  const [sortBy, setSortBy] = useState('startDate');
  const [options, setOptions] = useState({ showWeekends: true, showToday: true, compact: false });
  const [hoverInfo, setHoverInfo] = useState(null); // { task, x, y }

  const requestIdRef = useRef(0);
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const scrollRef = useRef(null);

  /* debounced search — same pattern used elsewhere in the app */
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(filters.search), 350);
    return () => clearTimeout(searchDebounceRef.current);
  }, [filters.search]);

  const rangeStart = useMemo(() => startOfMonth(anchorDate), [anchorDate]);
  const rangeEnd = useMemo(() => endOfMonth(anchorDate), [anchorDate]);
  const today = useMemo(() => stripTime(new Date()), []);

  const days = useMemo(() => buildDayList(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const monthSpans = useMemo(() => buildMonthSpans(days), [days]);
  const timelineWidth = days.length * dayWidth;

  const hasActiveFilters = Boolean(
    debouncedSearch ||
    filters.department ||
    filters.project ||
    filters.employee ||
    filters.manager ||
    filters.teamLead ||
    filters.status ||
    filters.priority
  );

  /* ── fetch — backend remains the single source of truth ── */
  const fetchTimeline = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const params = {
        page: 1,
        limit: 200,
        search: debouncedSearch || undefined,
        department: filters.department || undefined,
        project: filters.project || undefined,
        employee: filters.employee || undefined,
        manager: filters.manager || undefined,
        teamLead: filters.teamLead || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        timelineStart: toISODate(rangeStart),
        timelineEnd: toISODate(rangeEnd),
      };
      const res = await api.get('/tasks', { params });
      if (requestId !== requestIdRef.current) return;

      const body = res?.data || {};
      const tasks = Array.isArray(body.tasks) ? body.tasks : Array.isArray(body.data) ? body.data : [];
      setState({ status: 'success', tasks });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ status: 'error', tasks: [] });
    }
  }, [
    debouncedSearch,
    filters.department,
    filters.project,
    filters.employee,
    filters.manager,
    filters.teamLead,
    filters.status,
    filters.priority,
    rangeStart,
    rangeEnd,
  ]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  /* frontend-only sort + lane packing */
  const { placements, laneCount } = useMemo(() => {
    const sorted = sortTasks(state.tasks, sortBy);
    return packLanes(sorted);
  }, [state.tasks, sortBy]);

  const rowHeight = options.compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT;
  const bodyHeight = Math.max(laneCount * (rowHeight + ROW_GAP) + ROW_GAP, 160);

  const todayLeftPx = useMemo(() => {
    if (today < rangeStart || today > rangeEnd) return null;
    return dayDiff(rangeStart, today) * dayWidth + dayWidth / 2;
  }, [today, rangeStart, rangeEnd, dayWidth]);

  const goPrev = () => setAnchorDate((d) => addMonths(d, -1));
  const goNext = () => setAnchorDate((d) => addMonths(d, 1));
  const goToday = () => setAnchorDate(startOfMonth(new Date()));

  const handleClearFilters = () => setFilters(emptyFilters);

  const handleHover = useCallback((task, event) => {
    setHoverInfo({
      task,
      x: Math.min(event.clientX + 14, window.innerWidth - 280),
      y: Math.min(event.clientY + 14, window.innerHeight - 220),
    });
  }, []);
  const handleLeave = useCallback(() => setHoverInfo(null), []);

  const isEmpty = state.status === 'success' && placements.length === 0;

  return (
    <div className="space-y-4">
      <TimelineHeader total={state.tasks.length} loading={state.status === 'loading'} onRefresh={fetchTimeline} />

      <TimelineToolbar
        anchorDate={anchorDate}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        dayWidth={dayWidth}
        onZoomIn={() => setDayWidth((w) => Math.min(DAY_WIDTH_MAX, w + DAY_WIDTH_STEP))}
        onZoomOut={() => setDayWidth((w) => Math.max(DAY_WIDTH_MIN, w - DAY_WIDTH_STEP))}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        sortBy={sortBy}
        setSortBy={setSortBy}
        options={options}
        setOptions={setOptions}
      />

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <GlobalFilters filters={filters} setFilters={setFilters} enabledFilters={TIMELINE_ENABLED_FILTERS} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline canvas */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {state.status === 'error' ? (
          <TimelineError onRetry={fetchTimeline} />
        ) : state.status === 'loading' ? (
          <TimelineSkeleton dayWidth={dayWidth} />
        ) : isEmpty ? (
          <TimelineEmpty hasFilters={hasActiveFilters} onClear={handleClearFilters} />
        ) : (
          <div ref={scrollRef} className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <div style={{ width: timelineWidth, minWidth: '100%' }}>
              {/* sticky headers */}
              <div className="sticky top-0 z-20 bg-white">
                <TimelineMonthHeader monthSpans={monthSpans} dayWidth={dayWidth} />
                <TimelineDayHeader days={days} dayWidth={dayWidth} today={today} showWeekends={options.showWeekends} />
              </div>

              {/* body */}
              <div className="relative" style={{ height: bodyHeight }}>
                <TimelineGrid days={days} dayWidth={dayWidth} showWeekends={options.showWeekends} bodyHeight={bodyHeight} />

                {options.showToday && todayLeftPx !== null && (
                  <TodayMarker leftPx={todayLeftPx} bodyHeight={bodyHeight} />
                )}

                {placements.map(({ task, range, lane }) => {
                  if (!range) return null;

                  const clampedStart = range.start < rangeStart ? rangeStart : range.start;
                  const clampedEnd = range.end > rangeEnd ? rangeEnd : range.end;
                  if (clampedEnd < rangeStart || clampedStart > rangeEnd) return null;

                  const left = dayDiff(rangeStart, clampedStart) * dayWidth;
                  const durationDays = dayDiff(clampedStart, clampedEnd) + 1;
                  const width = durationDays * dayWidth - 6;
                  const top = lane * (rowHeight + ROW_GAP) + ROW_GAP;

                  if (range.isMilestone) {
                    return (
                      <Milestone
                        key={task._id}
                        task={task}
                        left={left}
                        top={top}
                        height={rowHeight}
                        onHover={handleHover}
                        onLeave={handleLeave}
                      />
                    );
                  }

                  return (
                    <TaskBar
                      key={task._id}
                      task={task}
                      left={left + 3}
                      width={width}
                      top={top}
                      height={rowHeight - ROW_GAP}
                      onHover={handleHover}
                      onLeave={handleLeave}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {hoverInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <TimelineTooltip task={hoverInfo.task} position={hoverInfo} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TimelineView;