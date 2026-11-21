import { useCallback, useEffect, useState } from 'react';
import api from '../../../../utils/api';

/* Shared constants + helpers for module work items (tasks / bugs / milestones). */

export const STATUS_META = {
  'not-started': { label: 'Not started', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  'in-progress': { label: 'In progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  review: { label: 'Review', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
};
export const STATUSES = Object.keys(STATUS_META);

export const PRIORITY_META = {
  low: { label: 'Low', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  high: { label: 'High', cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  critical: { label: 'Critical', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
};
export const PRIORITIES = Object.keys(PRIORITY_META);

export const KIND_META = {
  task: { label: 'Task', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  milestone: { label: 'Milestone', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  bug: { label: 'Bug', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const RANK = { none: 0, view: 1, edit: 2 };
export const hasLevel = (access, key, level) => RANK[access?.[key] || 'none'] >= RANK[level];
export const accessKeyFor = (kind) => (kind === 'bug' ? 'bugs' : 'tasks');

/**
 * Mirrors the server's editScope:
 *   'full'   edit access on the kind, or the reporter of a bug
 *   'status' an assignee (status / stage / progress only)
 *   null     read only
 */
export const editScope = (item, access, userId) => {
  if (!item) return null;
  if (hasLevel(access, accessKeyFor(item.kind), 'edit')) return 'full';
  const uid = String(userId || '');
  if (item.kind === 'bug' && String(item.reporter?._id || item.reporter || '') === uid) return 'full';
  if ((item.assignees || []).some((a) => String(a._id) === uid)) return 'status';
  return null;
};

export const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

/** Absolute URL for a stored "/uploads/..." path (same rule as EmployeeProfile). */
export const fileUrl = (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const p = filePath.startsWith('/') ? filePath : `/${filePath}`;
  try {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) return `${new URL(apiUrl).origin}${p}`;
  } catch { /* fall through */ }
  if (window.location.hostname === 'localhost' && window.location.port !== '5000') {
    return `${window.location.protocol}//${window.location.hostname}:5000${p}`;
  }
  return `${window.location.origin}${p}`;
};
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const initials = (name) => (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const isOverdue = (item) => item.deadline && !['completed', 'cancelled'].includes(item.status) && new Date(item.deadline) < new Date(new Date().toDateString());

export const Pill = ({ meta, children }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap ${meta?.cls || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
    {children ?? meta?.label}
  </span>
);

export const AvatarStack = ({ people = [], max = 3 }) => (
  <div className="flex -space-x-1.5">
    {people.slice(0, max).map((p) => (
      <span key={p._id} title={p.name}
        className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold flex items-center justify-center border-2 border-white">
        {initials(p.name)}
      </span>
    ))}
    {people.length > max && (
      <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold flex items-center justify-center border-2 border-white">
        +{people.length - max}
      </span>
    )}
  </div>
);

/** Project, its people (lead + members), modules, and the caller's access. */
export function useProjectContext(projectId) {
  const [state, setState] = useState({ loading: true, error: '', project: null, people: [], access: {}, modules: [] });

  const load = useCallback(async () => {
    try {
      setState((s) => ({ ...s, loading: true, error: '' }));
      const [projRes, modRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/modules`).catch(() => ({ data: { modules: [] } })),
      ]);
      const project = projRes.data.project;
      const list = [project.manager, ...(project.teamMembers || [])].filter((x) => x && x._id);
      setState({
        loading: false,
        error: '',
        project,
        people: [...new Map(list.map((x) => [x._id, x])).values()],
        access: projRes.data.access || {},
        modules: modRes.data.modules || [],
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errMsg(err, 'Could not load this project.') }));
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
