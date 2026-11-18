/**
 * Workspace/Overview.jsx
 * Workspace Overview — project & task performance dashboard across departments.
 * Single source of truth: GET /api/workspace/overview (filtered by year/month/week/department).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import GlobalFilters from '../../components/UI/Globalfilters';

/* ── tiny icon (matches AdminEmployeeHub's Icon convention) ── */
const Icon = ({ d, size = 15, className = '', sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const IC = {
  projects: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  tasks: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4',
  progress: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  budget: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  refresh: 'M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.9 3.4M19.5 9A8 8 0 004.6 5.6',
  clear: 'M6 6l12 12M6 18L18 6',
  chevron: 'M9 5l7 7-7 7',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
};

/* ── helpers ── */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);
const WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => i + 1);

const STATUS_COLORS = {
  planning: '#3b82f6',
  'in-progress': '#8b5cf6',
  'on-hold': '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
  'not-started': '#94a3b8',
  review: '#f59e0b',
};

const formatINR = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(dateStr).toLocaleDateString();
};

const performanceRating = (progress = 0) => {
  if (progress >= 80) return { label: 'Good', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
  if (progress >= 60) return { label: 'Average', color: 'text-blue-600 bg-blue-50 border-blue-100' };
  if (progress >= 40) return { label: 'Needs Attention', color: 'text-amber-600 bg-amber-50 border-amber-100' };
  return { label: 'Critical', color: 'text-red-600 bg-red-50 border-red-100' };
};

const titleCase = (s = '') => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ════════════════════════════════════════════════════════════════
   SKELETON / ERROR / EMPTY STATES
════════════════════════════════════════════════════════════════ */
const SkeletonCard = ({ className = '' }) => (
  <div className={`glass-card p-5 animate-pulse ${className}`}>
    <div className="h-3 w-20 bg-gray-100 rounded mb-3" />
    <div className="h-6 w-16 bg-gray-100 rounded mb-2" />
    <div className="h-2.5 w-24 bg-gray-100 rounded" />
  </div>
);

const OverviewSkeleton = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-64" />
    </div>
    <SkeletonCard className="h-56" />
    <div className="grid lg:grid-cols-2 gap-4">
      <SkeletonCard className="h-72" />
      <SkeletonCard className="h-72" />
    </div>
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div className="glass-card p-10 flex flex-col items-center text-center gap-3">
    <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center">
      <Icon d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 004 21h16a2 2 0 001.89-3L13.71 3.86a2 2 0 00-3.42 0z" size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">Unable to load workspace overview.</p>
    <button
      onClick={onRetry}
      className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors">
      <Icon d={IC.refresh} size={13} />
      Try Again
    </button>
  </div>
);

const EmptyState = ({ onClear }) => (
  <div className="glass-card p-10 flex flex-col items-center text-center gap-2">
    <div className="w-11 h-11 rounded-xl bg-gray-100 border border-gray-200 text-gray-400 flex items-center justify-center">
      <Icon d={IC.projects} size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">No workspace data found</p>
    <p className="text-xs text-gray-400 max-w-xs">There are no projects or tasks for the selected period.</p>
    <button
      onClick={onClear}
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors">
      <Icon d={IC.clear} size={13} />
      Clear Filters
    </button>
  </div>
);
/* ════════════════════════════════════════════════════════════════
   PROJECT STATUS — donut chart (lightweight, dependency-free SVG)
════════════════════════════════════════════════════════════════ */
const DonutChart = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return null;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width={140} height={140} viewBox="0 0 140 140" className="flex-shrink-0 -rotate-90">
        <circle cx={70} cy={70} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={16} />
        {data.map((d) => {
          const frac = d.count / total;
          const dash = frac * circumference;
          const circle = (
            <circle
              key={d._id}
              cx={70} cy={70} r={radius}
              fill="none"
              stroke={STATUS_COLORS[d._id] || '#a1a1aa'}
              strokeWidth={16}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsetAcc}
              strokeLinecap="butt"
            />
          );
          offsetAcc += dash;
          return circle;
        })}
      </svg>
      <div className="space-y-2 min-w-0">
        {data.map((d) => (
          <div key={d._id} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[d._id] || '#a1a1aa' }} />
            <span className="text-gray-500 font-medium truncate">{titleCase(d._id)}</span>
            <span className="text-gray-900 font-bold ml-auto pl-3">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   TASK STATUS — legend + percentage bars
════════════════════════════════════════════════════════════════ */
const TaskStatusChart = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return null;

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = Math.round((d.count / total) * 100);
        return (
          <div key={d._id}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-2 font-medium text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[d._id] || '#a1a1aa' }} />
                {titleCase(d._id)}
              </span>
              <span className="text-gray-900 font-bold">{pct}% <span className="text-gray-400 font-medium">({d.count})</span></span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: STATUS_COLORS[d._id] || '#a1a1aa' }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   DEPARTMENT PERFORMANCE
════════════════════════════════════════════════════════════════ */
const DepartmentPerformance = ({ data, onOpen }) => (
  <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
    {/* header row — hidden on mobile, table-like on larger screens */}
    <div className="hidden sm:grid grid-cols-[1.4fr_.7fr_.7fr_1.2fr_.9fr] gap-3 px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
      <span>Department</span>
      <span>Projects</span>
      <span>Tasks</span>
      <span>Progress</span>
      <span>Performance</span>
    </div>
    <div className="space-y-1.5">
      {data.map((dept) => {
        const rating = performanceRating(dept.projectProgress);
        return (
          <button
            key={dept._id}
            onClick={() => onOpen(dept._id)}
            className="w-full text-left grid grid-cols-2 sm:grid-cols-[1.4fr_.7fr_.7fr_1.2fr_.9fr] gap-3 items-center px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
            <div className="min-w-0 col-span-2 sm:col-span-1">
              <p className="text-sm font-bold text-gray-900 truncate">{dept.name}</p>
              <p className="text-[11px] text-gray-400">{dept.code}</p>
            </div>
            <span className="text-xs text-gray-600 font-medium sm:block hidden">{dept.projects} Projects</span>
            <span className="text-xs text-gray-600 font-medium sm:block hidden">{dept.tasks} Tasks</span>
            <div className="sm:hidden flex gap-3 text-[11px] text-gray-500 font-medium col-span-2">
              <span>{dept.projects} Projects</span>
              <span>{dept.tasks} Tasks</span>
            </div>
            <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
              <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${dept.projectProgress || 0}%` }} />
              </div>
              <span className="text-xs font-bold text-gray-700 w-9 text-right">{dept.projectProgress || 0}%</span>
            </div>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border w-fit ${rating.color}`}>{rating.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

/* ════════════════════════════════════════════════════════════════
   TOP PROJECTS
════════════════════════════════════════════════════════════════ */
const TopProjects = ({ data, onOpen }) => (
  <div className="space-y-3">
    {data.slice(0, 5).map((p) => (
      <button
        key={p._id}
        onClick={() => onOpen(p._id)}
        className="w-full text-left p-3.5 rounded-xl border border-gray-100 hover:border-violet-100 hover:bg-violet-50/40 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
            <p className="text-[11px] text-gray-400">
              {p.projectCode} · {p.department?.name || '—'} · {p.manager?.name || 'Unassigned'}
            </p>
          </div>
          <Badge status={p.status} className="flex-shrink-0" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full" style={{ width: `${p.progress || 0}%` }} />
          </div>
          <span className="text-xs font-bold text-gray-700 w-9 text-right">{p.progress || 0}%</span>
        </div>
      </button>
    ))}
  </div>
);

/* ════════════════════════════════════════════════════════════════
   RECENT ACTIVITY
════════════════════════════════════════════════════════════════ */
const RecentActivity = ({ data }) => (
  <div className="space-y-0">
    {data.map((a, i) => (
      <div key={i} className="flex gap-3 pb-4 last:pb-0">
        <div className="flex flex-col items-center flex-shrink-0">
          <span className={`w-2 h-2 rounded-full mt-1.5 ${a.type === 'project' ? 'bg-violet-500' : 'bg-blue-500'}`} />
          {i < data.length - 1 && <span className="w-px flex-1 bg-gray-100 mt-1" />}
        </div>
        <div className="min-w-0 pb-1">
          <p className="text-xs font-bold text-gray-900">{a.title}</p>
          <p className="text-xs text-gray-500 truncate">{a.task || a.project}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {a.department} · {formatRelativeTime(a.createdAt)}
          </p>
        </div>
      </div>
    ))}
  </div>
);

/* ════════════════════════════════════════════════════════════════
   MAIN: Overview
════════════════════════════════════════════════════════════════ */
const Overview = () => {
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    year: String(currentYear),
    month: '',
    week: '',
    department: '',
    project: '',
    manager: '',
    teamLead: '',
    employee: '',
  });

  const [state, setState] = useState({
    status: 'loading',
    data: null,
    access: null,
    filters: null,
  });
  const requestIdRef = useRef(0);

  /*
   * Real department list for the dropdown, independent of whatever the
   * overview response happens to contain for the current filters (an
   * empty-for-this-month department shouldn't disappear from the picker).
   *
   * ASSUMPTION: endpoint is GET /api/departments, following the same
   * convention as /api/tasks, /api/projects, /api/employees. Confirm the
   * real path/response shape and adjust the two spots marked below if it
   * differs — the parsing is written defensively so a shape mismatch
   * degrades to an empty list instead of crashing.
   */

  const fetchOverview = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState((s) => ({ status: 'loading', data: s.data })); // keep old data visible isn't required; skeleton on first load

    try {
      const params = {
        year: filters.year,
        month: filters.month || undefined,
        week: filters.week || undefined,
        department: filters.department || undefined,
        project: filters.project || undefined,
        manager: filters.manager || undefined,
        teamLead: filters.teamLead || undefined,
        employee: filters.employee || undefined,
      };
      const res = await api.get('/workspace/overview', { params });

      // Ignore stale responses if filters changed again mid-flight
      if (requestId !== requestIdRef.current) return;

      const response = res.data;

      const payload = response?.data || {};
      const access = response?.access || null;
      const backendFilters = response?.filters || null;

      setState({
        status: 'success',
        data: payload,
        access,
        filters: backendFilters,
      });
      // departmentOptions now comes from the dedicated /departments fetch
      // above, so the dropdown stays populated even when the current
      // filtered response has an empty departmentPerformance array.
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setState({ status: 'error', data: null });
    }
  }, [
    filters.year,
    filters.month,
    filters.week,
    filters.department,
    filters.project,
    filters.manager,
    filters.teamLead,
    filters.employee,
  ]);
  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const clearFilters = () =>
    setFilters({
      year: String(currentYear),
      month: '',
      week: '',
      department: '',
      project: '',
      manager: '',
      teamLead: '',
      employee: '',
    });

  const summary = state.data?.summary || {};
  const isEmpty =
    state.status === 'success' &&
    !summary.totalProjects &&
    !summary.totalTasks;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Workspace Overview</h2>
          <p className="text-sm text-gray-400 mt-0.5">Project and task performance across all departments</p>
        </div>
      </div>


      {/* Loading */}
      {state.status === 'loading' && <OverviewSkeleton />}

      {/* Error */}
      {state.status === 'error' && <ErrorState onRetry={fetchOverview} />}

      {/* Empty */}
      {isEmpty && <EmptyState onClear={clearFilters} />}

      {/* Success + has data */}
      {state.status === 'success' && !isEmpty && (
        <AnimatePresence mode="wait">
          <motion.div
            key={JSON.stringify(filters)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-5">

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Projects"
                value={summary.totalProjects ?? 0}
                icon={<Icon d={IC.projects} size={17} />}
                color="violet"
                trend={undefined}
                className=""
              />
              <KpiCard
                label="Tasks"
                value={summary.totalTasks ?? 0}
                icon={<Icon d={IC.tasks} size={17} />}
                color="green"
              />
              <KpiCard
                label="Average Progress"
                value={`${Math.round(summary.averageProjectProgress || 0)}%`}
                icon={<Icon d={IC.progress} size={17} />}
                color="golden"
              />
              <KpiCard
                label="Budget"
                value={formatINR(summary.totalBudget)}
                icon={<Icon d={IC.budget} size={17} />}
                color="red"
              />
            </div>

            <GlobalFilters
              filters={filters}
              setFilters={setFilters}
              enabledFilters={[
                'year',
                'month',
                'week',
                'department',
                'project',
                'manager',
                'teamLead',
                'employee',
              ]}
            />

            {/* sub-labels the KpiCard doesn't natively show */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 -mt-8 pointer-events-none select-none">
              <span className="text-[11px] text-gray-400 pl-1 pt-9">{summary.completedProjects ?? 0} completed</span>
              <span className="text-[11px] text-gray-400 pl-1 pt-9">{summary.completedTasks ?? 0} completed</span>
              <span className="text-[11px] text-gray-400 pl-1 pt-9">Project progress</span>
              <span className="text-[11px] text-gray-400 pl-1 pt-9">Total project budget</span>
            </div>

            {/* Analytics: Project Status + Task Status */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card animate={false}>
                <h3 className="text-sm font-bold text-gray-900 mb-4">Project Status</h3>
                {state.data.projectStatus?.length ? (
                  <DonutChart data={state.data.projectStatus} />
                ) : (
                  <p className="text-xs text-gray-400">No project status data.</p>
                )}
              </Card>

              <Card animate={false}>
                <h3 className="text-sm font-bold text-gray-900 mb-4">Task Status</h3>
                {state.data.taskStatus?.length ? (
                  <TaskStatusChart data={state.data.taskStatus} />
                ) : (
                  <p className="text-xs text-gray-400">No task status data.</p>
                )}
              </Card>
            </div>

            {/* Department Performance */}
            <Card animate={false}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Department Performance</h3>
              {state.data.departmentPerformance?.length ? (
                <DepartmentPerformance
                  data={state.data.departmentPerformance}
                  onOpen={(id) => navigate(`/admin/departments/${id}`)}
                />
              ) : (
                <p className="text-xs text-gray-400">No department data for this period.</p>
              )}
            </Card>

            {/* Bottom section: Top Projects + Recent Activity */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card animate={false}>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Top Projects</h3>
                {state.data.projectProgress?.length ? (
                  <TopProjects
                    data={state.data.projectProgress}
                    onOpen={(id) => navigate(`/projects/${id}`)}
                  />
                ) : (
                  <p className="text-xs text-gray-400">No projects for this period.</p>
                )}
              </Card>

              <Card animate={false}>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Recent Activity</h3>
                {state.data.recentActivity?.length ? (
                  <RecentActivity data={state.data.recentActivity} />
                ) : (
                  <p className="text-xs text-gray-400">No recent activity.</p>
                )}
              </Card>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};

export default Overview;