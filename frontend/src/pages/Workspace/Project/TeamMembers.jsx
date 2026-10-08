/**
 * src/pages/Workspace/Projects/TeamMembers.jsx
 * "Team Members" tab of /admin/projects/:projectId — renders inside ProjectDetails.jsx.
 * Handles: team roster, task breakdown per member, per-member progress,
 * and add / remove / shift member actions against the existing project API.
 *
 * ASSUMPTIONS TO VERIFY (isolated to single spots, easy to adjust):
 *  - Modal component: not in the required import list, but "show a modal/dropdown/panel"
 *    needs one. Imported from '../../../components/UI/Modal' (same folder as Card/Badge)
 *    with the isOpen/onClose/title/size prop signature used elsewhere in this app.
 *  - Task query param is `project` (GET /tasks?project=:projectId) — see fetchTasks().
 *  - PUT /projects/:projectId accepts a PARTIAL payload ({ teamMembers: [...] }), per the
 *    example given in the spec — see updateTeamMembers().
 *  - Employee/Task response shapes are unwrapped defensively (see unwrap()).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import Card from '../../../components/UI/Card';
import Badge from '../../../components/UI/Badge';
import Modal from '../../../components/UI/Modal';

/* ── icon helper ── */
const Icon = ({ d, size = 15, className = '', sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const IC = {
  team: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  tasks: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4',
  completed: 'M5 13l4 4L19 7',
  pending: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  overdue: 'M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 004 21h16a2 2 0 001.89-3L13.71 3.86a2 2 0 00-3.42 0z',
  progress: 'M13 10V3L4 14h7v7l9-11h-7z',
  plus: 'M12 5v14m-7-7h14',
  swap: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4m14 4v2a4 4 0 01-4 4H3',
  trash: 'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  alert: 'M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 004 21h16a2 2 0 001.89-3L13.71 3.86a2 2 0 00-3.42 0z',
  refresh: 'M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.9 3.4M19.5 9A8 8 0 004.6 5.6',
};

/* ── helpers ── */
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const clamp = (n) => Math.min(100, Math.max(0, Number(n) || 0));

const unwrap = (res, key) => {
  const body = res?.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.[key])) return body[key];
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

const normalizeProject = (res) => {
  const body = res?.data;
  return body?.project || body?.data || body || null;
};

const getAssigneeId = (task) => {
  const a = task.assignedTo || task.assignee || task.member;
  if (!a) return null;
  return typeof a === 'object' ? a._id : a;
};

const isOverdue = (task) => {
  const deadline = task.deadline || task.dueDate || task.endDate;
  return !!deadline && task.status !== 'completed' && task.status !== 'cancelled' && new Date(deadline) < new Date();
};

/** assigned/completed/pending/overdue/progress for a single member's task list */
const memberStats = (memberTasks) => {
  const assignedTasks = memberTasks.length;
  const completedTasks = memberTasks.filter((t) => t.status === 'completed').length;
  const pendingTasks = memberTasks.filter((t) => t.status === 'not-started').length;
  const overdueTasks = memberTasks.filter(isOverdue).length;
  const progress = assignedTasks ? clamp((completedTasks / assignedTasks) * 100) : 0;
  return { assignedTasks, completedTasks, pendingTasks, overdueTasks, progress: Math.round(progress) };
};

/* ════════════════════════════════════════════════════════════════
   SMALL PRESENTATIONAL PIECES
════════════════════════════════════════════════════════════════ */
const ProgressBar = ({ value = 0, size = 'md' }) => (
  <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
    <motion.div className="h-full bg-violet-500 rounded-full" initial={{ width: 0 }}
      animate={{ width: `${clamp(value)}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
  </div>
);

const Avatar = ({ name, size = 'md' }) => (
  <div className={`rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center flex-shrink-0 ${size === 'lg' ? 'w-12 h-12 text-sm' : 'w-9 h-9 text-xs'}`}>
    {initials(name)}
  </div>
);

const SummaryCard = ({ label, value, icon, colorClass }) => (
  <Card animate={false} className="flex items-center gap-3 p-4">
    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${colorClass}`}>
      <Icon d={icon} size={16} />
    </div>
    <div className="min-w-0">
      <p className="text-lg font-extrabold text-gray-900 leading-none">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1 truncate">{label}</p>
    </div>
  </Card>
);

const SkeletonBlock = ({ className = '' }) => <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;

const PageSkeleton = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-16 rounded-2xl" />)}
    </div>
    <SkeletonBlock className="h-28 rounded-2xl" />
    <SkeletonBlock className="h-64 rounded-2xl" />
  </div>
);

const ErrorCard = ({ message, onRetry }) => (
  <Card animate={false} className="p-10 flex flex-col items-center text-center gap-3">
    <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center">
      <Icon d={IC.alert} size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">Unable to load team members</p>
    <p className="text-xs text-gray-400 max-w-xs">{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors">
        <Icon d={IC.refresh} size={13} />
        Retry
      </button>
    )}
  </Card>
);

/* ════════════════════════════════════════════════════════════════
   TEAM LEAD CARD
════════════════════════════════════════════════════════════════ */
const TeamLeadCard = ({ manager, stats }) => (
  <Card animate={false}>
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Team Lead</p>
    {!manager ? (
      <p className="text-xs text-gray-400">No team lead assigned.</p>
    ) : (
      <div className="flex items-start gap-3">
        <Avatar name={manager.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-bold text-gray-900">{manager.name}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-violet-50 text-violet-600 border border-violet-100">Team Lead</span>
          </div>
          <p className="text-xs text-gray-400">{manager.employeeId || '—'} {manager.email ? `· ${manager.email}` : ''}</p>
          {manager.role && <p className="text-xs text-gray-400">{manager.role}</p>}
          <div className="mt-2.5 flex items-center gap-4 text-[11px] text-gray-500">
            <span>{stats.assignedTasks} assigned</span>
            <span>{stats.completedTasks} completed</span>
            <span>{stats.pendingTasks} pending</span>
            {stats.overdueTasks > 0 && <span className="text-rose-500 font-semibold">{stats.overdueTasks} overdue</span>}
          </div>
          <div className="mt-2 max-w-xs"><ProgressBar value={stats.progress} size="sm" /></div>
        </div>
      </div>
    )}
  </Card>
);

/* ════════════════════════════════════════════════════════════════
   MEMBER CARD
════════════════════════════════════════════════════════════════ */
const MemberCard = ({ member, stats, canManage, onRemove, onChange }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
    className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all">
    <div className="flex items-start gap-3">
      <Avatar name={member.name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className="text-sm font-bold text-gray-900 truncate">{member.name}</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">Team Member</span>
        </div>
        <p className="text-[11px] text-gray-400 truncate">{member.employeeId || '—'} {member.email ? `· ${member.email}` : ''}</p>
        {member.role && <p className="text-[11px] text-gray-400 truncate">{member.role}</p>}
      </div>
    </div>

    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
      <div className="bg-gray-50 rounded-lg py-1.5">
        <p className="text-xs font-extrabold text-gray-900">{stats.assignedTasks}</p>
        <p className="text-[10px] text-gray-400">Assigned</p>
      </div>
      <div className="bg-emerald-50 rounded-lg py-1.5">
        <p className="text-xs font-extrabold text-emerald-600">{stats.completedTasks}</p>
        <p className="text-[10px] text-gray-400">Completed</p>
      </div>
      <div className="bg-amber-50 rounded-lg py-1.5">
        <p className="text-xs font-extrabold text-amber-600">{stats.pendingTasks}</p>
        <p className="text-[10px] text-gray-400">Pending</p>
      </div>
    </div>

    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-400 font-medium">Progress</span>
        <span className="font-bold text-gray-700">{stats.progress}%</span>
      </div>
      <ProgressBar value={stats.progress} size="sm" />
    </div>

    {canManage && (
      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2">
        <button onClick={() => onChange(member)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-2.5 py-1.5 rounded-lg transition-colors">
          <Icon d={IC.swap} size={12} />
          Change
        </button>
        <button onClick={() => onRemove(member)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 px-2.5 py-1.5 rounded-lg transition-colors">
          <Icon d={IC.trash} size={12} />
          Remove
        </button>
      </div>
    )}
  </motion.div>
);

/* ════════════════════════════════════════════════════════════════
   TASK TABLE (by member)
════════════════════════════════════════════════════════════════ */
const TaskTable = ({ rows }) => (
  <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
    <table className="w-full text-left border-collapse min-w-[560px]">
      <thead>
        <tr className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          <th className="pb-2 pr-3">Member</th>
          <th className="pb-2 px-3 text-center">Assigned</th>
          <th className="pb-2 px-3 text-center">Pending</th>
          <th className="pb-2 px-3 text-center">Completed</th>
          <th className="pb-2 px-3 text-center">Overdue</th>
          <th className="pb-2 pl-3">Progress</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-gray-50">
            <td className="py-2.5 pr-3">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar name={row.name} />
                <span className="text-xs font-semibold text-gray-700 truncate">{row.name}</span>
              </div>
            </td>
            <td className="py-2.5 px-3 text-center text-xs font-medium text-gray-600">{row.stats.assignedTasks}</td>
            <td className="py-2.5 px-3 text-center text-xs font-medium text-amber-600">{row.stats.pendingTasks}</td>
            <td className="py-2.5 px-3 text-center text-xs font-medium text-emerald-600">{row.stats.completedTasks}</td>
            <td className="py-2.5 px-3 text-center text-xs font-medium text-rose-500">{row.stats.overdueTasks}</td>
            <td className="py-2.5 pl-3 w-32">
              <div className="flex items-center gap-2">
                <ProgressBar value={row.stats.progress} size="sm" />
                <span className="text-[11px] font-bold text-gray-700 w-8 text-right">{row.stats.progress}%</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ════════════════════════════════════════════════════════════════
   PROGRESS SECTION (member-wise)
════════════════════════════════════════════════════════════════ */
const ProgressSection = ({ rows }) => (
  <div className="space-y-3">
    {rows.map((row) => (
      <div key={row.id} className="flex items-center gap-3">
        <Avatar name={row.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-gray-700 truncate">{row.name}</span>
            <span className="text-gray-400">Completed: {row.stats.completedTasks} · Remaining: {row.stats.assignedTasks - row.stats.completedTasks}</span>
          </div>
          <ProgressBar value={row.stats.progress} size="sm" />
        </div>
        <span className="text-xs font-bold text-gray-700 w-10 text-right flex-shrink-0">{row.stats.progress}%</span>
      </div>
    ))}
  </div>
);

/* ════════════════════════════════════════════════════════════════
   ADD MEMBER MODAL
════════════════════════════════════════════════════════════════ */
const AddMemberModal = ({ open, onClose, departmentId, excludeIds, onConfirm, submitting }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!open) { setSelected([]); setSearch(''); return; }
    if (!departmentId) { setEmployees([]); return; }
    setLoading(true);
    api.get('/employees', { params: { department: departmentId } })
      .then((res) => {
        console.log('EMPLOYEE RESPONSE:', res.data);
        const list = unwrap(res, 'employees');
        console.log('EMPLOYEES:', list);
        setEmployees(list);
      })
      .catch(() => { setEmployees([]); toast.error('Could not load employees for this department.'); })
      .finally(() => setLoading(false));
  }, [open, departmentId]);

  const available = useMemo(
    () => employees.filter((e) => !excludeIds.includes(e._id) && e.name?.toLowerCase().includes(search.toLowerCase())),
    [employees, excludeIds, search]
  );

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal isOpen={open} onClose={onClose} title="Add Member" size="md">
      <div className="space-y-3">
        <div className="relative">
          <Icon d={IC.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full text-sm bg-white border border-gray-100 rounded-xl pl-8 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-200 transition-colors"
          />
        </div>

        <div className="border border-gray-100 rounded-xl max-h-64 overflow-y-auto divide-y divide-gray-50">
          {loading && <p className="text-xs text-gray-300 px-3 py-4">Loading employees…</p>}
          {!loading && available.length === 0 && <p className="text-xs text-gray-300 px-3 py-4">No available employees found.</p>}
          {!loading && available.map((e) => (
            <label key={e._id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(e._id)} onChange={() => toggle(e._id)}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-200" />
              <Avatar name={e.name} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{e.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{e.employeeId || e.email}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <span className="text-xs text-gray-400">{selected.length} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              disabled={!selected.length || submitting}
              onClick={() => onConfirm(selected)}
              className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors">
              {submitting ? 'Adding…' : 'Add Members'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

/* ════════════════════════════════════════════════════════════════
   CHANGE / SHIFT MEMBER MODAL
════════════════════════════════════════════════════════════════ */
const ChangeMemberModal = ({ open, onClose, currentMember, departmentId, excludeIds, onConfirm, submitting }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replacementId, setReplacementId] = useState('');

  useEffect(() => {
    if (!open) { setReplacementId(''); return; }
    if (!departmentId) { setEmployees([]); return; }
    setLoading(true);
    api.get('/employees', { params: { department: departmentId } })
      .then((res) => setEmployees(unwrap(res, 'employees')))
      .catch(() => { setEmployees([]); toast.error('Could not load employees for this department.'); })
      .finally(() => setLoading(false));
  }, [open, departmentId]);

  const options = useMemo(
    () => employees.filter((e) => !excludeIds.includes(e._id) && e._id !== currentMember?._id),
    [employees, excludeIds, currentMember]
  );

  return (
    <Modal isOpen={open} onClose={onClose} title="Change Member" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <Avatar name={currentMember?.name} />
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400">Current Member</p>
            <p className="text-sm font-bold text-gray-900 truncate">{currentMember?.name}</p>
          </div>
        </div>

        <div className="flex justify-center text-gray-300">
          <Icon d={IC.swap} size={16} />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Replace With</label>
          <select
            value={replacementId}
            onChange={(e) => setReplacementId(e.target.value)}
            disabled={loading}
            className="w-full text-sm bg-white border border-gray-100 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-200 transition-colors">
            <option value="">{loading ? 'Loading employees…' : 'Select employee'}</option>
            {options.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-50">
          <button onClick={onClose} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            disabled={!replacementId || submitting}
            onClick={() => onConfirm(replacementId)}
            className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors">
            {submitting ? 'Saving…' : 'Confirm Change'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

/* ════════════════════════════════════════════════════════════════
   REMOVE CONFIRM MODAL
════════════════════════════════════════════════════════════════ */
const RemoveConfirmModal = ({ open, member, onClose, onConfirm, submitting }) => (
  <Modal isOpen={open} onClose={onClose} title="Remove Member" size="sm">
    <p className="text-sm text-gray-700 font-semibold mb-1">Remove "{member?.name}" from this project?</p>
    <p className="text-xs text-gray-400 mb-5">This will remove the member from the project team.</p>
    <div className="flex items-center justify-end gap-2">
      <button onClick={onClose} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
        Cancel
      </button>
      <button
        disabled={submitting}
        onClick={onConfirm}
        className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors">
        {submitting ? 'Removing…' : 'Remove Member'}
      </button>
    </div>
  </Modal>
);

/* ════════════════════════════════════════════════════════════════
   MAIN: TeamMembers
════════════════════════════════════════════════════════════════ */
const TeamMembers = ({ projectId: projectIdProp }) => {
  const params = useParams();
  const projectId = projectIdProp || params.projectId;
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [changeTarget, setChangeTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const fetchTasks = useCallback(async (id) => {
    try {
      // ASSUMPTION: query param is `project`. Swap to `projectId` here if your
      // backend expects that instead — isolated to this one call.
      const res = await api.get('/tasks', { params: { project: id } });
      console.log('TASK RESPONSE:', res.data);
      const list = unwrap(res, 'tasks');
      console.log('TASKS:', list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!projectId) { setStatus('error'); setErrorMessage('No project selected.'); return; }
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

      const fetchedTasks = await fetchTasks(projectId);
      setTasks(fetchedTasks);
      setStatus('success');
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Something went wrong while loading this project.';
      setErrorMessage(message);
      setStatus('error');
      toast.error(message);
    }
  }, [projectId, fetchTasks]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── derived data ── */
  const manager = project?.manager || null;
  const members = useMemo(() => project?.teamMembers || [], [project]);
  const departmentId = project?.department?._id || project?.department || null;

  const tasksByAssignee = useMemo(() => {
    const map = new Map();
    const unassigned = [];
    tasks.forEach((t) => {
      const id = getAssigneeId(t);
      if (!id) { unassigned.push(t); return; }
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(t);
    });
    return { map, unassigned };
  }, [tasks]);

  const managerStats = useMemo(() => memberStats(manager ? tasksByAssignee.map.get(manager._id) || [] : []), [manager, tasksByAssignee]);

  const memberRows = useMemo(() => members.map((m) => ({
    id: m._id, name: m.name, member: m, stats: memberStats(tasksByAssignee.map.get(m._id) || []),
  })), [members, tasksByAssignee]);

  const allRows = useMemo(() => {
    const rows = [...memberRows];
    if (manager) rows.unshift({ id: manager._id, name: manager.name, member: manager, stats: managerStats });
    if (tasksByAssignee.unassigned.length) {
      rows.push({ id: 'unassigned', name: 'Unassigned', member: null, stats: memberStats(tasksByAssignee.unassigned) });
    }
    return rows;
  }, [memberRows, manager, managerStats, tasksByAssignee.unassigned]);

  const summary = useMemo(() => {
    const totalAssigned = tasks.length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const pending = tasks.filter((t) => t.status === 'not-started').length;
    const overdue = tasks.filter(isOverdue).length;
    const progressValues = memberRows.map((r) => r.stats.progress);
    const avgProgress = progressValues.length ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length) : 0;
    return { totalMembers: members.length, totalAssigned, completed, pending, overdue, avgProgress };
  }, [tasks, memberRows, members.length]);

  /* ── mutations (all go through PUT /projects/:projectId with a partial payload) ── */
  const updateTeamMembers = async (updatedIds) => {
    console.log('UPDATED TEAM MEMBERS:', updatedIds);
    setSubmitting(true);
    try {
      await api.put(`/projects/${projectId}`, { teamMembers: updatedIds });
      await loadAll();
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update team members');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMembers = async (selectedIds) => {
    const existingIds = members.map((m) => m._id);
    const merged = Array.from(new Set([...existingIds, ...selectedIds]));
    const ok = await updateTeamMembers(merged);
    if (ok) { toast.success('Member(s) added'); setAddOpen(false); }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    const updated = members.filter((m) => m._id !== removeTarget._id).map((m) => m._id);
    const ok = await updateTeamMembers(updated);
    if (ok) { toast.success('Member removed'); setRemoveTarget(null); }
  };

  const handleChangeMember = async (replacementId) => {
    if (!changeTarget) return;
    const updated = members.map((m) => (m._id === changeTarget._id ? replacementId : m._id));
    const ok = await updateTeamMembers(updated);
    if (ok) { toast.success('Member changed'); setChangeTarget(null); }
  };

  const excludeIdsForAdd = useMemo(() => [...members.map((m) => m._id), ...(manager ? [manager._id] : [])], [members, manager]);

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorCard message={errorMessage} onRetry={loadAll} />;
  if (!project) return <ErrorCard message="Project data is unavailable." onRetry={loadAll} />;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <SummaryCard label="Total Members" value={summary.totalMembers} icon={IC.team} colorClass="text-violet-600 bg-violet-50 border-violet-100" />
        <SummaryCard label="Assigned Tasks" value={summary.totalAssigned} icon={IC.tasks} colorClass="text-blue-600 bg-blue-50 border-blue-100" />
        <SummaryCard label="Completed" value={summary.completed} icon={IC.completed} colorClass="text-emerald-600 bg-emerald-50 border-emerald-100" />
        <SummaryCard label="Pending" value={summary.pending} icon={IC.pending} colorClass="text-amber-600 bg-amber-50 border-amber-100" />
        <SummaryCard label="Overdue" value={summary.overdue} icon={IC.overdue} colorClass="text-rose-600 bg-rose-50 border-rose-100" />
        <SummaryCard label="Avg. Progress" value={`${summary.avgProgress}%`} icon={IC.progress} colorClass="text-violet-600 bg-violet-50 border-violet-100" />
      </div>

      {/* Team Lead */}
      <TeamLeadCard manager={manager} stats={managerStats} />

      {/* Team Members */}
      <Card animate={false}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-900">Project Members</h3>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3.5 py-2 rounded-xl transition-colors">
            <Icon d={IC.plus} size={13} />
            Add Member
          </button>
        </div>

        {memberRows.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">No team members assigned yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberRows.map((row) => (
              <MemberCard
                key={row.id}
                member={row.member}
                stats={row.stats}
                canManage
                onChange={setChangeTarget}
                onRemove={setRemoveTarget}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Tasks by member */}
      <Card animate={false}>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Tasks</h3>
        {allRows.length === 0 ? (
          <p className="text-xs text-gray-400">No tasks found for this project.</p>
        ) : (
          <TaskTable rows={allRows} />
        )}
      </Card>

      {/* Progress */}
      <Card animate={false}>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Progress</h3>
        {allRows.length === 0 ? (
          <p className="text-xs text-gray-400">Nothing to show yet.</p>
        ) : (
          <ProgressSection rows={allRows} />
        )}
      </Card>

      {/* Modals */}
      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        departmentId={departmentId}
        excludeIds={excludeIdsForAdd}
        onConfirm={handleAddMembers}
        submitting={submitting}
      />
      <ChangeMemberModal
        open={!!changeTarget}
        currentMember={changeTarget}
        onClose={() => setChangeTarget(null)}
        departmentId={departmentId}
        excludeIds={excludeIdsForAdd}
        onConfirm={handleChangeMember}
        submitting={submitting}
      />
      <RemoveConfirmModal
        open={!!removeTarget}
        member={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveMember}
        submitting={submitting}
      />
    </motion.div>
  );
};

export default TeamMembers;