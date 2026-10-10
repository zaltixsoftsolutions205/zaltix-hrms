import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Modal from '../../components/UI/Modal';
import { useAuth } from '../../contexts/AuthContext';

const WORK_CATEGORIES = ['Development', 'Testing', 'Meeting', 'Client Work', 'Support', 'Documentation', 'Research', 'Training', 'Administrative', 'Other'];
const STATUSES = ['Not Started', 'In Progress', 'Completed', 'Blocked'];

const emptyEntry = () => ({
  project: '', task: '', description: '', workCategory: 'Development', priority: 'medium',
  startTime: '', endTime: '', dueDate: '',
  completionPercentage: '', status: 'Not Started', blocker: '', remarks: '',
});

// "+ Add Task" entry form — also used for editing an existing entry.
// Handles its own project list + inline "+ Add new project" quick-add for
// Admin/HR/department heads.
const TaskEntryModal = ({ isOpen, onClose, date, editing, defaultStart = '', onSaved }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(emptyEntry());
  const [loading, setLoading] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  // Live estimate: the system reads the title/description as they're typed.
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);

  const isDeptHead = user?.department?.headOf && String(user.department.headOf) === String(user?._id || user?.id);
  const canCreateProject = ['admin', 'hr'].includes(user?.role) || isDeptHead;

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch {}
  };

  useEffect(() => {
    if (isOpen) fetchProjects();
  }, [isOpen]);

  useEffect(() => {
    if (editing) {
      setForm({
        ...emptyEntry(),
        ...editing,
        project: editing.project?._id || editing.project || '',
        completionPercentage: editing.completionPercentage != null ? String(editing.completionPercentage) : '',
        dueDate: editing.dueDate ? editing.dueDate.slice(0, 10) : '',
      });
    } else {
      setForm({ ...emptyEntry(), startTime: defaultStart });
    }
    setShowNewProject(false);
    setNewProjectName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, isOpen]);

  // Debounced: wait for a short pause in typing, ignore answers that arrive out of order.
  useEffect(() => {
    if (!isOpen) return undefined;
    if (form.task.trim().length < 3 && form.description.trim().length < 12) {
      setEstimate(null);
      return undefined;
    }
    let cancelled = false;
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/timesheets/estimate', {
          task: form.task, description: form.description, workCategory: form.workCategory, entryId: editing?._id,
        });
        if (!cancelled) setEstimate(res.data?.hours != null ? res.data : null);
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isOpen, form.task, form.description, form.workCategory, editing?._id]);

  const update = (field, value) => {
    if (field === 'project' && value === '__new__') {
      setShowNewProject(true);
      return;
    }
    setForm(f => ({ ...f, [field]: value }));
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await api.post('/projects', { name: newProjectName.trim() });
      setProjects(ps => [...ps, res.data]);
      update('project', res.data._id);
      setShowNewProject(false);
      setNewProjectName('');
      toast.success('Project added');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add project');
    }
  };

  // Actual hours = end time − start time (shown live; the server recomputes it).
  const actualHours = (() => {
    if (!form.startTime || !form.endTime) return null;
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : null;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.task.trim()) return toast.error('Task title is required.');
    if (actualHours == null) return toast.error('Enter a start time and an end time later than the start.');

    const payload = {
      project: form.project || null,
      task: form.task.trim(),
      description: form.description.trim(),
      workCategory: form.workCategory,
      priority: form.priority,
      startTime: form.startTime,
      endTime: form.endTime,
      dueDate: form.dueDate || null,
      completionPercentage: form.completionPercentage !== '' ? parseFloat(form.completionPercentage) : null,
      status: form.status,
      blocker: form.status === 'Blocked' ? form.blocker.trim() : '',
      remarks: form.remarks.trim(),
    };

    setLoading(true);
    try {
      let res;
      if (editing?._id && editing?.timesheetId) {
        res = await api.put(`/timesheets/${editing.timesheetId}/entry/${editing._id}`, payload);
      } else {
        res = await api.post('/timesheets/entry', { date, entry: payload });
      }
      // The saved timesheet comes back whole; pick this task's system feedback.
      const saved = editing?._id
        ? res.data?.entries?.find(en => String(en._id) === String(editing._id))
        : res.data?.entries?.[res.data.entries.length - 1];
      const insight = saved?.insight;
      toast.success('Task saved');
      if (insight?.message) {
        toast(insight.message, { icon: insight.verdict === 'over' ? '⚠️' : '👏', duration: 7000 });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Task' : '+ Add Task'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="input-label">Project</label>
            {!showNewProject ? (
              <select className="input-field" value={form.project} onChange={e => update('project', e.target.value)}>
                <option value="">No project</option>
                {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                {canCreateProject && <option value="__new__">+ Add new project…</option>}
              </select>
            ) : (
              <div className="flex gap-2">
                <input className="input-field flex-1" placeholder="New project name" value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)} />
                <button type="button" className="btn-secondary btn-sm" onClick={createProject}>Add</button>
                <button type="button" className="text-xs text-violet-400" onClick={() => setShowNewProject(false)}>Cancel</button>
              </div>
            )}
          </div>
          <div>
            <label className="input-label">Work Category</label>
            <select className="input-field" value={form.workCategory} onChange={e => update('workCategory', e.target.value)}>
              {WORK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="input-label">Task Title *</label>
          <input className="input-field" required value={form.task} onChange={e => update('task', e.target.value)} />
        </div>
        <div>
          <label className="input-label">Description</label>
          <textarea className="input-field" rows={2} value={form.description} onChange={e => update('description', e.target.value)} />
        </div>

        {(estimate || estimating) && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">⏱</span>
              <p className="text-xs font-semibold text-violet-900">Estimated time</p>
              {estimating && !estimate && <span className="text-xs text-violet-500">analysing…</span>}
              {estimate && (
                <span className={`ml-auto rounded-lg bg-white px-2 py-0.5 text-sm font-extrabold text-violet-700 ring-1 ring-violet-200 ${estimating ? 'opacity-50' : ''}`}>
                  {estimate.hours}h
                </span>
              )}
            </div>
            {estimate?.explanation && (
              <p className="mt-1 text-[11px] leading-snug text-violet-700">{estimate.explanation}</p>
            )}
            <p className="mt-1 text-[10px] text-violet-400">
              The system decides this from what you write. Your actual time comes from your start and end time.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="input-label">Priority</label>
            <select className="input-field" value={form.priority} onChange={e => update('priority', e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="input-label">Start Time *</label>
            <input type="time" required className="input-field" value={form.startTime} onChange={e => update('startTime', e.target.value)} />
          </div>
          <div>
            <label className="input-label">End Time *</label>
            <input type="time" required className="input-field" value={form.endTime} onChange={e => update('endTime', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Actual Hours</label>
            <div className="input-field bg-violet-50 font-semibold text-violet-800">
              {actualHours != null ? `${actualHours}h` : '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="input-label">Due Date</label>
            <input type="date" className="input-field" value={form.dueDate} onChange={e => update('dueDate', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Completion %</label>
            <input type="number" min="0" max="100" className="input-field" value={form.completionPercentage}
              onChange={e => update('completionPercentage', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Status</label>
            <select className="input-field" value={form.status} onChange={e => update('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {form.status === 'Blocked' && (
          <div>
            <label className="input-label">Blocker Reason</label>
            <input className="input-field" placeholder="What's blocking this task?" value={form.blocker}
              onChange={e => update('blocker', e.target.value)} />
          </div>
        )}

        <div>
          <label className="input-label">Remarks</label>
          <textarea className="input-field" rows={2} value={form.remarks} onChange={e => update('remarks', e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? 'Saving...' : 'Save Task'}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

export default TaskEntryModal;
