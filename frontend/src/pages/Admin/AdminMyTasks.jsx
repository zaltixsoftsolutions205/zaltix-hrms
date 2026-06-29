import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/helpers';

const DURATION_OPTS = [
  { label: 'No timer', value: '' },
  { label: '15 min',   value: 15 },
  { label: '30 min',   value: 30 },
  { label: '1 hour',   value: 60 },
  { label: '2 hours',  value: 120 },
  { label: '4 hours',  value: 240 },
  { label: '8 hours',  value: 480 },
  { label: '1 day',    value: 1440 },
  { label: '2 days',   value: 2880 },
  { label: '3 days',   value: 4320 },
  { label: '1 week',   value: 10080 },
];

const fmtDuration = (mins) => {
  if (!mins) return null;
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${mins / 60}h`;
  return `${Math.round(mins / 1440)}d`;
};

function useCountdown(startedAt, durationMins) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!startedAt || !durationMins) { setRemaining(null); return; }
    const tick = () => {
      const endsAt = new Date(startedAt).getTime() + durationMins * 60000;
      setRemaining(Math.max(0, endsAt - Date.now()));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt, durationMins]);
  return remaining;
}

function CountdownBadge({ startedAt, durationMins }) {
  const ms = useCountdown(startedAt, durationMins);
  if (ms === null) return null;
  if (ms === 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 animate-pulse">Expired</span>;
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pct = (ms / (durationMins * 60000)) * 100;
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pct < 20 ? 'bg-golden-500 text-white animate-pulse' : 'bg-violet-50 text-violet-600'}`}>
      ⏱ {label}
    </span>
  );
}

const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_CYCLE = { 'not-started': 'in-progress', 'in-progress': 'completed', 'completed': 'not-started' };
const STATUS_LABELS = { 'not-started': 'To Do', 'in-progress': 'In Progress', 'completed': 'Done' };
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* ── Task icon avatar (initials) ── */
const TaskAvatar = ({ title, status, priority }) => {
  const initials = title ? title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
  const bg =
    status === 'completed'   ? 'bg-violet-600 text-white' :
    priority === 'high'      ? 'bg-golden-500 text-white' :
    priority === 'medium'    ? 'bg-violet-100 text-violet-700' :
                               'bg-gray-100 text-gray-500';
  return (
    <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-extrabold ${bg}`}>
      {initials}
    </div>
  );
};

/* ══════════════════════ COMPONENT ══════════════════════ */
export default function AdminMyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTask, setEditTask]         = useState(null);
  const [filter, setFilter]             = useState('active');
  const [selectedDate, setSelectedDate] = useState(null);
  const [search, setSearch]             = useState('');
  const [activeFocus, setActiveFocus]   = useState(null);

  const [form, setForm]       = useState({ title: '', priority: 'medium', deadline: '', duration: '', description: '' });
  const [editForm, setEditForm] = useState({ title: '', priority: 'medium', deadline: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = () => {
    api.get('/tasks/my').then(r => setTasks(r.data.tasks || [])).catch(() => {}).finally(() => setLoading(false));
  };
  const fetchFocus = () => {
    api.get('/tasks/active-self').then(r => setActiveFocus(r.data?.active || r.data || null)).catch(() => {});
  };
  useEffect(() => { fetchTasks(); fetchFocus(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.deadline) return toast.error('Title and deadline required');
    setSubmitting(true);
    try {
      const payload = { title: form.title, priority: form.priority, deadline: form.deadline, assignedTo: user._id, description: form.description || '' };
      if (form.duration) payload.duration = Number(form.duration);
      await api.post('/tasks', payload);
      toast.success('Task created');
      setForm({ title: '', priority: 'medium', deadline: '', duration: '', description: '' });
      setShowForm(false);
      fetchTasks(); fetchFocus();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const openEdit = (task) => {
    setEditTask(task._id);
    setEditForm({ title: task.title, priority: task.priority, deadline: task.deadline ? task.deadline.slice(0, 10) : '' });
    setShowForm(false);
  };
  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editForm.title.trim() || !editForm.deadline) return toast.error('Title and deadline required');
    setSubmitting(true);
    try {
      await api.put(`/tasks/${editTask}`, { title: editForm.title, priority: editForm.priority, deadline: editForm.deadline });
      toast.success('Task updated');
      setEditTask(null);
      fetchTasks();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleStatusToggle = async (task) => {
    const next = STATUS_CYCLE[task.status];
    try {
      await api.put(`/tasks/${task._id}/status`, { status: next });
      setTasks(prev => prev.map(t => t._id === task._id
        ? { ...t, status: next, startedAt: next === 'in-progress' && !t.startedAt ? new Date().toISOString() : t.startedAt }
        : t));
      if (next === 'completed' && activeFocus?._id === task._id) fetchFocus();
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      setTasks(prev => prev.filter(t => t._id !== id));
      if (activeFocus?._id === id) setActiveFocus(null);
    } catch { toast.error('Failed to delete'); }
  };

  const isOverdue = (t) => t.status !== 'completed' && new Date(t.deadline) < new Date();

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Calendar: 14 days from start of this week
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const calDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const filtered = tasks.filter(t => {
    if (filter === 'active'  && t.status === 'completed') return false;
    if (filter === 'done'    && t.status !== 'completed') return false;
    if (filter === 'overdue' && !isOverdue(t)) return false;
    if (selectedDate && (!t.deadline || t.deadline.slice(0, 10) !== selectedDate)) return false;
    if (search.trim() && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    active:  tasks.filter(t => t.status !== 'completed').length,
    done:    tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => isOverdue(t)).length,
  };

  const showPanel = showForm || !!editTask;

  return (
    <div className="flex h-full min-h-screen bg-gray-50">

      {/* ══════════ LEFT: TASK LIST ══════════ */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${showPanel ? 'hidden sm:flex' : 'flex'}`}>

        {/* Header */}
        <div className="bg-white px-5 pt-5 pb-0 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">My Task</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedDate
                  ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
                  : today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-gray-700 placeholder:text-gray-300 text-xs rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-violet-400 w-36"
                  placeholder="Search…" />
              </div>
              <button onClick={() => { setShowForm(true); setEditTask(null); }}
                className="w-8 h-8 bg-violet-600 hover:bg-violet-700 text-white rounded-xl flex items-center justify-center transition-colors shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4">
                  <path d="M12 4v16m8-8H4"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-0 mt-3">
            {[
              { key: 'active',  label: 'Active',  n: stats.active  },
              { key: 'done',    label: 'Done',    n: stats.done    },
              { key: 'overdue', label: 'Overdue', n: stats.overdue },
              { key: 'all',     label: 'All',     n: tasks.length  },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 pb-3 pt-1 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  filter === f.key ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {f.label}
                {f.n > 0 && (
                  <span className={`text-[10px] min-w-[16px] h-4 px-1 rounded-full font-bold flex items-center justify-center ${
                    filter === f.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>{f.n}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar date strip */}
        <div className="bg-white px-5 py-3 border-b border-gray-100">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {calDays.map(d => {
              const iso = d.toISOString().slice(0, 10);
              const isToday = iso === todayIso;
              const isSel   = iso === selectedDate;
              const hasTasks = tasks.some(t => t.deadline?.slice(0, 10) === iso);
              return (
                <button key={iso} onClick={() => setSelectedDate(isSel ? null : iso)}
                  className={`flex flex-col items-center px-2.5 py-2 rounded-xl flex-shrink-0 min-w-[42px] transition-all ${
                    isSel   ? 'bg-violet-600 text-white shadow-md'
                    : isToday ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                  }`}>
                  <span className="text-[9px] font-semibold uppercase">{DAYS_SHORT[d.getDay()]}</span>
                  <span className="text-sm font-extrabold leading-tight mt-0.5">{String(d.getDate()).padStart(2, '0')}</span>
                  {hasTasks && !isSel && <span className={`w-1 h-1 rounded-full mt-1 ${isToday ? 'bg-violet-400' : 'bg-gray-300'}`} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">

          {/* Focus banner */}
          <AnimatePresence>
            {activeFocus && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-2xl">
                <span className="w-2 h-2 rounded-full bg-golden-400 animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">Focus: {activeFocus.title}</p>
                  <p className="text-[10px] text-gray-400">Complete before starting another timed task</p>
                </div>
                <CountdownBadge startedAt={activeFocus.startedAt} durationMins={activeFocus.duration} />
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="py-20 text-center text-gray-300 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-gray-300">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-400">No tasks</p>
              <p className="text-xs text-gray-300 mt-1">Tap + to add one</p>
            </div>
          ) : (
            <AnimatePresence>
              {filtered.map((task, idx) => {
                const ov = isOverdue(task);
                const isFocus = activeFocus?._id === task._id;
                const hasDur  = !!task.duration && task.status === 'in-progress' && !!task.startedAt;
                const pct     = hasDur ? Math.min(100, ((Date.now() - new Date(task.startedAt).getTime()) / (task.duration * 60000)) * 100) : null;
                const timeLabel = task.deadline
                  ? new Date(task.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : null;

                return (
                  <motion.div key={task._id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`bg-white border rounded-2xl px-4 py-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer group ${
                      task.status === 'completed' ? 'border-gray-100 opacity-65'
                      : isFocus   ? 'border-violet-300'
                      : ov        ? 'border-gray-200'
                      : 'border-gray-100 hover:border-gray-200'
                    }`}>
                    <div className="flex items-center gap-3">

                      {/* Avatar */}
                      <TaskAvatar title={task.title} status={task.status} priority={task.priority} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-sm font-bold leading-snug truncate ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[10px] font-semibold ${
                                task.status === 'completed' ? 'text-gray-400' : 'text-gray-500'
                              }`}>{STATUS_LABELS[task.status]}</span>
                              <span className="text-gray-200">·</span>
                              <span className="text-[10px] text-gray-400 font-medium">{PRIORITY_LABELS[task.priority]}</span>
                              {isFocus && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-golden-500 text-white">FOCUS</span>}
                              {hasDur && <CountdownBadge startedAt={task.startedAt} durationMins={task.duration} />}
                            </div>
                            {hasDur && (
                              <div className="mt-1.5 h-0.5 bg-gray-100 rounded-full overflow-hidden w-24">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
                                  className={`h-full rounded-full ${pct > 80 ? 'bg-violet-600' : 'bg-violet-200'}`} />
                              </div>
                            )}
                          </div>

                          {/* Right side: time badge + actions */}
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            {timeLabel && (
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl ${
                                ov && task.status !== 'completed' ? 'bg-golden-500 text-white' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {ov && task.status !== 'completed' ? '⚠ ' : ''}{timeLabel}
                              </span>
                            )}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Status cycle */}
                              <button onClick={() => handleStatusToggle(task)} title="Advance status"
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                  task.status === 'completed' ? 'bg-violet-600 border-violet-600'
                                  : task.status === 'in-progress' ? 'border-violet-400 bg-white'
                                  : 'border-gray-300 bg-white hover:border-violet-400'
                                }`}>
                                {task.status === 'completed' && (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} className="w-2.5 h-2.5"><path d="M5 13l4 4L19 7"/></svg>
                                )}
                                {task.status === 'in-progress' && <span className="w-2 h-2 rounded-full bg-violet-400" />}
                              </button>
                              {/* Edit */}
                              <button onClick={() => openEdit(task)}
                                className="w-5 h-5 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              {/* Delete */}
                              <button onClick={() => handleDelete(task._id)}
                                className="w-5 h-5 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-700 hover:bg-gray-100 transition-all">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ══════════ RIGHT PANEL: CREATE / EDIT ══════════ */}
      <AnimatePresence>
        {showPanel && (
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2 }}
            className="w-full sm:w-80 lg:w-96 bg-white border-l border-gray-100 flex flex-col shadow-xl">

            {/* Panel header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <button onClick={() => { setShowForm(false); setEditTask(null); }}
                className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>
              <h3 className="text-sm font-extrabold text-gray-900 flex-1">
                {editTask ? 'Edit Task' : 'Create New Task'}
              </h3>
              <div className="w-8 h-8 bg-violet-50 rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-violet-500">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
              </div>
            </div>

            {/* Panel form */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <form onSubmit={editTask ? handleEdit : handleAdd} className="space-y-6">

                {/* Task Name */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Task Name</label>
                  <input
                    className="w-full pb-2 text-sm font-semibold text-gray-900 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent placeholder:text-gray-300 transition-colors"
                    placeholder="Enter task name…"
                    value={editTask ? editForm.title : form.title}
                    onChange={e => editTask ? setEditForm(p => ({ ...p, title: e.target.value })) : setForm(p => ({ ...p, title: e.target.value }))}
                    autoFocus
                  />
                </div>

                {/* Priority (as category pills) */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Priority</label>
                  <div className="flex gap-2 flex-wrap">
                    {['low', 'medium', 'high'].map(p => {
                      const cur = editTask ? editForm.priority : form.priority;
                      return (
                        <button key={p} type="button"
                          onClick={() => editTask ? setEditForm(prev => ({ ...prev, priority: p })) : setForm(prev => ({ ...prev, priority: p }))}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                            cur === p ? 'bg-violet-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600'
                          }`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Date *</label>
                  <input type="date"
                    className="w-full pb-2 text-sm font-semibold text-gray-900 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent transition-colors"
                    value={editTask ? editForm.deadline : form.deadline}
                    onChange={e => editTask ? setEditForm(p => ({ ...p, deadline: e.target.value })) : setForm(p => ({ ...p, deadline: e.target.value }))}
                  />
                </div>

                {/* Timer (add form only) */}
                {!editTask && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Timer <span className="font-normal normal-case text-gray-300">(optional)</span></label>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { label: 'None',   value: ''    },
                        { label: '30m',    value: 30    },
                        { label: '1h',     value: 60    },
                        { label: '2h',     value: 120   },
                        { label: '4h',     value: 240   },
                        { label: '1 day',  value: 1440  },
                      ].map(o => (
                        <button key={o.value} type="button"
                          onClick={() => setForm(p => ({ ...p, duration: String(o.value) }))}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            String(form.duration) === String(o.value) ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600'
                          }`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description (add form only) */}
                {!editTask && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Description</label>
                    <textarea
                      rows={3}
                      className="w-full text-sm text-gray-700 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent resize-none placeholder:text-gray-300 transition-colors"
                      placeholder="Add details about this task…"
                      value={form.description}
                      onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                )}

                {form.duration && !editTask && (
                  <p className="text-[11px] text-golden-700 bg-golden-50 px-3 py-2 rounded-xl">
                    {activeFocus ? `⚠ "${activeFocus.title}" is still active.` : `⏱ Timer starts on save.`}
                  </p>
                )}

                <button type="submit" disabled={submitting || (!editTask && !!activeFocus && !!form.duration)}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm mt-4">
                  {submitting ? 'Saving…' : editTask ? 'Save Changes' : form.duration ? '▶ Start Task' : 'Create Task'}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
