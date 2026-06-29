import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import Badge from '../../components/UI/Badge';
import EmptyState from '../../components/UI/EmptyState';
import { formatDate } from '../../utils/helpers';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const EMPTY_FORM = { title: '', description: '', assignedTo: '', priority: 'medium', deadline: '' };

const HRTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [kpiData, setKpiData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // task being edited
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tasks');
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterEmp, setFilterEmp] = useState('');

  const fetchAll = async () => {
    const [tasksRes, kpiRes, empRes] = await Promise.all([
      api.get(`/tasks${filterEmp ? `?employeeId=${filterEmp}` : ''}`).catch(() => ({ data: [] })),
      api.get('/tasks/kpi').catch(() => ({ data: [] })),
      api.get('/employees').catch(() => ({ data: [] })),
    ]);
    setTasks(tasksRes.data);
    setKpiData(kpiRes.data);
    setEmployees(empRes.data);
  };

  useEffect(() => { fetchAll(); }, [filterEmp]);

  const openCreate = () => {
    setEditingTask(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      assignedTo: task.assignedTo?._id || '',
      priority: task.priority,
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${id}`);
      setTasks(prev => prev.filter(t => t._id !== id));
      toast.success('Task deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingTask) {
        await api.put(`/tasks/${editingTask._id}`, form);
        toast.success('Task updated!');
      } else {
        await api.post('/tasks', form);
        toast.success('Task assigned!');
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditingTask(null);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 space-y-5 animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Work & KPI Management</h2></div>
        <button onClick={openCreate} className="btn-primary">+ Assign Task</button>
      </div>

      <div className="filter-bar">
        <button onClick={() => setActiveTab('tasks')}
          className={activeTab === 'tasks' ? 'filter-pill-active' : 'filter-pill-inactive'}>
          <SI d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={14} /> Task List
        </button>
        <button onClick={() => setActiveTab('kpi')}
          className={activeTab === 'kpi' ? 'filter-pill-active' : 'filter-pill-inactive'}>
          <SI d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={14} /> KPI Overview
        </button>
      </div>

      {activeTab === 'tasks' ? (
        <Card>
          <div className="flex flex-wrap gap-3 mb-4">
            <select className="input-field w-auto" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </div>
          {tasks.length === 0 ? (
            <EmptyState icon={<SI d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={40} color="text-violet-400" />} title="No tasks" message="Assign work to employees."
              action={{ label: 'Assign Task', onClick: openCreate }} />
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden space-y-3">
                {tasks.map(t => (
                  <div key={t._id} className="border border-violet-100 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-violet-900 text-sm truncate">{t.title}</p>
                        {t.description && <p className="text-xs text-violet-400 mt-0.5 line-clamp-1">{t.description}</p>}
                      </div>
                      <Badge status={t.status} />
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="text-gray-600">
                        <span className="text-violet-400">To: </span>
                        <strong>{t.assignedTo?.name}</strong>
                        {t.assignedTo?.employeeId && <span className="text-violet-400"> ({t.assignedTo.employeeId})</span>}
                      </span>
                      <span className="text-gray-500">Due: {formatDate(t.deadline)}</span>
                      <Badge status={t.priority} />
                    </div>
                    {t.remarks && <p className="text-xs text-gray-500 italic line-clamp-1">{t.remarks}</p>}
                    <div className="flex gap-2 pt-1 border-t border-violet-50">
                      <button onClick={() => openEdit(t)}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(t._id)}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-semibold transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
                <table className="data-table min-w-[700px]">
                  <thead>
                    <tr><th>Task</th><th>Assigned To</th><th>Priority</th><th>Deadline</th><th>Status</th><th>Remarks</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {tasks.map(t => (
                      <tr key={t._id}>
                        <td>
                          <p className="font-medium text-violet-900">{t.title}</p>
                          {t.description && <p className="text-xs text-violet-400 mt-0.5 truncate max-w-[200px]">{t.description}</p>}
                        </td>
                        <td>
                          <p className="font-medium">{t.assignedTo?.name}</p>
                          <p className="text-xs text-violet-400">{t.assignedTo?.employeeId}</p>
                        </td>
                        <td><Badge status={t.priority} /></td>
                        <td>{formatDate(t.deadline)}</td>
                        <td><Badge status={t.status} /></td>
                        <td>
                          {t.remarks
                            ? <p className="text-xs text-gray-600 max-w-[140px] truncate" title={t.remarks}>{t.remarks}</p>
                            : <span className="text-xs text-violet-300">—</span>}
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEdit(t)} title="Edit task"
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors">
                              <SI d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" size={12} />
                              Edit
                            </button>
                            <button onClick={() => handleDelete(t._id)} title="Delete task"
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                              <SI d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" size={12} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {kpiData.length === 0 ? (
            <EmptyState icon={<SI d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={40} color="text-violet-400" />} title="No KPI data" message="Assign tasks to employees to see KPI overview." />
          ) : (
            kpiData.map(item => (
              <div key={item.employee._id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-violet-900">{item.employee.name}</p>
                    <p className="text-xs text-violet-500">{item.employee.employeeId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl sm:text-2xl font-bold text-golden-600">{item.completionRate}%</p>
                    <p className="text-xs text-violet-500">completion rate</p>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-violet-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-600 to-golden-500 rounded-full transition-all duration-700"
                    style={{ width: `${item.completionRate}%` }} />
                </div>
                <div className="flex gap-4 mt-3 text-xs">
                  <span className="text-violet-500">Total: <strong className="text-violet-900">{item.total}</strong></span>
                  <span className="text-violet-600">Done: <strong>{item.completed}</strong></span>
                  <span className="text-golden-600">Active: <strong>{item.inProgress}</strong></span>
                  {item.overdue > 0 && <span className="text-gray-900">Overdue: <strong>{item.overdue}</strong></span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / Edit Task Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingTask(null); setForm(EMPTY_FORM); }}
        title={editingTask ? 'Edit Task' : 'Assign New Task'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">Task Title *</label>
            <input className="input-field" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" />
          </div>
          <div>
            <label className="input-label">Description</label>
            <textarea className="input-field" rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Task details..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="input-label">Assign To *</label>
              <select className="input-field" required value={form.assignedTo}
                onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                disabled={!!editingTask}>
                <option value="">Select employee</option>
                {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
              </select>
              {editingTask && <p className="text-xs text-violet-400 mt-1">Assigned employee cannot be changed</p>}
            </div>
            <div>
              <label className="input-label">Priority</label>
              <select className="input-field" value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Deadline *</label>
            <input type="date" className="input-field" required value={form.deadline}
              onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? (editingTask ? 'Saving...' : 'Assigning...') : (editingTask ? 'Save Changes' : 'Assign Task')}
            </button>
            <button type="button" className="btn-secondary flex-1"
              onClick={() => { setShowModal(false); setEditingTask(null); setForm(EMPTY_FORM); }}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default HRTasks;
