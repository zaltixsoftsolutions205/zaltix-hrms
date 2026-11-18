/**
 * Workspace/Projects.jsx
 * Reusable project management page — used standalone ("All Projects") and embedded
 * inside Department Details via the `departmentId` prop ("Department Projects").
 *
 * NOTE ON ASSUMPTIONS (please verify / adjust):
 *  - Modal component signature assumed as:
 *      <Modal isOpen={bool} onClose={fn} title={string} size="lg" footer={node}>{children}</Modal>
 *    Adjust the four <Modal .../> usages below if your real prop names differ.
 *  - GET /api/departments assumed to return either { departments: [...] } or a bare array.
 *  - GET /api/employees?department=ID assumed to return either { employees: [...] } or a bare array.
 *  Both are read defensively (see `unwrap()` below) so a shape mismatch won't crash the page,
 *  but double check the field names (name/email/employeeId) match your Employee model.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Modal from '../../components/UI/Modal';
import Card, { KpiCard } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import { useAuth } from '../../contexts/AuthContext';
// CHANGED: added canAccessView alongside the already-imported canAccessEdit.
// Both come from the existing module permission registry — no new helper created.
import { ROLE_DEFAULT_ACCESS, PERMISSIONS, canAccessView, canAccessEdit } from '../../constants/modules';
import ModuleAccessPicker from '../../components/UI/ModuleAccessPicker';
import { DepartmentSelect, EmployeeSelect, EmployeeMultiSelect } from '../../components/UI/Assignmentselects';
import GlobalFilters from '../../components/UI/Globalfilters';

/* ── icon helper (matches AdminEmployeeHub convention) ── */
const Icon = ({ d, size = 15, className = '', sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const IC = {
  projects: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  active: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  progress: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  completed: 'M5 13l4 4L19 7',
  hold: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
  plus: 'M12 5v14m-7-7h14',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  dots: 'M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z',
  archive: 'M21 8v13H3V8M1 3h22v5H1V3zm9 8h4',
  restore: 'M4 4v6h6M4 10a8 8 0 1116.9 3.4',
  trash: 'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z',
  edit: 'M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 8.5-8.5z',
  open: 'M14 5l7 7m0 0l-7 7m7-7H3',
  refresh: 'M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.9 3.4M19.5 9A8 8 0 004.6 5.6',
  x: 'M6 6l12 12M6 18L18 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4',
  alert: 'M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 004 21h16a2 2 0 001.89-3L13.71 3.86a2 2 0 00-3.42 0z',
};

/* ── constants ── */
const STATUS_OPTIONS = ['planning', 'in-progress', 'on-hold', 'completed', 'cancelled'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];
const STATUS_DOT = {
  planning: 'bg-blue-500', 'in-progress': 'bg-violet-500', 'on-hold': 'bg-amber-500',
  completed: 'bg-emerald-500', cancelled: 'bg-red-500',
};
const PRIORITY_STYLE = {
  low: 'text-blue-600 bg-blue-50 border-blue-100',
  medium: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  high: 'text-amber-600 bg-amber-50 border-amber-100',
  critical: 'text-rose-600 bg-rose-50 border-rose-100',
};
const PAGE_SIZE = 9;

const titleCase = (s = '') => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '—');
const formatINR = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
};
/** Defensively unwrap `{ items: [...] }` or a bare `[...]` API response. */
const unwrap = (res, key) => {
  const body = res?.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.[key])) return body[key];
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

/* ════════════════════════════════════════════════════════════════
   SMALL PRESENTATIONAL PIECES
════════════════════════════════════════════════════════════════ */
const PriorityBadge = ({ priority }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${PRIORITY_STYLE[priority] || 'text-gray-500 bg-gray-50 border-gray-100'}`}>
    {titleCase(priority || 'medium')}
  </span>
);

const ProgressBar = ({ value = 0, className = '' }) => (
  <div className={`h-1.5 w-full bg-gray-100 rounded-full overflow-hidden ${className}`}>
    <motion.div
      className="h-full bg-violet-500 rounded-full"
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    />
  </div>
);

const AvatarStack = ({ members = [] }) => {
  const shown = members.slice(0, 3);
  const rest = members.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((m) => (
        <div key={m._id} title={m.name}
          className="w-6 h-6 rounded-full bg-violet-100 border-2 border-white text-violet-700 text-[9px] font-bold flex items-center justify-center">
          {initials(m.name)}
        </div>
      ))}
      {rest > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white text-gray-500 text-[9px] font-bold flex items-center justify-center">
          +{rest}
        </div>
      )}
      {members.length === 0 && <span className="text-[11px] text-gray-300">No members</span>}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   ACTION MENU (per-card kebab dropdown)
════════════════════════════════════════════════════════════════ */
const ActionMenu = ({ project, canEdit, canArchive, canDelete, onOpen, onEdit, onArchiveToggle, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click. Bound to 'mousedown' but scoped to this menu's own
  // DOM subtree via ref.contains, so clicking an item inside the dropdown never
  // triggers a premature close before the item's own onClick fires.
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Also close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    console.log('ACTION MENU RENDER', { projectId: project?._id, open, canEdit, canArchive, canDelete });
  }, [project?._id, open, canEdit, canArchive, canDelete]);

  const item = (label, icon, onClick, danger = false) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`ACTION MENU ITEM CLICKED: ${label}`, project?._id);
        setOpen(false);
        onClick();
      }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-50'}`}>
      <Icon d={icon} size={13} />
      <span>{label}</span>
    </button>
  );

  return (
    // This div is the ONLY positioned ancestor for the dropdown — never nest this
    // whole block inside a <button>. The kebab trigger below is a sibling of the
    // dropdown, not its parent, so the dropdown is never "inside" the trigger.
    <div className="relative" ref={ref}>
      <button type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('ACTION MENU TOGGLE', { projectId: project?._id, canEdit, wasOpen: open }); setOpen((o) => !o); }}
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative z-10 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors">
        <Icon d={IC.dots} size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-8 z-50 w-40 bg-white border border-gray-100 rounded-xl shadow-lg p-1.5">
            {item('Open', IC.open, () => onOpen(project))}
            {canEdit && item('Edit', IC.edit, () => onEdit(project))}
            {!canEdit && (
              <div className="text-[11px] text-gray-300 px-3 py-1.5">Edit not available</div>
            )}
            {canArchive && item(project.isActive === false ? 'Restore' : 'Archive', project.isActive === false ? IC.restore : IC.archive, () => onArchiveToggle(project))}
            {canDelete && item('Delete', IC.trash, () => onDelete(project), true)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   PROJECT CARD
════════════════════════════════════════════════════════════════ */
const ProjectCard = ({ project, permissions, onOpen, onEdit, onArchiveToggle, onDelete }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -2 }}
    transition={{ duration: 0.2 }}
    onClick={() => onOpen(project)}
    className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all cursor-pointer flex flex-col">

    <div className="flex items-start justify-between gap-2 mb-1" onClick={(e) => e.stopPropagation()}>
      <span className="text-[11px] font-bold text-violet-500 tracking-wide">{project.projectCode}</span>
      <ActionMenu
        project={project}
        canEdit={permissions.canEdit(project)}
        canArchive={permissions.canArchive(project)}
        canDelete={permissions.canDelete(project)}
        onOpen={(proj) => { console.log('ACTION MENU -> onOpen', proj?._id); onOpen(proj); }}
        onEdit={(proj) => { console.log('ACTION MENU -> onEdit', proj?._id); onEdit(proj); }}
        onArchiveToggle={onArchiveToggle}
        onDelete={onDelete}
      />
    </div>

    <h3 className="text-sm font-bold text-gray-900 leading-snug mb-3 line-clamp-2">{project.name}</h3>

    <div className="space-y-1 mb-3 text-xs text-gray-500">
      <p className="font-medium text-gray-600">{project.department?.name || 'No department'}</p>
      <p>Team Lead: <span className="text-gray-700 font-medium">{project.manager?.name || 'Unassigned'}</span></p>
      {project.client && <p>Client: <span className="text-gray-700 font-medium">{project.client}</span></p>}
    </div>

    <div className="flex items-center gap-2 mb-3">
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[project.status] || 'bg-gray-300'}`} />
      <span className="text-[11px] font-semibold text-gray-500">{titleCase(project.status)}</span>
      <PriorityBadge priority={project.priority} />
      {project.isActive === false && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 border border-gray-200">Archived</span>
      )}
    </div>

    <div className="mb-3">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-400 font-medium">Progress</span>
        <span className="text-gray-900 font-bold">{project.progress || 0}%</span>
      </div>
      <ProgressBar value={project.progress || 0} />
    </div>

    <p className="text-[11px] text-gray-400 mb-4">{shortDate(project.startDate)} → {shortDate(project.endDate)}</p>

    <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-50">
      <AvatarStack members={project.teamMembers} />
      <span className="flex items-center gap-1 text-xs font-semibold text-violet-500">
        Open Project
        <Icon d={IC.open} size={12} />
      </span>
    </div>
  </motion.div>
);

/* ════════════════════════════════════════════════════════════════
   SKELETON / EMPTY / ERROR
════════════════════════════════════════════════════════════════ */
const CardSkeleton = () => (
  <div className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse space-y-3">
    <div className="h-3 w-16 bg-gray-100 rounded" />
    <div className="h-4 w-3/4 bg-gray-100 rounded" />
    <div className="h-2.5 w-1/2 bg-gray-100 rounded" />
    <div className="h-2.5 w-2/3 bg-gray-100 rounded" />
    <div className="h-1.5 w-full bg-gray-100 rounded-full mt-4" />
    <div className="h-2.5 w-1/3 bg-gray-100 rounded" />
  </div>
);

const EmptyState = ({ canCreate, onCreate }) => (
  <div className="col-span-full glass-card p-10 flex flex-col items-center text-center gap-2">
    <div className="w-11 h-11 rounded-xl bg-gray-100 border border-gray-200 text-gray-400 flex items-center justify-center">
      <Icon d={IC.projects} size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">No projects found</p>
    <p className="text-xs text-gray-400 max-w-xs">Try changing your filters or create a new project.</p>
    {canCreate && (
      <button onClick={onCreate}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3.5 py-2 rounded-xl transition-colors">
        <Icon d={IC.plus} size={13} />
        Create Project
      </button>
    )}
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div className="col-span-full glass-card p-10 flex flex-col items-center text-center gap-3">
    <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center">
      <Icon d={IC.alert} size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">Unable to load projects</p>
    <p className="text-xs text-gray-400">Please try again.</p>
    <button onClick={onRetry}
      className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors">
      <Icon d={IC.refresh} size={13} />
      Retry
    </button>
  </div>
);

/* ════════════════════════════════════════════════════════════════
   FILTERS
════════════════════════════════════════════════════════════════ */
// const ProjectFilters = ({ filters, setFilters, departments, showDepartmentFilter }) => (
//   <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
//     <div className="relative flex-1 min-w-[180px]">
//       <Icon d={IC.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
//       <input
//         value={filters.search}
//         onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
//         placeholder="Search by name, code, or client…"
//         className="w-full text-xs font-medium bg-white border border-gray-100 rounded-xl pl-8 pr-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-200 transition-colors"
//       />
//     </div>

//     <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
//       {showDepartmentFilter && (
//         <select
//           value={filters.department}
//           onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
//           className="text-xs font-semibold text-gray-600 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-100 flex-shrink-0">
//           <option value="">All Departments</option>
//           {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
//         </select>
//       )}

//       <select
//         value={filters.status}
//         onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
//         className="text-xs font-semibold text-gray-600 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-100 flex-shrink-0">
//         <option value="">All Statuses</option>
//         {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
//       </select>

//       <select
//         value={filters.priority}
//         onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
//         className="text-xs font-semibold text-gray-600 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-100 flex-shrink-0">
//         <option value="">All Priorities</option>
//         {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
//       </select>

//       <select
//         value={filters.activeState}
//         onChange={(e) => setFilters((f) => ({ ...f, activeState: e.target.value }))}
//         className="text-xs font-semibold text-gray-600 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-100 flex-shrink-0">
//         <option value="active">Active</option>
//         <option value="archived">Archived</option>
//         <option value="all">All</option>
//       </select>
//     </div>
//   </div>
// );

/* ════════════════════════════════════════════════════════════════
   PROJECT ANALYSIS (client-side, based on currently loaded page)
════════════════════════════════════════════════════════════════ */
const ProjectAnalysis = ({ projects }) => {
  const stats = useMemo(() => {
    const statusCounts = STATUS_OPTIONS.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    const priorityCounts = PRIORITY_OPTIONS.reduce((acc, p) => ({ ...acc, [p]: 0 }), {});
    let progressSum = 0;
    projects.forEach((p) => {
      if (statusCounts[p.status] !== undefined) statusCounts[p.status] += 1;
      if (priorityCounts[p.priority] !== undefined) priorityCounts[p.priority] += 1;
      progressSum += p.progress || 0;
    });
    return {
      statusCounts,
      priorityCounts,
      avgProgress: projects.length ? Math.round(progressSum / projects.length) : 0,
    };
  }, [projects]);

  if (!projects.length) return null;
  const maxStatus = Math.max(1, ...Object.values(stats.statusCounts));
  const maxPriority = Math.max(1, ...Object.values(stats.priorityCounts));

  return (
    <Card animate={false}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">Project Analysis</h3>
        <span className="text-[11px] text-gray-400">Based on {projects.length} loaded project{projects.length === 1 ? '' : 's'} on this page</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-6">
        {/* Status distribution */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Status</p>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[s]}`} />
                <span className="text-[11px] text-gray-500 w-16 flex-shrink-0 truncate">{titleCase(s)}</span>
                <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${STATUS_DOT[s]}`} style={{ width: `${(stats.statusCounts[s] / maxStatus) * 100}%` }} />
                </div>
                <span className="text-[11px] font-bold text-gray-700 w-4 text-right">{stats.statusCounts[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Average progress */}
        <div className="flex flex-col items-center justify-center border-y sm:border-y-0 sm:border-x border-gray-50 py-4 sm:py-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Avg. Progress</p>
          <p className="text-3xl font-extrabold text-violet-600">{stats.avgProgress}%</p>
          <div className="w-24 mt-2"><ProgressBar value={stats.avgProgress} /></div>
        </div>

        {/* Priority distribution */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Priority</p>
          <div className="space-y-2">
            {PRIORITY_OPTIONS.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 w-16 flex-shrink-0 truncate">{titleCase(p)}</span>
                <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${PRIORITY_STYLE[p].split(' ')[0].replace('text-', 'bg-')}`} style={{ width: `${(stats.priorityCounts[p] / maxPriority) * 100}%` }} />
                </div>
                <span className="text-[11px] font-bold text-gray-700 w-4 text-right">{stats.priorityCounts[p]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

/* ════════════════════════════════════════════════════════════════
   PROJECT FORM (Create + Edit share this)
════════════════════════════════════════════════════════════════ */
const emptyForm = {
  name: '', description: '', client: '', department: '', manager: '', teamMembers: [],
  startDate: '', endDate: '', priority: 'medium', status: 'planning', budget: '', progress: 0, moduleAccess: [],
  attachments: [],
};

const ProjectForm = ({ initial, departments, lockDepartment, canManageAssignment, onCancel, onSubmit, submitting }) => {
  const [form, setForm] = useState(initial || emptyForm);
  const [errors, setErrors] = useState({});


  // useEffect(() => {
  //   if (form.department) loadEmployees(form.department);
  // }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDepartmentChange = (departmentId) => {
    setForm((f) => ({ ...f, department: departmentId, manager: "" })); // clear Team Lead
  };

  const getEffectiveModuleAccess = (employee) => {
    if (!employee) return [];

    // 1. Explicit permissions saved in DB
    if (
      Array.isArray(employee.moduleAccess) &&
      employee.moduleAccess.length > 0
    ) {
      return employee.moduleAccess.map((item) => ({
        module: item.module,
        permission: item.permission || PERMISSIONS.VIEW,
      }));
    }

    // 2. If no explicit permissions, use role defaults
    return (ROLE_DEFAULT_ACCESS[employee.role] || []).map((item) => ({
      module: item.module,
      permission: item.permission || PERMISSIONS.VIEW,
    }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Project name is required';
    if (!form.department) errs.department = 'Department is required';
    if (!form.startDate) errs.startDate = 'Start date is required';
    if (!form.endDate) errs.endDate = 'End date is required';
    if (form.startDate && form.endDate && form.endDate < form.startDate) errs.endDate = 'End date must be after start date';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      ...form,
      budget: form.budget === '' ? undefined : Number(form.budget),
      progress: Number(form.progress) || 0,
    });
  };

  const inputCls = 'w-full text-sm bg-white border border-gray-100 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-200 transition-colors';
  const labelCls = 'block text-xs font-bold text-gray-500 mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Basic Information</p>
        <div>
          <label className={labelCls}>Project Name *</label>
          <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Client</label>
          <input className={inputCls} value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} />
        </div>
      </section>

      {/* Organization */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Organization</p>
        <div>
          <label className={labelCls}>Department *</label>
          <DepartmentSelect
            value={form.department}
            onChange={handleDepartmentChange}
            disabled={lockDepartment || !canManageAssignment}
            placeholder="Select department"
          />

          {errors.department && (
            <p className="text-[11px] text-red-500 mt-1">
              {errors.department}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls}>Team Lead</label>

          <EmployeeSelect
            value={form.manager}
            mode="team-lead"
            onChange={(employeeId, employee) => {
              setForm((f) => ({
                ...f,
                manager: employeeId,
                moduleAccess: getEffectiveModuleAccess(employee),
              }));
            }}
            departmentId={form.department}
            disabled={!form.department || !canManageAssignment}
            placeholder={
              form.department
                ? "Select team lead"
                : "Select a department first"
            }
          />
        </div>
        {form.manager && (
          <div className="border border-violet-100 rounded-xl p-3 bg-violet-50/30">
            <ModuleAccessPicker
              value={form.moduleAccess}
              onChange={(next) =>
                setForm((f) => ({
                  ...f,
                  moduleAccess: next,
                }))
              }
            />
          </div>
        )}
        <div>
          <EmployeeMultiSelect
            value={form.teamMembers}
            onChange={(teamMembers) =>
              setForm((f) => ({
                ...f,
                teamMembers,
              }))
            }
            departmentId={form.department}
            excludeId={form.manager}
            disabled={!form.department || !canManageAssignment}
          />
        </div>

      </section>

      {/* Schedule */}
      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start Date *</label>
          <input type="date" className={inputCls} value={form.startDate?.slice(0, 10) || ''} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          {errors.startDate && <p className="text-[11px] text-red-500 mt-1">{errors.startDate}</p>}
        </div>
        <div>
          <label className={labelCls}>End Date *</label>
          <input type="date" className={inputCls} value={form.endDate?.slice(0, 10) || ''} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          {errors.endDate && <p className="text-[11px] text-red-500 mt-1">{errors.endDate}</p>}
        </div>
      </section>

      {/* Configuration */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Project Configuration</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Priority</label>
            <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Budget (₹)</label>
            <input type="number" min="0" className={inputCls} value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Progress (%)</label>
            <input type="number" min="0" max="100" className={inputCls} value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))} />
          </div>
        </div>
      </section>

      {/* Attachments — no upload API confirmed; URL-only, safe no-op if unused */}
      <section className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Attachments</p>
        <p className="text-[11px] text-gray-400">
          File upload isn't wired to a backend endpoint yet — paste existing attachment URLs (one per line) if you have any.
        </p>
        <textarea
          rows={2}
          className={inputCls}
          placeholder="https://…"
          value={(form.attachments || []).join('\n')}
          onChange={(e) => setForm((f) => ({ ...f, attachments: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }))}
        />
      </section>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-50">
        <button type="button" onClick={onCancel}
          className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors">
          {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Project'}
        </button>
      </div>
    </form>
  );
};

/* ════════════════════════════════════════════════════════════════
   CONFIRM MODAL (archive / restore / delete)
════════════════════════════════════════════════════════════════ */
const ConfirmDialog = ({ open, title, message, confirmLabel, danger, onConfirm, onCancel, submitting }) => (
  <Modal isOpen={open} onClose={onCancel} title={title} size="sm">
    <p className="text-sm text-gray-500 mb-5">{message}</p>
    <div className="flex items-center justify-end gap-2">
      <button onClick={onCancel} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={submitting}
        className={`text-xs font-semibold text-white disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'}`}>
        {submitting ? 'Please wait…' : confirmLabel}
      </button>
    </div>
  </Modal>
);

/* ════════════════════════════════════════════════════════════════
   MAIN: Projects
════════════════════════════════════════════════════════════════ */
const Projects = ({ departmentId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';

  console.log(user?.role)

  // ADDED: module-level permissions — the single source of truth for
  // "can this user see/use the Project module at all". Computed once per
  // render; canAccessView/canAccessEdit already handle null user safely,
  // admin bypass, explicit moduleAccess, and role-default fallback, so no
  // logic is duplicated here.
  const canViewProjects = canAccessView(user, 'project');
  const canEditProjects = canAccessEdit(user, 'project');

  const [state, setState] = useState({ status: 'loading', projects: [], meta: { total: 0, page: 1, pages: 1 } });
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    department: departmentId || "",
    teamLead: "",
    status: "",
    priority: "",
    activeState: "active",
  });
  const [page, setPage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'archive'|'restore'|'delete', project }
  const [submitting, setSubmitting] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);

  const excelInputRef = useRef(null);
  const requestIdRef = useRef(0);
  const searchDebounceRef = useRef(null);

  /* ── permissions (UI hints only — backend is the source of truth) ── */
  const permissions = {
    // CHANGED: was `isAdmin || isManager` (missed team-lead entirely, and
    // ignored explicit moduleAccess). Create has no specific project to own
    // yet, so it's gated purely by the module edit permission — matches the
    // "Is this user allowed to edit the Project module?" question.
    canCreate: canEditProjects,

    // Combines the module permission ("can edit Project module") with the
    // existing project-specific ownership rule ("is this particular project
    // theirs to manage"). Both must pass — a team-lead with project edit
    // permission still can't edit someone else's project.
    canEdit: (p) =>
      isAdmin ||
      (
        canEditProjects &&
        String(p.manager?._id) === String(user?._id)
      ),

    // Unchanged — archiving stays a hard admin-only action, independent of
    // module permission.
    canArchive: () => isAdmin,

    // Unchanged — deleting stays a hard admin-only action, independent of
    // module permission.
    canDelete: () => isAdmin,

    // CHANGED: was `isAdmin || isManager`. Managing department/manager/team
    // assignment in the form is a project-data-modifying action, so it's
    // gated the same way as Create.
    canManageAssignment: canEditProjects,
  };

  /* ── load departments once ── */
  useEffect(() => {
    api.get('/departments').then((res) => setDepartments(unwrap(res, 'departments'))).catch(() => setDepartments([]));
  }, []);

  /* ── debounce search input into an actual filter change ── */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(filters.search), 350);
    return () => clearTimeout(searchDebounceRef.current);
  }, [filters.search]);

  /* ── reset to page 1 whenever a filter changes ── */
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.department,
    filters.teamLead,
    filters.status,
    filters.priority,
    filters.activeState
  ]);
  const fetchProjects = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const params = {
        search: debouncedSearch || undefined,
        department: departmentId || filters.department || undefined,
        // GlobalFilters calls this "teamLead",
        // but Project backend stores the assigned team lead
        // in the "manager" field.
        manager: filters.teamLead || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        // isActive: filters.activeState === "all" ? undefined : filters.activeState === "active",
        page,
        limit: PAGE_SIZE,
      };
      const res = await api.get('/projects', { params });
      if (requestId !== requestIdRef.current) return;
      const body = res?.data || {};
      const projectData = body.projects;
      setState({ status: 'success', projects: Array.isArray(projectData) ? projectData : [], meta: { total: body.total ?? 0, page: body.page ?? page, pages: body.pages ?? 1 }, });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ status: 'error', projects: [], meta: { total: 0, page: 1, pages: 1 } });
    }
  }, [debouncedSearch, filters.department, filters.status, filters.priority, filters.activeState, page, departmentId]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  /* ── KPIs — computed from the currently loaded page, clearly labeled as such ── */
  const kpis = useMemo(() => {
    const { projects } = state;
    return {
      total: state.meta.total || projects.length,
      active: projects.filter((p) => p.isActive !== false).length,
      inProgress: projects.filter((p) => p.status === 'in-progress').length,
      completed: projects.filter((p) => p.status === 'completed').length,
      onHold: projects.filter((p) => p.status === 'on-hold').length,
    };
  }, [state]);

  /* ── mutations ── */
  const handleCreate = async (payload) => {
    setSubmitting(true);
    try {
      await api.post('/projects', payload);
      toast.success('Project created');
      setShowCreateModal(false);
      fetchProjects();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not create project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExcelImport = async (event) => {
    const file = event.target.files?.[0];
    // Reset input so the same file can be selected again.
    event.target.value = '';
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!['xlsx', 'xls'].includes(extension)) {
      toast.error('Please select an Excel .xlsx or .xls file.');
      return;
    }
    setImportingExcel(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // If Projects.jsx is being used inside Department Details,
      // optionally send the department context.
      if (departmentId) {
        formData.append('departmentId', departmentId);
      }

      const response = await api.post('/projects/import', formData);

      const result = response?.data || {};

      if (result.success) {
        const createdCount = result.createdCount ?? 0;
        const failedCount = result.failedCount ?? 0;

        if (failedCount > 0) {
          toast.success(
            `${createdCount} project(s) imported. ${failedCount} row(s) failed.`
          );
        } else {
          toast.success(
            `${createdCount} project(s) imported successfully.`
          );
        }
        await fetchProjects();
        // If backend gives row-level errors, log them for debugging.
        if (Array.isArray(result.errors) && result.errors.length > 0) {
          console.warn('Excel import row errors:', result.errors);
        }
        return;
      }
      toast.error(
        result.message || 'Excel import failed.'
      );
    } catch (error) {
      console.error('Excel import:', error);
      toast.error(
        error?.response?.data?.message ||
        'Could not import Excel file.'
      );
    } finally {
      setImportingExcel(false);
    }
  };

  const handleUpdate = async (payload) => {
    setSubmitting(true);
    try {
      await api.put(`/projects/${editingProject._id}`, payload);
      toast.success('Project updated');
      setEditingProject(null);
      fetchProjects();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { type, project } = confirmAction;
    setSubmitting(true);
    try {
      if (type === 'delete') {
        await api.delete(`/projects/${project._id}`);
        toast.success('Project deleted');
      } else {
        await api.put(`/projects/${project._id}/archive`);
        toast.success(type === 'archive' ? 'Project archived' : 'Project restored');
      }
      setConfirmAction(null);
      fetchProjects();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };


  const isEmpty = state.status === 'success' && state.projects.length === 0;

  // ADDED: page-level VIEW gate. Placed after every hook declaration above
  // (so hook order/count never changes across renders) and before the main
  // render. If the user cannot view the Project module at all, the entire
  // Projects UI — filters, KPIs, cards, modals — is replaced with a simple
  // Access Denied state. No redirect: there was no existing access-denied/
  // redirect pattern in this file to reuse, per the task's own instruction
  // to only redirect if one already exists.
  if (!canViewProjects) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
          <p className="text-sm text-gray-500 mt-1">You don't have permission to view Projects.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Projects</h2>
          <p className="text-sm text-gray-400 mt-0.5">Track and manage project execution across teams</p>
        </div>

        {permissions.canCreate && (
          <div className="flex items-center gap-1.5">
            <input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
            <button type="button" disabled={importingExcel} onClick={() => excelInputRef.current?.click()} className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-1.5 py-1.5 rounded-xl transition-colors disabled:opacity-50">
              <Icon d={IC.upload} size={14} />
              {importingExcel ? 'Importing…' : 'Import Excel'}
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-4 py-2.5 rounded-xl shadow-sm transition-colors w-full sm:w-auto">
              <Icon d={IC.plus} size={14} />
              Create Project
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Projects" value={kpis.total} icon={<Icon d={IC.projects} size={17} />} color="violet" />
        <KpiCard label="Active" value={kpis.active} icon={<Icon d={IC.active} size={17} />} color="green" />
        <KpiCard label="In Progress" value={kpis.inProgress} icon={<Icon d={IC.progress} size={17} />} color="golden" />
        <KpiCard label="Completed" value={kpis.completed} icon={<Icon d={IC.completed} size={17} />} color="green" />
        <KpiCard label="On Hold" value={kpis.onHold} icon={<Icon d={IC.hold} size={17} />} color="red" />
      </div>
      <p className="text-[11px] text-gray-400 -mt-3">Reflects the current filtered results{state.meta.total ? ` (${state.meta.total} total)` : ''}, not company-wide totals.</p>

      {/* Filters */}
      <GlobalFilters
        filters={filters}
        setFilters={setFilters}
        enabledFilters={["search", "department", "teamLead", , "priority" , "status",]}
      />

      {/* Analysis */}
      {state.status === 'success' && state.projects.length > 0 && <ProjectAnalysis projects={state.projects} />}

      {/* Cards grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.status === 'loading' && Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}

        {state.status === 'error' && <ErrorState onRetry={fetchProjects} />}

        {isEmpty && <EmptyState canCreate={permissions.canCreate} onCreate={() => setShowCreateModal(true)} />}

        {state.status === 'success' && state.projects.map((p) => (
          <ProjectCard
            key={p._id}
            project={p}
            permissions={permissions}
            onOpen={(proj) => navigate(`/projects/${proj._id}`)}
            onEdit={(proj) => setEditingProject(proj)}
            onArchiveToggle={(proj) => setConfirmAction({ type: proj.isActive === false ? 'restore' : 'archive', project: proj })}
            onDelete={(proj) => setConfirmAction({ type: 'delete', project: proj })}
          />
        ))}
      </div>

      {/* Pagination */}
      {state.status === 'success' && state.meta.pages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <Icon d={IC.chevronLeft} size={14} />
          </button>
          {Array.from({ length: state.meta.pages }).slice(0, 7).map((_, i) => {
            const n = i + 1;
            return (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${n === page ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-50 border border-gray-100'}`}>
                {n}
              </button>
            );
          })}
          <button
            disabled={page >= state.meta.pages}
            onClick={() => setPage((p) => Math.min(state.meta.pages, p + 1))}
            className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <Icon d={IC.chevronRight} size={14} />
          </button>
        </div>
      )}

      {/* Create Project modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Project" size="lg">
        <ProjectForm
          departments={departments}
          lockDepartment={!!departmentId}
          canManageAssignment={permissions.canManageAssignment}
          initial={departmentId ? { ...emptyForm, department: departmentId } : null}
          onCancel={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          submitting={submitting}
        />
      </Modal>

      {/* Edit Project modal */}
      <Modal isOpen={!!editingProject} onClose={() => setEditingProject(null)} title="Edit Project" size="lg">
        {editingProject && (
          <ProjectForm
            departments={departments}
            lockDepartment={!!departmentId}
            canManageAssignment={permissions.canManageAssignment}
            initial={{
              ...editingProject,

              department: editingProject.department?._id || '',

              manager: editingProject.manager?._id || '',

              teamMembers: (editingProject.teamMembers || []).map(
                (m) => m._id
              ),

              moduleAccess: Array.isArray(editingProject.manager?.moduleAccess)
                ? editingProject.manager.moduleAccess.map((a) => ({
                  module: a.module,
                  permission: a.permission,
                }))
                : [],
            }}
            onCancel={() => setEditingProject(null)}
            onSubmit={handleUpdate}
            submitting={submitting}
          />
        )}
      </Modal>

      {/* Confirm archive / restore / delete */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'delete' ? 'Delete Project' : confirmAction?.type === 'restore' ? 'Restore Project' : 'Archive Project'}
        message={
          confirmAction?.type === 'delete'
            ? `This will permanently delete "${confirmAction?.project?.name}". This cannot be undone.`
            : confirmAction?.type === 'restore'
              ? `Restore "${confirmAction?.project?.name}" and make it active again?`
              : `Archive "${confirmAction?.project?.name}"? It will be marked inactive.`
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : confirmAction?.type === 'restore' ? 'Restore' : 'Archive'}
        danger={confirmAction?.type === 'delete'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        submitting={submitting}
      />
    </div>
  );
};

export default Projects;