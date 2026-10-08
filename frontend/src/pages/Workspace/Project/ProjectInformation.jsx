/**
 * src/pages/Projects/ProjectInformation.jsx
 * Project Information + Project Analysis — rendered inside ProjectDetails.jsx's
 * "Overview" tab. Does NOT render its own nav and does NOT touch team
 * membership (that's TeamMembers.jsx).
 *
 * Accepts an optional `projectId` prop (as ProjectDetails.jsx is expected to
 * pass it per the spec: <ProjectInformation projectId={projectId} />) and
 * falls back to useParams() so the component also works if mounted directly
 * on the /admin/projects/:projectId route.
 *
 * ASSUMPTION TO VERIFY: task list endpoint is called as GET /tasks?project=:projectId
 * (the other documented option is ?projectId=:projectId). It's isolated in
 * `fetchTasks()` below — one line to change if your backend uses the other param.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import Card from '../../../components/UI/Card';
import Badge from '../../../components/UI/Badge';

/* ── icon helper ── */
const Icon = ({ d, size = 15, className = '', sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const IC = {
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  analysis: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14',
  tasks: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4',
  team: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  flag: 'M4 4v16m0-16h11l-2 4 2 4H4',
  alert: 'M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 004 21h16a2 2 0 001.89-3L13.71 3.86a2 2 0 00-3.42 0z',
  refresh: 'M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.9 3.4M19.5 9A8 8 0 004.6 5.6',
  overdue: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
};

/* ── constants ── */
const PRIORITY_STYLE = {
  low: 'text-blue-600 bg-blue-50 border-blue-100',
  medium: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  high: 'text-amber-600 bg-amber-50 border-amber-100',
  critical: 'text-rose-600 bg-rose-50 border-rose-100',
};

/* ── helpers ── */
const titleCase = (s = '') => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

const formatDate = (d) => {
  if (!d) return 'Not specified';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'Not specified';
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

const formatINR = (n) => {
  if (n === null || n === undefined || n === '' || isNaN(n)) return 'Not specified';
  return `₹${Number(n).toLocaleString('en-IN')}`;
};

const clamp = (n) => Math.min(100, Math.max(0, Number(n) || 0));

/** Defensively normalize GET /projects/:id — response.data.project | response.data.data | response.data */
const normalizeProject = (res) => {
  const body = res?.data;
  if (body?.project && typeof body.project === 'object') return body.project;
  if (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) return body.data;
  if (body && typeof body === 'object') return body;
  return null;
};

/** Defensively normalize a tasks list response — {tasks:[...]}, {data:[...]}, or bare array */
const normalizeTasks = (res) => {
  const body = res?.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.tasks)) return body.tasks;
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

const calculateTaskStats = (tasks = []) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = { totalTasks: tasks.length, completedTasks: 0, inProgressTasks: 0, pendingTasks: 0, overdueTasks: 0 };

  tasks.forEach((t) => {
    const status = t.status;
    const isDone = status === 'completed' || status === 'cancelled';
    const deadline = t.deadline || t.dueDate || t.endDate;
    const isOverdue = deadline && !isDone && new Date(deadline) < today;

    if (status === 'completed') stats.completedTasks += 1;
    else if (status === 'in-progress' || status === 'review') stats.inProgressTasks += 1;
    else if (status === 'not-started') stats.pendingTasks += 1;

    if (isOverdue) stats.overdueTasks += 1;
  });

  return stats;
};

const calculateTeamPerformance = (teamMembers = [], tasks = []) => {
  if (!teamMembers.length || !tasks.length) return [];
  return teamMembers.map((member) => {
    const memberTasks = tasks.filter((t) => {
      const assignee = t.assignedTo || t.assignee || t.member;
      const assigneeId = typeof assignee === 'object' ? assignee?._id : assignee;
      return assigneeId === member._id;
    });
    const completed = memberTasks.filter((t) => t.status === 'completed').length;
    const remaining = memberTasks.length - completed;
    const completionPct = memberTasks.length ? Math.round((completed / memberTasks.length) * 100) : 0;
    return { member, totalTasks: memberTasks.length, completed, remaining, completionPct };
  });
};

/* ════════════════════════════════════════════════════════════════
   SMALL PRESENTATIONAL PIECES
════════════════════════════════════════════════════════════════ */
const PriorityBadge = ({ priority }) => (
  <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-lg border ${PRIORITY_STYLE[priority] || 'text-gray-500 bg-gray-50 border-gray-100'}`}>
    {titleCase(priority || 'medium')}
  </span>
);

const ProgressBar = ({ value = 0, size = 'md', colorClass = 'bg-violet-500' }) => {
  const v = clamp(value);
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${height}`}>
      <motion.div
        className={`h-full rounded-full ${colorClass}`}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
    <div className="text-sm font-semibold text-gray-800">{children}</div>
  </div>
);

const StatCard = ({ label, value, icon, colorClass = 'text-violet-600 bg-violet-50 border-violet-100' }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -2 }}
    transition={{ duration: 0.2 }}
    className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${colorClass}`}>
      <Icon d={icon} size={16} />
    </div>
    <div className="min-w-0">
      <p className="text-lg font-extrabold text-gray-900 leading-none">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1 truncate">{label}</p>
    </div>
  </motion.div>
);

/* ════════════════════════════════════════════════════════════════
   LOADING / ERROR
════════════════════════════════════════════════════════════════ */
const SkeletonBlock = ({ className = '' }) => <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;

const InfoSkeleton = () => (
  <div className="space-y-5">
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
      <SkeletonBlock className="h-4 w-40" />
      <div className="grid sm:grid-cols-2 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonBlock className="h-2.5 w-20" />
            <SkeletonBlock className="h-3.5 w-32" />
          </div>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-16 rounded-2xl" />)}
    </div>
  </div>
);

const ErrorCard = ({ message, onRetry }) => (
  <div className="bg-white border border-gray-100 rounded-2xl p-10 flex flex-col items-center text-center gap-3 shadow-sm">
    <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center">
      <Icon d={IC.alert} size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">Unable to load project</p>
    <p className="text-xs text-gray-400 max-w-xs">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors">
        <Icon d={IC.refresh} size={13} />
        Retry
      </button>
    )}
  </div>
);

/* ════════════════════════════════════════════════════════════════
   PROJECT TIMELINE
════════════════════════════════════════════════════════════════ */
const ProjectTimeline = ({ startDate, endDate }) => {
  const { pct, todayLabel, hasBothDates } = useMemo(() => {
    if (!startDate || !endDate) return { pct: 0, todayLabel: formatDate(new Date()), hasBothDates: false };
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const now = Date.now();
    if (isNaN(start) || isNaN(end) || end <= start) return { pct: 0, todayLabel: formatDate(new Date()), hasBothDates: false };
    const ratio = ((now - start) / (end - start)) * 100;
    return { pct: clamp(ratio), todayLabel: formatDate(new Date()), hasBothDates: true };
  }, [startDate, endDate]);

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 mb-2">
        <span>{formatDate(startDate)}</span>
        <span className="text-violet-600">{todayLabel}</span>
        <span>{formatDate(endDate)}</span>
      </div>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-visible">
        <div className="h-full bg-violet-500 rounded-full" style={{ width: hasBothDates ? `${pct}%` : '0%' }} />
        {hasBothDates && (
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full bg-white border-2 border-violet-600 shadow -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
      {!hasBothDates && <p className="text-[11px] text-gray-300 mt-2">Start and end dates are needed to show timeline position.</p>}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   TEAM PERFORMANCE
════════════════════════════════════════════════════════════════ */
const TeamPerformance = ({ performance }) => {
  if (!performance.length) {
    return <p className="text-xs text-gray-400">No team task data available yet.</p>;
  }
  return (
    <div className="space-y-3">
      {performance.map(({ member, completed, remaining, completionPct }) => (
        <div key={member._id} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {initials(member.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-gray-700 truncate">{member.name}</span>
              <span className="text-gray-400">{completed} done · {remaining} left</span>
            </div>
            <ProgressBar value={completionPct} size="sm" />
          </div>
          <span className="text-xs font-bold text-gray-700 w-9 text-right flex-shrink-0">{completionPct}%</span>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   MAIN: ProjectInformation
════════════════════════════════════════════════════════════════ */
const ProjectInformation = ({ projectId: projectIdProp }) => {
  const params = useParams();
  const projectId = projectIdProp || params.projectId;

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [errorMessage, setErrorMessage] = useState('');

  const fetchTasks = useCallback(async (id) => {
    try {
      // ASSUMPTION: query param is `project`. If your backend expects `projectId`
      // instead, change the key below — this is the only place it's used.
      const res = await api.get('/tasks', { params: { project: id } });
      return normalizeTasks(res);
    } catch {
      // Non-fatal: project info still renders without task analysis.
      return [];
    }
  }, []);

  const loadProject = useCallback(async () => {
    if (!projectId) {
      setStatus('error');
      setErrorMessage('No project selected.');
      return;
    }
    setStatus('loading');
    setErrorMessage('');
    try {
      console.log('PROJECT ID:', projectId);
      const res = await api.get(`/projects/${projectId}`);
      console.log('PROJECT RESPONSE:', res.data);

      const normalized = normalizeProject(res);
      if (!normalized) throw new Error('Unexpected response shape from the server.');
      console.log('PROJECT:', normalized);
      setProject(normalized);

      // Reuse task data already embedded in the project response if present;
      // otherwise make exactly one additional call.
      const embeddedTasks = normalized.tasks || normalized.taskList;
      if (Array.isArray(embeddedTasks)) {
        setTasks(embeddedTasks);
      } else {
        const fetched = await fetchTasks(projectId);
        setTasks(fetched);
      }

      setStatus('success');
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Something went wrong while loading this project.';
      setErrorMessage(message);
      setStatus('error');
      toast.error(message);
    }
  }, [projectId, fetchTasks]);

  useEffect(() => { loadProject(); }, [loadProject]);

  const taskStats = useMemo(() => calculateTaskStats(tasks), [tasks]);
  const teamPerformance = useMemo(
    () => calculateTeamPerformance(project?.teamMembers || [], tasks),
    [project?.teamMembers, tasks]
  );
  const overallTeamCompletionPct = useMemo(() => {
    if (!teamPerformance.length) return 0;
    const totalTasks = teamPerformance.reduce((s, p) => s + p.totalTasks, 0);
    const totalCompleted = teamPerformance.reduce((s, p) => s + p.completed, 0);
    return totalTasks ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  }, [teamPerformance]);

  if (status === 'loading') return <InfoSkeleton />;
  if (status === 'error') return <ErrorCard message={errorMessage} onRetry={loadProject} />;
  if (!project) return <ErrorCard message="Project data is unavailable." onRetry={loadProject} />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-5">

      {/* ── PROJECT INFORMATION ── */}
      <Card animate={false}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center">
            <Icon d={IC.info} size={15} />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Project Information</h3>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Project Name">{project.name || 'Untitled Project'}</Field>
          <Field label="Project Code">{project.projectCode || '—'}</Field>

          <div className="sm:col-span-2">
            <Field label="Description">
              <span className="font-normal text-gray-600">{project.description || 'No description provided.'}</span>
            </Field>
          </div>

          <Field label="Client">{project.client || 'Not specified'}</Field>
          <Field label="Department">{project.department?.name || 'Not assigned'}</Field>

          <Field label="Team Lead">{project.manager?.name || 'Unassigned'}</Field>
          <Field label="Start Date">{formatDate(project.startDate)}</Field>

          <Field label="End Date">{formatDate(project.endDate)}</Field>
          <Field label="Status"><Badge status={project.status} /></Field>

          <Field label="Priority"><PriorityBadge priority={project.priority} /></Field>
          <Field label="Budget">{formatINR(project.budget)}</Field>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-50">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-gray-700">Overall Progress</span>
            <span className="font-extrabold text-violet-600">{clamp(project.progress)}%</span>
          </div>
          <ProgressBar value={project.progress} />
        </div>
      </Card>

      {/* ── PROJECT ANALYSIS ── */}
      <Card animate={false}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
            <Icon d={IC.analysis} size={15} />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Project Analysis</h3>
        </div>

        {/* Task statistics */}
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Task Statistics</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Tasks" value={taskStats.totalTasks} icon={IC.tasks} colorClass="text-violet-600 bg-violet-50 border-violet-100" />
          <StatCard label="Completed" value={taskStats.completedTasks} icon={IC.flag} colorClass="text-emerald-600 bg-emerald-50 border-emerald-100" />
          <StatCard label="In Progress" value={taskStats.inProgressTasks} icon={IC.clock} colorClass="text-blue-600 bg-blue-50 border-blue-100" />
          <StatCard label="Pending" value={taskStats.pendingTasks} icon={IC.tasks} colorClass="text-amber-600 bg-amber-50 border-amber-100" />
          <StatCard label="Overdue" value={taskStats.overdueTasks} icon={IC.overdue} colorClass="text-rose-600 bg-rose-50 border-rose-100" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Team performance */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Team Performance</p>
              <span className="text-xs font-extrabold text-violet-600">{overallTeamCompletionPct}% overall</span>
            </div>
            <TeamPerformance performance={teamPerformance} />
          </div>

          {/* Overall progress recap */}
          <div className="flex flex-col justify-center items-center bg-gray-50/60 border border-gray-100 rounded-xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Overall Progress</p>
            <p className="text-3xl font-extrabold text-violet-600">{clamp(project.progress)}%</p>
            <div className="w-32 mt-2"><ProgressBar value={project.progress} size="sm" /></div>
          </div>
        </div>

        {/* Timeline */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Project Timeline</p>
          <ProjectTimeline startDate={project.startDate} endDate={project.endDate} />
        </div>
      </Card>
    </motion.div>
  );
};

export default ProjectInformation;