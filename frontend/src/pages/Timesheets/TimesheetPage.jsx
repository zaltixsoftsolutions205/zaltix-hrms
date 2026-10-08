// import { useState, useEffect, useCallback } from 'react';
// import { motion } from 'framer-motion';
// import toast from 'react-hot-toast';
// import api from '../../utils/api';
// import { useAuth } from '../../contexts/AuthContext';
// import Card, { KpiCard } from '../../components/UI/Card';
// import EmptyState from '../../components/UI/EmptyState';
// import TaskEntryModal from './TaskEntryModal';
// import DailyUpdateForm from './DailyUpdateForm';
// import TimesheetCalendar from './TimesheetCalendar';
// import TeamViewTable from './TeamViewTable';
// import OrgDashboard from './OrgDashboard';
// import TimesheetReports from './TimesheetReports';
// import AttendanceComparisonPanel from './AttendanceComparisonPanel';
// import WeeklyReportPanel from './WeeklyReportPanel';
// import OverdueTasksBadge from './OverdueTasksBadge';
// import ThisWeekView from './ThisWeekView';

// const todayKey = () => new Date().toISOString().split('T')[0];

// const TodayTab = () => {
//   const [detail, setDetail] = useState(null);
//   const [showModal, setShowModal] = useState(false);
//   const [editing, setEditing] = useState(null);
//   const [loading, setLoading] = useState(true);

//   const fetchToday = useCallback(async () => {
//     try {
//       const res = await api.get(`/timesheets/day/${todayKey()}`);
//       setDetail(res.data);
//     } catch {} finally {
//       setLoading(false);
//     }
//   }, []);
//   useEffect(() => { fetchToday(); }, [fetchToday]);

//   const entries = detail?.entries || [];
//   const totalHours = detail?.totalHours || 0;
//   const completed = entries.filter(e => e.status === 'Completed').length;
//   const inProgress = entries.filter(e => e.status === 'In Progress').length;
//   const pending = entries.filter(e => e.status === 'Not Started' || e.status === 'Blocked').length;
//   const productivityPct = entries.length === 0 ? 0 : Math.round((completed / entries.length) * 100);

//   const openEdit = (entry) => {
//     setEditing({ ...entry, timesheetId: detail._id });
//     setShowModal(true);
//   };
//   const openNew = () => { setEditing(null); setShowModal(true); };

//   const deleteEntry = async (entry) => {
//     if (!confirm('Delete this task?')) return;
//     try {
//       await api.delete(`/timesheets/${detail._id}/entry/${entry._id}`);
//       toast.success('Deleted');
//       fetchToday();
//     } catch (err) {
//       toast.error(err.response?.data?.message || 'Failed to delete');
//     }
//   };

//   if (loading) return <Card><p className="text-sm text-violet-400">Loading...</p></Card>;

//   return (
//     <div className="space-y-4">
//       <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
//         <KpiCard label="Total Hours" value={`${totalHours}h`} />
//         <KpiCard label="Total Tasks" value={entries.length} />
//         <KpiCard label="Completed" value={completed} color="green" />
//         <KpiCard label="In Progress" value={inProgress} />
//         <KpiCard label="Pending" value={pending} color="red" />
//         <KpiCard label="Productivity" value={`${productivityPct}%`} color="golden" />
//       </div>

//       <Card>
//         <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
//           <h3 className="font-bold text-violet-900 text-sm sm:text-base">Today's Tasks</h3>
//           <div className="flex items-center gap-2">
//             <OverdueTasksBadge />
//             <button onClick={openNew} className="btn-primary btn-sm">+ Add Task</button>
//           </div>
//         </div>

//         {entries.length === 0 ? (
//           <EmptyState title="No tasks logged yet" message="Add your first task for today." action={{ label: '+ Add Task', onClick: openNew }} />
//         ) : (
//           <div className="space-y-2">
//             {entries.map((en) => (
//               <motion.div key={en._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
//                 className="p-3 border border-violet-100 rounded-xl hover:bg-violet-50/40 transition-colors">
//                 <div className="flex items-start justify-between gap-2">
//                   <div className="min-w-0">
//                     <div className="flex items-center gap-2 flex-wrap">
//                       <span className="font-medium text-violet-900 text-sm">{en.task}</span>
//                       <span className="badge badge-violet">{en.hours}h</span>
//                       <span className="text-xs text-gray-500">{en.workCategory}</span>
//                       <span className={`text-xs font-medium ${en.status === 'Completed' ? 'text-violet-600' : en.status === 'Blocked' ? 'text-gray-900' : 'text-golden-600'}`}>
//                         {en.status}
//                       </span>
//                     </div>
//                     {en.project?.name && <p className="text-xs text-violet-500 mt-0.5">{en.project.name}</p>}
//                     {en.status === 'Blocked' && en.blocker && <p className="text-xs text-gray-900 mt-0.5">Blocker: {en.blocker}</p>}
//                   </div>
//                   <div className="flex gap-2 flex-shrink-0">
//                     <button onClick={() => openEdit(en)} className="text-xs text-violet-600 font-medium hover:underline">Edit</button>
//                     <button onClick={() => deleteEntry(en)} className="text-xs text-gray-400 hover:text-gray-900">Delete</button>
//                   </div>
//                 </div>
//               </motion.div>
//             ))}
//           </div>
//         )}
//       </Card>

//       <DailyUpdateForm date={todayKey()} dailyUpdate={detail?.dailyUpdate} onSaved={fetchToday} />

//       <ThisWeekView />

//       <WeeklyReportPanel />

//       <AttendanceComparisonPanel />

//       <TaskEntryModal isOpen={showModal} onClose={() => setShowModal(false)} date={todayKey()} editing={editing} onSaved={fetchToday} />
//     </div>
//   );
// };

// const TimesheetPage = () => {
//   const { user } = useAuth();
//   const [tab, setTab] = useState('today');

//   const isDeptHead = !!(user?.department?.headOf && String(user.department.headOf) === String(user?._id || user?.id));
//   const isHrAdmin = ['hr', 'admin'].includes(user?.role);

//   const tabs = [
//     { key: 'today', label: 'Today' },
//     { key: 'calendar', label: 'Calendar' },
//     ...(isDeptHead ? [{ key: 'team', label: 'Team View' }] : []),
//     ...(isHrAdmin ? [{ key: 'org', label: 'Org View' }, { key: 'reports', label: 'Reports' }] : []),
//   ];

//   return (
//     <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
//       <div className="flex gap-1 bg-violet-50 p-1 rounded-xl w-fit flex-wrap">
//         {tabs.map(t => (
//           <button key={t.key}
//             className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-violet-800 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}
//             onClick={() => setTab(t.key)}>
//             {t.label}
//           </button>
//         ))}
//       </div>

//       {tab === 'today' && <TodayTab />}
//       {tab === 'calendar' && <TimesheetCalendar />}
//       {tab === 'team' && isDeptHead && <TeamViewTable />}
//       {tab === 'org' && isHrAdmin && <OrgDashboard />}
//       {tab === 'reports' && isHrAdmin && <TimesheetReports />}
//     </div>
//   );
// };

// export default TimesheetPage;
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/UI/Card';
import EmptyState from '../../components/UI/EmptyState';
import TaskEntryModal from './TaskEntryModal';
import DailyUpdateForm from './DailyUpdateForm';
import TimesheetCalendar from './TimesheetCalendar';
import TeamViewTable from './TeamViewTable';
import OrgDashboard from './OrgDashboard';
import TimesheetReports from './TimesheetReports';
import AttendanceComparisonPanel from './AttendanceComparisonPanel';
import WeeklyReportPanel from './WeeklyReportPanel';
import OverdueTasksBadge from './OverdueTasksBadge';
import ThisWeekView from './ThisWeekView';
import DailyHistory from './DailyHistory';
import IntelligenceDashboard from './IntelligenceDashboard';
import FocusNudge from './FocusNudge';
import { fmtRange, todayLocal } from './timesheetUtils';

const todayKey = todayLocal;

/* =========================================================
   INTELLIGENCE HELPERS — per-user history analysis
   ========================================================= */

const normaliseTask = (s = '') => s.trim().toLowerCase().replace(/\s+/g, ' ');

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stdDev = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
};

/**
 * Build per-user benchmarks from historical entries.
 * Groups by normalised task name (falls back to workCategory).
 */
const buildBenchmarks = (history = []) => {
  const groups = {};
  history.forEach((e) => {
    const key = normaliseTask(e.task) || normaliseTask(e.workCategory) || 'other';
    if (!groups[key]) groups[key] = [];
    if (typeof e.hours === 'number') groups[key].push(e.hours);
  });

  const bench = {};
  Object.entries(groups).forEach(([key, hours]) => {
    if (hours.length === 0) return;
    bench[key] = {
      count: hours.length,
      avg: +mean(hours).toFixed(2),
      median: +median(hours).toFixed(2),
      min: Math.min(...hours),
      max: Math.max(...hours),
      std: +stdDev(hours).toFixed(2),
    };
  });
  return bench;
};

/**
 * Evaluate an entry against its benchmark.
 * Returns { status, ratio, label, tone, detail }
 */
const evaluateEntry = (entry, bench) => {
  const key = normaliseTask(entry.task) || normaliseTask(entry.workCategory) || 'other';
  const b = bench[key];
  if (!b || b.count < 2) return null; // not enough history

  const hours = entry.hours || 0;
  const ratio = b.avg > 0 ? hours / b.avg : 1;
  const z = b.std > 0 ? (hours - b.avg) / b.std : 0;

  let status = 'on-track';
  let label = 'On par';
  let tone = 'slate';
  let detail = `Usual: ${b.avg}h`;

  if (ratio <= 0.7) {
    status = 'faster';
    label = `${Math.round((1 - ratio) * 100)}% faster`;
    tone = 'emerald';
    detail = `Took ${hours}h · usually ${b.avg}h`;
  } else if (ratio >= 1.5) {
    status = 'slower';
    label = `${ratio.toFixed(1)}× slower`;
    tone = 'rose';
    detail = `Took ${hours}h · usually ${b.avg}h`;
  } else if (Math.abs(z) >= 2) {
    status = 'outlier';
    label = z > 0 ? 'Unusually long' : 'Unusually short';
    tone = 'amber';
    detail = `${hours}h vs ${b.avg}h avg`;
  } else {
    detail = `${hours}h · avg ${b.avg}h (${b.count}x)`;
  }

  return { status, ratio, z, label, tone, detail, benchmark: b };
};

/**
 * Aggregate insights for a set of entries + benchmarks.
 */
const buildInsights = (entries = [], bench = {}) => {
  const insights = [];
  if (!entries.length) return insights;

  let faster = 0,
    slower = 0,
    outlier = 0;
  let totalSaved = 0,
    totalOver = 0;

  entries.forEach((e) => {
    const ev = evaluateEntry(e, bench);
    if (!ev) return;
    if (ev.status === 'faster') {
      faster++;
      totalSaved += ev.benchmark.avg - (e.hours || 0);
    } else if (ev.status === 'slower') {
      slower++;
      totalOver += (e.hours || 0) - ev.benchmark.avg;
    } else if (ev.status === 'outlier') {
      outlier++;
    }
  });

  if (faster > 0) {
    insights.push({
      tone: 'emerald',
      icon: '⚡',
      text: `${faster} task${faster > 1 ? 's' : ''} completed faster than your usual pace — saved ~${totalSaved.toFixed(1)}h.`,
    });
  }
  if (slower > 0) {
    insights.push({
      tone: 'rose',
      icon: '🐢',
      text: `${slower} task${slower > 1 ? 's' : ''} took longer than usual — ~${totalOver.toFixed(1)}h over your typical pace.`,
    });
  }
  if (outlier > 0) {
    insights.push({
      tone: 'amber',
      icon: '⚠',
      text: `${outlier} entr${outlier > 1 ? 'ies' : 'y'} deviated significantly from your history.`,
    });
  }
  if (!insights.length) {
    insights.push({
      tone: 'violet',
      icon: '📊',
      text: 'Your tasks are tracking within your usual pace. Keep logging to build sharper benchmarks.',
    });
  }
  return insights;
};

/* ---------- Small UI atoms ---------- */

const toneClasses = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  slate: 'bg-slate-50 text-slate-600 ring-slate-200',
};

const EfficiencyBadge = ({ evaluation }) => {
  if (!evaluation) return null;
  const { label, tone, detail } = evaluation;
  return (
    <span
      title={detail}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${toneClasses[tone]}`}
    >
      {tone === 'emerald' && '⚡'}
      {tone === 'rose' && '🐢'}
      {tone === 'amber' && '⚠'}
      {label}
    </span>
  );
};

const MiniRing = ({ value = 0, size = 48, stroke = 5 }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#fbbf24"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold text-white">{value}%</span>
      </div>
    </div>
  );
};

const StatusPill = ({ status }) => {
  const map = {
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    'In Progress': 'bg-amber-50 text-amber-700 ring-amber-200',
    'Not Started': 'bg-slate-50 text-slate-600 ring-slate-200',
    Blocked: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
  const dot = {
    Completed: 'bg-emerald-500',
    'In Progress': 'bg-amber-500',
    'Not Started': 'bg-slate-400',
    Blocked: 'bg-rose-500',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
        map[status] || 'bg-slate-50 text-slate-600 ring-slate-200'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] || 'bg-slate-400'}`} />
      {status}
    </span>
  );
};

/* ---------- Intelligence panel ---------- */

const IntelligencePanel = ({ insights, benchmarks }) => {
  const topBench = useMemo(() => {
    return Object.entries(benchmarks)
      .filter(([, b]) => b.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4);
  }, [benchmarks]);

  if (!insights.length && !topBench.length) return null;

  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/40 shadow-sm">
      <div className="flex items-center gap-2 border-b border-violet-100 px-4 py-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-violet-900">Smart Insights</h3>
        <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          based on your history
        </span>
      </div>

      <div className="space-y-2 p-3">
        {insights.map((ins, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ring-1 ${toneClasses[ins.tone]}`}
          >
            <span className="text-sm leading-none">{ins.icon}</span>
            <span className="leading-snug">{ins.text}</span>
          </div>
        ))}
      </div>

      {topBench.length > 0 && (
        <div className="border-t border-violet-100 px-3 py-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
            Your usual pace
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {topBench.map(([key, b]) => (
              <div key={key} className="rounded-lg bg-white/70 px-2 py-1.5 ring-1 ring-violet-100">
                <p className="truncate text-[10px] font-medium capitalize text-violet-500" title={key}>
                  {key}
                </p>
                <p className="text-sm font-bold text-violet-900">
                  {b.avg}h
                  <span className="ml-1 text-[10px] font-medium text-violet-400">({b.count}x)</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Today tab (redesigned) ---------- */

const TodayTab = () => {
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchToday = useCallback(async () => {
    try {
      const res = await api.get(`/timesheets/day/${todayKey()}`);
      setDetail(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get('/timesheets/history?days=90');
      const raw = res.data?.entries || res.data || [];
      setHistory(Array.isArray(raw) ? raw : []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchToday();
    fetchHistory();
  }, [fetchToday, fetchHistory]);

  /* ----- intelligence ----- */
  const benchmarks = useMemo(() => buildBenchmarks(history), [history]);

  const entries = useMemo(
    () =>
      [...(detail?.entries || [])].sort((a, b) =>
        (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
      ),
    [detail]
  );

  const nextStart = entries.reduce(
    (latest, e) => (e.endTime && e.endTime > latest ? e.endTime : latest),
    ''
  );
  const totalHours = detail?.totalHours || 0;
  const completed = entries.filter((e) => e.status === 'Completed').length;
  const inProgress = entries.filter((e) => e.status === 'In Progress').length;
  const pending = entries.filter(
    (e) => e.status === 'Not Started' || e.status === 'Blocked'
  ).length;
  const productivityPct =
    entries.length === 0 ? 0 : Math.round((completed / entries.length) * 100);

  const evaluations = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      map[e._id] = evaluateEntry(e, benchmarks);
    });
    return map;
  }, [entries, benchmarks]);

  const insights = useMemo(
    () => buildInsights(entries, benchmarks),
    [entries, benchmarks]
  );

  const filteredEntries =
    filter === 'all'
      ? entries
      : entries.filter((e) =>
          filter === 'pending'
            ? e.status === 'Not Started' || e.status === 'Blocked'
            : e.status === filter
        );

  const openEdit = (entry) => {
    setEditing({ ...entry, timesheetId: detail._id });
    setShowModal(true);
  };
  const openNew = () => {
    setEditing(null);
    setShowModal(true);
  };

  const deleteEntry = async (entry) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.delete(`/timesheets/${detail._id}/entry/${entry._id}`);
      toast.success('Task deleted');
      fetchToday();
      fetchHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleSaved = () => {
    fetchToday();
    fetchHistory();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-violet-100/50" />
        <div className="h-40 animate-pulse rounded-2xl bg-violet-100/50" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* === Hero bar === */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-violet-700 to-indigo-800 p-4 text-white shadow-lg shadow-violet-200/50 sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Left: Ring + text */}
          <div className="flex items-center gap-4">
            <MiniRing value={productivityPct} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-violet-200">
                {today}
              </p>
              <h2 className="truncate text-lg font-bold sm:text-xl">
                You logged <span className="text-amber-300">{totalHours}h</span> today
              </h2>
              <p className="mt-0.5 truncate text-xs text-violet-100/90">
                {entries.length === 0
                  ? 'No tasks yet — add your first one.'
                  : `${completed} of ${entries.length} tasks completed.`}
              </p>
            </div>
          </div>

          {/* Right: Stats + Add button */}
          <div className="flex items-center gap-3 sm:ml-auto sm:gap-5">
            <div className="flex items-center gap-4 border-l border-white/15 pl-4 sm:gap-6 sm:pl-6">
              <MiniStat label="Done" value={completed} tone="text-emerald-300" />
              <MiniStat label="Active" value={inProgress} tone="text-amber-300" />
              <MiniStat label="Pending" value={pending} tone="text-rose-300" />
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:block">
                <OverdueTasksBadge />
              </div>
              <button
                onClick={openNew}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-md transition hover:bg-violet-50 active:scale-[0.98]"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* === Intelligence panel === */}
      <IntelligencePanel insights={insights} benchmarks={benchmarks} />
      <FocusNudge refreshKey={entries.map(en => en.task).join('|')} />

      {/* === KPI row + tasks === */}
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        {/* Tasks card */}
        <div className="rounded-2xl border border-violet-100 bg-white shadow-sm">
          {/* Header */}
          <div className="flex flex-col gap-3 border-b border-violet-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-violet-900">Today's Tasks</h3>
              <p className="text-[11px] text-violet-400">{entries.length} items</p>
            </div>

            <div className="flex gap-1 rounded-lg bg-violet-50 p-0.5">
              {[
                { k: 'all', label: 'All' },
                { k: 'Completed', label: 'Done' },
                { k: 'In Progress', label: 'Active' },
                { k: 'pending', label: 'Pending' },
              ].map((f) => (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    filter === f.k
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'text-violet-500 hover:text-violet-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Task list */}
          <div className="p-3">
            {filteredEntries.length === 0 ? (
              <EmptyState
                title={entries.length === 0 ? 'No tasks logged yet' : 'Nothing here'}
                message={
                  entries.length === 0
                    ? 'Add your first task for today.'
                    : 'No tasks match this filter.'
                }
                action={
                  entries.length === 0
                    ? { label: '+ Add Task', onClick: openNew }
                    : undefined
                }
              />
            ) : (
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {filteredEntries.map((en) => {
                    const ev = evaluations[en._id];
                    return (
                      <motion.li
                        key={en._id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.15 }}
                        className="group relative flex items-center gap-3 rounded-xl bg-violet-50/40 px-3 py-2.5 transition hover:bg-violet-50"
                      >
                        <span
                          className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${
                            en.status === 'Completed'
                              ? 'bg-emerald-400'
                              : en.status === 'Blocked'
                              ? 'bg-rose-400'
                              : en.status === 'In Progress'
                              ? 'bg-amber-400'
                              : 'bg-slate-300'
                          }`}
                        />

                        <div className="min-w-0 flex-1 pl-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {fmtRange(en.startTime, en.endTime) && (
                              <span className="text-[11px] font-semibold text-violet-600">
                                {fmtRange(en.startTime, en.endTime)}
                              </span>
                            )}
                            <span className="truncate text-sm font-semibold text-violet-900">
                              {en.task}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-violet-600 ring-1 ring-violet-100">
                              {en.hours}h
                            </span>
                            <StatusPill status={en.status} />
                            <EfficiencyBadge evaluation={ev} />
                          </div>

                          {en.insight?.message && (
                            <p
                              className={`mt-1 rounded-lg px-2 py-1 text-[11px] leading-snug ring-1 ${
                                en.insight.verdict === 'over'
                                  ? toneClasses.rose
                                  : en.insight.verdict === 'in-progress'
                                  ? toneClasses.violet
                                  : toneClasses.emerald
                              }`}
                            >
                              {en.insight.message}
                            </p>
                          )}

                          {(en.workCategory || en.project?.name || ev?.detail) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-violet-500">
                              {en.workCategory && <span>{en.workCategory}</span>}
                              {en.project?.name && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="h-1 w-1 rounded-full bg-violet-400" />
                                  {en.project.name}
                                </span>
                              )}
                              {ev?.detail && (
                                <span className="text-violet-400">· {ev.detail}</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => openEdit(en)}
                            className="rounded-md p-1.5 text-violet-500 transition hover:bg-violet-100 hover:text-violet-700"
                            title="Edit"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteEntry(en)}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Delete"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>

        {/* KPI column */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <CompactKpi
            label="Total Hours"
            value={`${totalHours}h`}
            bar="from-violet-500 to-indigo-500"
          />
          <CompactKpi
            label="Total Tasks"
            value={entries.length}
            bar="from-amber-400 to-orange-500"
          />
        </div>
      </div>

      {/* === Bottom grids === */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <DailyUpdateForm
          date={todayKey()}
          dailyUpdate={detail?.dailyUpdate}
          onSaved={handleSaved}
        />
        <ThisWeekView />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <WeeklyReportPanel />
        <AttendanceComparisonPanel />
      </div>

      <TaskEntryModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        date={todayKey()}
        editing={editing}
        defaultStart={nextStart}
        onSaved={handleSaved}
      />
    </div>
  );
};

const MiniStat = ({ label, value, tone }) => (
  <div className="text-center">
    <p className={`text-base font-bold leading-none ${tone}`}>{value}</p>
    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-200">
      {label}
    </p>
  </div>
);

const CompactKpi = ({ label, value, bar }) => (
  <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-white p-3.5 shadow-sm">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">
      {label}
    </p>
    <p className="mt-1 text-xl font-bold text-violet-900">{value}</p>
    <div className={`mt-2 h-1 w-10 rounded-full bg-gradient-to-r ${bar}`} />
  </div>
);

/* ---------- Page shell (redesigned) ---------- */

const TimesheetPage = () => {
  const { user } = useAuth();
  const isDeptHead = !!(
    user?.department?.headOf &&
    String(user.department.headOf) === String(user?._id || user?.id)
  );
  const isHrAdmin = ['hr', 'admin'].includes(user?.role);
  const [tab, setTab] = useState(isHrAdmin ? 'org' : 'today');

  const tabs = [
    ...(isHrAdmin ? [{ key: 'org', label: 'Org' }] : []),
    { key: 'today', label: 'Today' },
    { key: 'history', label: 'History' },
    { key: 'calendar', label: 'Calendar' },
    ...(isDeptHead ? [{ key: 'team', label: 'Team' }] : []),
    ...(isHrAdmin
      ? [
          { key: 'intelligence', label: 'Intelligence' },
          { key: 'reports', label: 'Reports' },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-violet-50/40">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-violet-950 sm:text-3xl">
              Timesheet
            </h1>
            <p className="mt-1 text-sm text-violet-500">
              Track your daily work and progress.
            </p>
          </div>

          {/* Tabs */}
          <div className="relative inline-flex flex-wrap gap-0.5 rounded-xl border border-violet-100 bg-white p-1 shadow-sm">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative z-10 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === t.key
                    ? 'text-white'
                    : 'text-violet-600 hover:text-violet-800'
                }`}
              >
                {tab === t.key && (
                  <motion.span
                    layoutId="tabBg"
                    className="absolute inset-0 -z-10 rounded-lg bg-violet-600 shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {tab === 'today' && <TodayTab />}
            {tab === 'history' && <DailyHistory />}
            {tab === 'calendar' && <TimesheetCalendar />}
            {tab === 'intelligence' && isHrAdmin && <IntelligenceDashboard />}
            {tab === 'team' && isDeptHead && <TeamViewTable />}
            {tab === 'org' && isHrAdmin && <OrgDashboard />}
            {tab === 'reports' && isHrAdmin && <TimesheetReports />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TimesheetPage;