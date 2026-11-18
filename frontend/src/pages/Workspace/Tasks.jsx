/**
 * src/pages/Workspace/Tasks/Tasks.jsx
 * Workspace-level task management — project tasks + self tasks, with
 * role-aware creation/assignment. Backend is the authority on permissions;
 * everything role-based here is a UI convenience only.
 *
 * ASSUMPTIONS TO VERIFY (isolated to single spots):
 *  - Modal prop signature: isOpen/onClose/title/size (same as used elsewhere in this app).
 *  - `role` values are exactly 'admin' | 'manager' | 'team-lead' | 'employee'.
 *  - GET /departments — same endpoint confirmed for Overview/Projects filters.
 *  - GET /projects/:projectId — returns project with `teamMembers` + `manager`/`projectManager`.
 *  - Task "assigned by" field is `assignedBy` (populated {_id,name}) — used only for
 *    the frontend's own-task edit/delete heuristic, see canEditTask()/canDeleteTask().
 *  - Attachments are now real uploaded files (multipart/form-data), max 4. See
 *    handleAttachmentChange/addAttachmentSlot in TaskForm.
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import Modal from '../../components/UI/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_DEFAULT_ACCESS, PERMISSIONS, canAccessView, canAccessEdit, } from '../../constants/modules';
import { DepartmentSelect, EmployeeSelect, ProjectSelect, EmployeeMultiSelect } from "../../components/UI/Assignmentselects";
import GlobalFilters from "../../components/UI/Globalfilters";
/* ── icon helper ── */
const Icon = ({ d, size = 15, className = '', sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);



const IC = {
  tasks: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  progress: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  completed: 'M5 13l4 4L19 7',
  overdue: 'M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 004 21h16a2 2 0 001.89-3L13.71 3.86a2 2 0 00-3.42 0z',
  plus: 'M12 5v14m-7-7h14',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  alert: 'M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 004 21h16a2 2 0 001.89-3L13.71 3.86a2 2 0 00-3.42 0z',
  refresh: 'M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.9 3.4M19.5 9A8 8 0 004.6 5.6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  edit: 'M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 8.5-8.5z',
  trash: 'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z',
  x: 'M6 6l12 12M6 18L18 6',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z',
};

/* ── constants ── */
const STATUS_OPTIONS = ['not-started', 'in-progress', 'review', 'completed', 'cancelled'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];
const MAX_ATTACHMENTS = 4;
const STATUS_DOT = { 'not-started': 'bg-gray-400', 'in-progress': 'bg-violet-500', review: 'bg-blue-500', completed: 'bg-emerald-500', cancelled: 'bg-red-500', };
const PRIORITY_STYLE = { low: 'text-blue-600 bg-blue-50 border-blue-100', medium: 'text-emerald-600 bg-emerald-50 border-emerald-100', high: 'text-amber-600 bg-amber-50 border-amber-100', critical: 'text-rose-600 bg-rose-50 border-rose-100', };
const TABS = [
  { key: 'all', label: 'All Tasks' },
  { key: 'project', label: 'Project Tasks' },
  { key: 'self', label: 'Self Tasks' },
  { key: 'mine', label: 'My Tasks' },
];

const PAGE_SIZE = 11;

const titleCase = (s = '') => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '—');
const fullDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—');
const clamp = (n) => Math.min(100, Math.max(0, Number(n) || 0));

const unwrap = (res, key) => {
  const body = res?.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.[key])) return body[key];
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

const normalizeOne = (res, key) => {
  const body = res?.data;
  return body?.[key] || body?.data || body || null;
};

const getId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref) || '';

/** true when overdue: deadline < today AND status is neither completed nor cancelled */
const isOverdue = (task) => {
  if (!task.deadline) return false;
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.deadline) < new Date(new Date().toDateString());
};

/* ════════════════════════════════════════════════════════════════
   BADGES / PROGRESS
════════════════════════════════════════════════════════════════ */
const TaskStatusBadge = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || 'bg-gray-300'}`} />
    {titleCase(status)}
  </span>
);

const TaskPriorityBadge = ({ priority }) => (
  <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-lg border ${PRIORITY_STYLE[priority] || 'text-gray-500 bg-gray-50 border-gray-100'}`}>
    {titleCase(priority || 'medium')}
  </span>
);

const TypeBadge = ({ type }) => (
  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${type === 'self' ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-violet-600 bg-violet-50 border-violet-100'}`}>
    {type === 'self' ? 'Self' : 'Project'}
  </span>
);

const ProgressBar = ({ value = 0, size = 'md' }) => (
  <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
    <motion.div className="h-full bg-violet-500 rounded-full" initial={{ width: 0 }}
      animate={{ width: `${clamp(value)}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
  </div>
);

/* ════════════════════════════════════════════════════════════════
   TASK TYPE TABS
════════════════════════════════════════════════════════════════ */
const TaskTypeTabs = ({ active, onChange }) => (
  <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl p-1 overflow-x-auto">
    {TABS.map((t) => (
      <button
        key={t.key}
        onClick={() => onChange(t.key)}
        className={`relative px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${active === t.key ? 'text-violet-700' : 'text-gray-400 hover:text-gray-700 hover:bg-white'}`}>
        {active === t.key && (
          <motion.span layoutId="taskTabIndicator" className="absolute inset-0 bg-violet-50 border border-violet-100 rounded-lg" transition={{ duration: 0.2 }} />
        )}
        <span className="relative">{t.label}</span>
      </button>
    ))}
  </div>
);
/* ════════════════════════════════════════════════════════════════
   FILTERS
════════════════════════════════════════════════════════════════ */

const TaskFilters = ({ filters, setFilters }) => {
  const selectCls =
    'text-xs font-semibold text-gray-600 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-100 flex-shrink-0';

  const handleDepartmentChange = (departmentId) => {
    setFilters((prev) => ({
      ...prev,
      department: departmentId || '',
      project: '',
      assignedTo: '',
    }));
  };

  const handleProjectChange = (projectId) => {
    setFilters((prev) => ({
      ...prev,
      project: projectId || '',
      assignedTo: '',
    }));
  };

  const handleEmployeeChange = (employeeId) => {
    setFilters((prev) => ({
      ...prev,
      assignedTo: employeeId || '',
    }));
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">

      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Icon
          d={IC.search}
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
        />

        <input
          value={filters.search}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              search: e.target.value,
            }))
          }
          placeholder="Search tasks…"
          className="w-full text-xs font-medium bg-white border border-gray-100 rounded-xl pl-8 pr-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-200 transition-colors"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">

        {/* Department */}
        <div className="min-w-[170px] flex-shrink-0">
          <DepartmentSelect
            value={filters.department}
            onChange={handleDepartmentChange}
            placeholder="All Departments"
          />
        </div>

        {/* Project */}
        <div className="min-w-[170px] flex-shrink-0">
          <ProjectSelect
            value={filters.project}
            departmentId={filters.department}
            onChange={handleProjectChange}
            placeholder="All Projects"
          />
        </div>

        {/* Employee */}
        <div className="min-w-[170px] flex-shrink-0">
          <EmployeeSelect
            value={filters.assignedTo}
            departmentId={filters.department}
            projectId={filters.project}
            mode="assigned-to"
            placeholder="Everyone"
            onChange={handleEmployeeChange}
          />
        </div>

        {/* Status */}
        <select
          className={selectCls}
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: e.target.value,
            }))
          }
        >
          <option value="">All Statuses</option>

          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>

        {/* Priority */}
        <select
          className={selectCls}
          value={filters.priority}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              priority: e.target.value,
            }))
          }
        >
          <option value="">All Priorities</option>

          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {titleCase(p)}
            </option>
          ))}
        </select>

        {/* Due Date */}
        <input
          type="date"
          value={filters.dueDate}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              dueDate: e.target.value,
            }))
          }
          className={selectCls}
        />

      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   TASK CARD
════════════════════════════════════════════════════════════════ */
const TaskCard = ({ task, canEdit, canDelete, onOpen, onEdit, onDelete }) => {
  const overdue = isOverdue(task);
  const assignedName =
    task.assignees?.length > 0
      ? task.assignees
        .map((assignee) => assignee.user?.name)
        .filter(Boolean)
        .join(', ')
      : task.assignedTo?.name || 'Unassigned';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      onClick={() => onOpen(task)}
      className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all cursor-pointer flex flex-col">

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <TypeBadge type={task.taskType} />
          <span className="text-[11px] font-bold text-violet-500">{task.taskCode}</span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <button onClick={() => onEdit(task)} className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-violet-600 hover:bg-violet-50 transition-colors">
              <Icon d={IC.edit} size={12} />
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(task)} className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Icon d={IC.trash} size={12} />
            </button>
          )}
        </div>
      </div>

      <h3 className="text-sm font-bold text-gray-900 leading-snug mb-1 line-clamp-2">{task.title}</h3>
      {task.project?.name && <p className="text-[11px] text-gray-400 mb-2">{task.project.name}</p>}

      <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-3">
        <Icon d={IC.user} size={11} className="text-gray-300" />
        {assignedName}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <TaskStatusBadge status={task.status} />
        <TaskPriorityBadge priority={task.priority} />
        {overdue && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">Overdue</span>
        )}
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-gray-400 font-medium">Progress</span>
          <span className="text-gray-900 font-bold">{clamp(task.progress)}%</span>
        </div>
        <ProgressBar value={task.progress} size="sm" />
      </div>

      <div className="mt-auto pt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><Icon d={IC.clock} size={11} />Due {shortDate(task.deadline)}</span>
      </div>
    </motion.div>
  );
};
/* ════════════════════════════════════════════════════════════════
   SKELETON / EMPTY / ERROR
════════════════════════════════════════════════════════════════ */
const CardSkeleton = () => (
  <div className="bg-white border border-gray-100 rounded-2xl p-4 animate-pulse space-y-3">
    <div className="h-3 w-20 bg-gray-100 rounded" />
    <div className="h-4 w-4/5 bg-gray-100 rounded" />
    <div className="h-2.5 w-1/2 bg-gray-100 rounded" />
    <div className="h-1.5 w-full bg-gray-100 rounded-full mt-3" />
  </div>
);
const EmptyState = ({ canCreate, onCreate }) => (
  <div className="col-span-full bg-white border border-gray-100 rounded-2xl p-10 flex flex-col items-center text-center gap-2 shadow-sm">
    <div className="w-11 h-11 rounded-xl bg-gray-100 border border-gray-200 text-gray-400 flex items-center justify-center">
      <Icon d={IC.tasks} size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">No tasks found</p>
    <p className="text-xs text-gray-400 max-w-xs">Try changing your filters, or create a new task.</p>
    {canCreate && (
      <button onClick={onCreate} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3.5 py-2 rounded-xl transition-colors">
        <Icon d={IC.plus} size={13} />
        Create Task
      </button>
    )}
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div className="col-span-full bg-white border border-gray-100 rounded-2xl p-10 flex flex-col items-center text-center gap-3 shadow-sm">
    <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center">
      <Icon d={IC.alert} size={18} />
    </div>
    <p className="text-sm font-bold text-gray-900">Unable to load tasks</p>
    <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3.5 py-2 rounded-xl transition-colors">
      <Icon d={IC.refresh} size={13} />
      Retry
    </button>
  </div>
);

/* ════════════════════════════════════════════════════════════════
   TASK FORM (create + edit)
════════════════════════════════════════════════════════════════ */
const emptyTaskForm = {
  taskType: 'self',
  title: '',
  description: '',
  department: '',
  project: '',
  assignedTo: [],
  priority: 'medium',
  status: 'not-started',
  startDate: '',
  deadline: '',
  estimatedHours: '',
  remarks: '',
};

const TaskForm = ({ initial, currentUser, canCreateProjectTask, canAssignOthers, onCancel, onSubmit, submitting,
}) => {

  const [form, setForm] = useState(() =>
    initial
      ? {
        taskType: initial.taskType || 'self',
        title: initial.title || '',
        description: initial.description || '',
        department: getId(initial.department),
        project: getId(initial.project),
        assignedTo: Array.isArray(initial?.assignedTo) ? initial.assignedTo.map(getId) : initial?.assignedTo ? [getId(initial.assignedTo)] : [], priority: initial.priority || 'medium',
        status: initial.status || 'not-started',
        startDate: initial.startDate ? initial.startDate.slice(0, 10) : '',
        deadline: initial.deadline ? initial.deadline.slice(0, 10) : '',
        estimatedHours: initial.estimatedHours ?? '',
        remarks: initial.remarks || '',
      }
      : emptyTaskForm
  );

  // const [loadingMembers, setLoadingMembers] = useState(false);
  const [errors, setErrors] = useState({});

  // ─────────────────────────────────────
  // Attachments — existing (kept URLs, edit only) + new file slots
  // ─────────────────────────────────────

  const [existingAttachments, setExistingAttachments] = useState(initial?.attachments || []);

  const [attachmentSlots, setAttachmentSlots] = useState(() =>
    initial ? [] : [null] // create form starts with exactly one empty slot
  );
  const totalAttachmentCount = existingAttachments.length + attachmentSlots.length;
  const addAttachmentSlot = () => {
    setAttachmentSlots((s) => (existingAttachments.length + s.length >= MAX_ATTACHMENTS ? s : [...s, null]));
  };
  const removeAttachmentSlot = (index) => {
    setAttachmentSlots((s) => s.filter((_, i) => i !== index));
  };
  const handleAttachmentChange = (index, file) => {
    setAttachmentSlots((s) => s.map((f, i) => (i === index ? file : f)));
  };
  const removeExistingAttachment = (index) => {
    setExistingAttachments((a) => a.filter((_, i) => i !== index));
  };


  // ─────────────────────────────────────
  // Task type change
  // ─────────────────────────────────────

  const handleTypeChange = (taskType) => {
    if (taskType === 'self') {
      setForm((f) => ({
        ...f,
        taskType: 'self',
        department: '',
        project: '',
        assignedTo: currentUser?._id || '',
      }));

      return;
    }

    if (!canCreateProjectTask) return;

    setForm((f) => ({
      ...f,
      taskType: 'project',
      department: '',
      project: '',
      assignedTo: [],
    }));
  };

  // ─────────────────────────────────────
  // Validation
  // ─────────────────────────────────────

  const validate = () => {
    const errs = {};

    if (!form.title?.trim()) {
      errs.title = 'Task title is required';
    }

    if (form.taskType === 'project') {
      if (!form.department) errs.department = 'Department is required for a project task';
      if (!form.project) errs.project = 'Project is required for a project task';
      if (!form.assignedTo) errs.assignedTo = 'Assigned To is required for a project task';
    }

    if (form.startDate && form.deadline && form.deadline < form.startDate) {
      errs.deadline = 'Deadline cannot be before start date';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─────────────────────────────────────
  // Submit — builds multipart/form-data so real files go through
  // ─────────────────────────────────────

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const fd = new FormData();

    fd.append('taskType', form.taskType);
    fd.append('title', form.title.trim());
    if (form.description) fd.append('description', form.description);
    fd.append('priority', form.priority);
    fd.append('status', form.status);
    if (form.startDate) fd.append('startDate', form.startDate);
    if (form.deadline) fd.append('deadline', form.deadline);
    if (form.estimatedHours !== '') fd.append('estimatedHours', form.estimatedHours);
    if (form.remarks) fd.append('remarks', form.remarks);

    // Self Task: department/project/assignedTo are never sent — the
    // backend derives them from req.user. Project Task: send the full
    // hierarchy; the backend re-validates every link.
    if (form.taskType === 'project') {
      fd.append('department', form.department);
      fd.append('project', form.project);
      fd.append('assignedTo', form.assignedTo);
    }
    if (initial) {
      fd.append('existingAttachments', JSON.stringify(existingAttachments));
    }
    attachmentSlots.filter(Boolean).forEach((file) => fd.append('attachments', file));
    onSubmit(fd);
  };

  const inputCls = 'w-full text-sm bg-white border border-gray-100 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-200 transition-colors';
  const labelCls = 'block text-xs font-bold text-gray-500 mb-1.5';

  const availableTypes = canCreateProjectTask ? ['self', 'project'] : ['self'];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Task Type */}
      <div>
        <label className={labelCls}>Task Type</label>
        <div className="flex gap-2">
          {availableTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={`flex-1 text-xs font-semibold py-2.5 rounded-xl border transition-colors ${form.taskType === type ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-white border-gray-100 text-gray-400 hover:text-gray-600'}`}>
              {type === 'self' ? 'Self Task' : 'Project Task'}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className={labelCls}>Task Title *</label>
        <input
          className={inputCls}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        {errors.title && <p className="text-[11px] text-red-500 mt-1">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea
          rows={3}
          className={inputCls}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>

      {/* ─────────────────────────────── */}
      {/* PROJECT TASK — Department → Project → Assigned To */}
      {/* ─────────────────────────────── */}

      {form.taskType === 'project' && (
        <>
          {/* Department */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Department
            </label>
            <DepartmentSelect
              value={form.department}
              onChange={(departmentId) => {
                setForm((prev) => ({ ...prev, department: departmentId, project: '', assignedTo: [], }));
              }}
            />
          </div>
          {console.log(form.department)}


          {/* Project */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Project
            </label>

            <ProjectSelect
              value={form.project}
              departmentId={form.department}
              onChange={(projectId) => {
                setForm((prev) => ({
                  ...prev,
                  project: projectId,
                  assignedTo: [],
                }));
              }}
            />
          </div>


          {/* Assigned To */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Assigned To
            </label>

            <EmployeeSelect
              value={form.assignedTo}
              departmentId={form.department}
              projectId={form.project}
              mode="assigned-to"
              onChange={(employeeId) => {
                setForm((prev) => ({
                  ...prev,
                  assignedTo: employeeId,
                }));
              }}
            />
          </div>
        </>
      )}

      {/* SELF TASK */}
      {form.taskType === 'self' && (
        <div className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
          This task will be assigned to you.
        </div>
      )}

      {/* Priority / Status */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Priority</label>
          <select
            className={inputCls}
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          >
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <select
            className={inputCls}
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start Date</label>
          <input
            type="date"
            className={inputCls}
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </div>

        <div>
          <label className={labelCls}>Deadline</label>
          <input
            type="date"
            className={inputCls}
            value={form.deadline}
            onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
          />
          <p className="text-[10px] text-gray-400 mt-1">Optional</p>
          {errors.deadline && <p className="text-[11px] text-red-500 mt-1">{errors.deadline}</p>}
        </div>
      </div>

      {/* Estimated Hours */}
      <div>
        <label className={labelCls}>Estimated Hours</label>
        <input
          type="number"
          min="0"
          className={inputCls}
          value={form.estimatedHours}
          onChange={(e) => setForm((f) => ({ ...f, estimatedHours: e.target.value }))}
        />
      </div>

      {/* Remarks */}
      <div>
        <label className={labelCls}>Remarks</label>
        <textarea
          rows={2}
          className={inputCls}
          value={form.remarks}
          onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
        />
      </div>

      {/* ─────────────────────────────── */}
      {/* Attachments — up to 4 real files */}
      {/* ─────────────────────────────── */}

      <div>
        <label className={labelCls}>Attachments</label>
        <p className="text-[11px] text-gray-400 mb-1.5">Up to 4 files.</p>

        {existingAttachments.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {existingAttachments.map((url, i) => (
              <div key={`${url}-${i}`} className="flex items-center justify-between gap-2 text-xs bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-violet-600 truncate hover:underline">
                  <Icon d={IC.file} size={12} className="flex-shrink-0" />
                  <span className="truncate">{url.split('/').pop()}</span>
                </a>
                <button type="button" onClick={() => removeExistingAttachment(i)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                  <Icon d={IC.x} size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {attachmentSlots.map((file, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="file"
                onChange={(e) => handleAttachmentChange(i, e.target.files?.[0] || null)}
                className="flex-1 text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 border border-gray-100 rounded-xl"
              />
              <button
                type="button"
                onClick={() => removeAttachmentSlot(i)}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Icon d={IC.x} size={13} />
              </button>
            </div>
          ))}
        </div>

        {totalAttachmentCount < MAX_ATTACHMENTS && (
          <button
            type="button"
            onClick={addAttachmentSlot}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700"
          >
            <Icon d={IC.plus} size={12} />
            Add Attachment
          </button>
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-50">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors"
        >
          {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Task'}
        </button>
      </div>
    </form>
  );
};

/* ════════════════════════════════════════════════════════════════
   TASK DETAILS
════════════════════════════════════════════════════════════════ */
const DetailRow = ({ label, children }) => (
  <div>
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
    <div className="text-sm font-semibold text-gray-800">{children}</div>
  </div>
);

const TaskDetails = ({ task }) => {
  if (!task) return null;
  const overdue = isOverdue(task);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <TypeBadge type={task.taskType} />
        <span className="text-xs font-bold text-violet-500">{task.taskCode}</span>
        <TaskStatusBadge status={task.status} />
        <TaskPriorityBadge priority={task.priority} />
        {overdue && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">Overdue</span>}
      </div>

      <div>
        <h3 className="text-base font-extrabold text-gray-900">{task.title}</h3>
        <p className="text-sm text-gray-500 mt-1">{task.description || 'No description provided.'}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
        <DetailRow label="Project">{task.project?.name || '—'}</DetailRow>
        <DetailRow label="Department">{task.department?.name || '—'}</DetailRow>
        <DetailRow label="Assigned To"> {task.assignees?.length > 0 ? task.assignees.map((assignee) => assignee.user?.name).filter(Boolean).join(', ') : task.assignedTo?.name || 'Unassigned'}</DetailRow>
        <DetailRow label="Assigned By">{task.assignedBy?.name || '—'}</DetailRow>
        <DetailRow label="Start Date">{fullDate(task.startDate)}</DetailRow>
        <DetailRow label="Deadline">{fullDate(task.deadline)}</DetailRow>
        <DetailRow label="Estimated Hours">{task.estimatedHours ?? '—'}</DetailRow>
        <DetailRow label="Actual Hours">{task.actualHours ?? '—'}</DetailRow>
        <DetailRow label="Created">{fullDate(task.createdAt)}</DetailRow>
        <DetailRow label="Updated">{fullDate(task.updatedAt)}</DetailRow>
      </div>

      {task.remarks && <DetailRow label="Remarks"><span className="font-normal text-gray-600">{task.remarks}</span></DetailRow>}

      {Array.isArray(task.attachments) && task.attachments.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Attachments</p>
          <div className="space-y-1">
            {task.attachments.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-violet-600 hover:underline truncate">
                <Icon d={IC.file} size={12} className="flex-shrink-0" />
                {url.split('/').pop()}
              </a>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-bold text-gray-700">Progress</span>
          <span className="font-extrabold text-violet-600">{clamp(task.progress)}%</span>
        </div>
        <ProgressBar value={task.progress} />
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   MAIN: Tasks
════════════════════════════════════════════════════════════════ */
const Tasks = () => {
  const { user } = useAuth();
  const role = user?.role;
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isTeamLead = role === 'team-lead';
  const isEmployee = role === 'employee';

  const [state, setState] = useState({ status: 'loading', tasks: [], meta: { total: 0, page: 1, pages: 1 } });
  const [summary, setSummary] = useState({ total: 0, inProgress: 0, completed: 0, overdue: 0, });

  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ search: "", department: "", project: "", employee: "", manager: "", teamLead: "", status: "", priority: "", dueDate: "", });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewingTask, setViewingTask] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const importInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const requestIdRef = useRef(0);
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  /* ── permissions (UI hints only — backend re-checks everything) ── */
  const canViewTasks = canAccessView(user, 'task');
  const canEditTasks = canAccessEdit(user, 'task');

  const permissions = {
    canView: canViewTasks,
    canCreate: canEditTasks,
    canCreateProjectTask: canEditTasks,
    canAssignOthers: canEditTasks,
    canFilterDepartment: canEditTasks,
    canFilterAssignee: canEditTasks,
    canEditTask: (task) => {
      if (!canEditTasks) return false;
      return (task?.assignedTo?._id === user?._id || task?.assignedBy?._id === user?._id || canEditTasks);
    },

    canDeleteTask: (task) => {
      if (!canEditTasks) return false;
      return (
        task?.assignedBy?._id === user?._id ||
        canEditTasks
      );
    },
  };


  /* ── debounce search ── */
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(filters.search), 350);
    return () => clearTimeout(searchDebounceRef.current);
  }, [filters.search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, filters.project, filters.department, filters.employee, filters.status, filters.priority, filters.dueDate, activeTab]);

  const getTaskFilterParams = () => ({
    search: debouncedSearch || undefined,
    department: filters.department || undefined,
    project: filters.project || undefined,
    assignedTo: activeTab === "mine" ? user?._id : filters.employee || undefined,
    manager: filters.manager || undefined,
    teamLead: filters.teamLead || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    type: activeTab === "project" || activeTab === "self" ? activeTab : undefined,
    dueDate: filters.dueDate || undefined,
  });
  const fetchTasks = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const params = {
        ...getTaskFilterParams(),
        page,
        limit: PAGE_SIZE,
      };
      const res = await api.get('/tasks', { params });
      if (requestId !== requestIdRef.current) return;

      const body = res?.data || {};
      const taskData = body.tasks ?? body.data;
      setState({
        status: 'success',
        tasks: Array.isArray(taskData) ? taskData : [],
        meta: { total: body.total ?? 0, page: body.page ?? page, pages: body.pages ?? 1 },
      });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ status: 'error', tasks: [], meta: { total: 0, page: 1, pages: 1 } });
    }
  }, [page, debouncedSearch, filters.project, filters.department, filters.employee, filters.status, filters.priority, filters.dueDate, activeTab, user?._id]);


  const fetchTaskSummary = async () => {
    try {
      const params = getTaskFilterParams();
      const res = await api.get("/tasks/summary", { params, });
      const data = res?.data;
      if (data?.success) {
        setSummary({ total: data.summary?.total ?? 0, inProgress: data.summary?.inProgress ?? 0, completed: data.summary?.completed ?? 0, overdue: data.summary?.overdue ?? 0, });
      }
    } catch (error) {
      console.error("Failed to fetch task summary:", error);
      setSummary({ total: 0, inProgress: 0, completed: 0, overdue: 0, });
    }
  };

  useEffect(() => { fetchTasks(); }, [page,
    debouncedSearch,
    filters.project,
    filters.department,
    filters.employee,
    filters.manager,
    filters.teamLead,
    filters.status,
    filters.priority,
    filters.dueDate,
    activeTab,]);

  useEffect(() => {
    fetchTaskSummary();
  }, [
    debouncedSearch,
    filters.project,
    filters.department,
    filters.employee,
    filters.manager,
    filters.teamLead,
    filters.status,
    filters.priority,
    filters.dueDate,
    activeTab,
  ]);

  /* ── KPIs — from the currently loaded/filtered page ── */
  const kpis = useMemo(() => {
    const { tasks } = state;
    return {
      total: state.meta.total || tasks.length,
      mine: tasks.filter((t) => t.assignedTo?._id === user?._id).length,
      inProgress: tasks.filter((t) => t.status === 'in-progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      overdue: tasks.filter(isOverdue).length,
    };
  }, [state, user?._id]);

  /* ── mutations ── */
  const handleCreate = async (formData) => {
    setSubmitting(true);
    try {
      await api.post('/tasks', formData);
      toast.success('Task created');
      setShowForm(false);
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not create task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportExcel = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const extension = file.name.toLowerCase().split(".").pop();

    if (!["xlsx", "xls"].includes(extension)) {
      toast.error("Please select an Excel file.");
      event.target.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setImporting(true);

    try {
      const res = await api.post("/tasks/import", formData);
      const result = res?.data;
      const imported = result?.summary?.imported || 0;
      const failed = result?.summary?.failed || 0;
      if (failed === 0) {
        toast.success(`${imported} task${imported !== 1 ? "s" : ""} imported successfully.`);
      } else {
        toast.success(`${imported} imported, ${failed} failed.`);
        console.log("Failed task rows:", result?.failed);
      }
      await fetchTasks();
    } catch (err) {
      console.error("Task Excel import:", err);
      toast.error(err?.response?.data?.message || "Could not import tasks.");

    } finally {
      setImporting(false);

      // Allow selecting the same file again
      event.target.value = "";
    }
  };

  const handleUpdate = async (formData) => {
    setSubmitting(true);
    try {
      await api.put(`/tasks/${editingTask._id}`, formData);
      toast.success('Task updated');
      setEditingTask(null);
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update task');
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/tasks/${deleteTarget._id}`);
      toast.success('Task deleted');
      setDeleteTarget(null);
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete task');
    } finally {
      setSubmitting(false);
    }
  };

  const isEmpty = state.status === 'success' && state.tasks.length === 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight"> Tasks </h2>
          <p className="text-sm text-gray-400 mt-0.5"> Manage project tasks and personal tasks</p>
        </div>
        {permissions.canCreate && (
          <div className="flex items-center gap-2">
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-1.5 py-1.5 rounded-xl transition-colors disabled:opacity-50">
              <Icon d={IC.upload} size={14} /> {importing ? "Importing..." : "Import Excel"}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-4 py-2.5 rounded-xl shadow-sm transition-colors">
              <Icon d={IC.plus} size={14} /> Add Task
            </button>
          </div>
        )}
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Tasks" value={summary.total} icon={<Icon d={IC.tasks} size={17} />} color="violet" />
        <KpiCard label="My Tasks" value={kpis.mine} icon={<Icon d={IC.user} size={17} />} color="green" />
        <KpiCard label="In Progress" value={summary.inProgress} icon={<Icon d={IC.progress} size={17} />} color="golden" />
        <KpiCard label="Completed" value={summary.completed} icon={<Icon d={IC.completed} size={17} />} color="green" />
        <KpiCard label="Overdue" value={summary.overdue} icon={<Icon d={IC.overdue} size={17} />} color="red" />
      </div>
      <p className="text-[11px] text-gray-400 -mt-3">Reflects the current filtered results{state.meta.total ? ` (${summary.total} total)` : ''}.</p>

      {/* Tabs */}
      <TaskTypeTabs active={activeTab} onChange={setActiveTab} />

      {/* Filters */}
      <GlobalFilters
        filters={filters}
        setFilters={setFilters}
        enabledFilters={[
          "search",
          "department",
          "project",
          "employee",
          "status",
          "priority",
          // "manager",
          // "teamLead",
        ]}
      />
      {/* Task grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.status === 'loading' && Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        {state.status === 'error' && <ErrorState onRetry={fetchTasks} />}
        {isEmpty && <EmptyState canCreate={permissions.canCreate} onCreate={() => setShowForm(true)} />}
        {state.status === 'success' && state.tasks.map((t) => (
          <TaskCard
            key={t._id}
            task={t}
            canEdit={permissions.canEditTask(t)}
            canDelete={permissions.canDeleteTask(t)}
            onOpen={setViewingTask}
            onEdit={setEditingTask}
            onDelete={setDeleteTarget}
          />
        ))}
      </div>

      {/* Pagination */}
      {/* Pagination */}
      {state.status === 'success' && state.meta.pages > 1 && (() => {
        const totalPages = state.meta.pages;
        const currentPage = page;

        const getPageNumbers = () => {
          // Show all pages when there are 7 or fewer
          if (totalPages <= 7) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
          }

          // Beginning
          if (currentPage <= 4) {
            return [1, 2, 3, 4, 5, '...', totalPages];
          }

          // End
          if (currentPage >= totalPages - 3) {
            return [
              1,
              '...',
              totalPages - 4,
              totalPages - 3,
              totalPages - 2,
              totalPages - 1,
              totalPages,
            ];
          }

          // Middle
          return [
            1,
            '...',
            currentPage - 1,
            currentPage,
            currentPage + 1,
            '...',
            totalPages,
          ];
        };

        const pageNumbers = getPageNumbers();

        return (
          <div className="flex items-center justify-center gap-1.5 pt-2">

            {/* Previous */}
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <Icon d={IC.chevronLeft} size={14} />
            </button>

            {/* Page Numbers */}
            {pageNumbers.map((number, index) => {
              if (number === '...') {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="w-8 h-8 flex items-center justify-center text-xs font-bold text-gray-400"
                  >
                    ...
                  </span>
                );
              }

              return (
                <button
                  key={number}
                  onClick={() => setPage(number)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${number === currentPage
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50 border border-gray-100'
                    }`}
                >
                  {number}
                </button>
              );
            })}

            {/* Next */}
            <button
              disabled={currentPage >= totalPages}
              onClick={() =>
                setPage((p) => Math.min(totalPages, p + 1))
              }
              className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <Icon d={IC.chevronRight} size={14} />
            </button>

          </div>
        );
      })()}

      {/* Create Task modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Create Task" size="lg">
        <TaskForm
          // projects={projects}
          // departments={departments}
          currentUser={user}
          canCreateProjectTask={permissions.canCreateProjectTask}
          canAssignOthers={permissions.canAssignOthers}
          onCancel={() => setShowForm(false)}
          onSubmit={handleCreate}
          submitting={submitting}
        />
      </Modal>

      {/* Edit Task modal */}
      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title="Edit Task" size="lg">
        {editingTask && (
          <TaskForm
            currentUser={user}
            canCreateProjectTask={permissions.canCreateProjectTask}
            canAssignOthers={permissions.canAssignOthers}
            initial={editingTask}
            onCancel={() => setEditingTask(null)}
            onSubmit={handleUpdate}
            submitting={submitting}
          />
        )}
      </Modal>

      {/* Task details modal */}
      <Modal isOpen={!!viewingTask} onClose={() => setViewingTask(null)} title="Task Details" size="lg">
        <TaskDetails task={viewingTask} />
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Task" size="sm">
        <p className="text-sm text-gray-700 font-semibold mb-1">Delete "{deleteTarget?.title}"?</p>
        <p className="text-xs text-gray-400 mb-5">This cannot be undone.</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button disabled={submitting} onClick={handleDelete} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors">
            {submitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Tasks;