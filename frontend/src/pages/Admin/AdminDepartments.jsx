import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import EmptyState from '../../components/UI/EmptyState';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const AdminDepartments = () => {
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', headOf: '' });

  const fetch = async () => {
    const [dRes, eRes] = await Promise.all([api.get('/admin/departments'), api.get('/employees')]).catch(() => [{ data: [] }, { data: [] }]);
    if (dRes.data) setDepartments(dRes.data);
    if (eRes.data) setEmployees(eRes.data);
  };

  useEffect(() => { fetch(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editMode) {
        await api.put(`/admin/departments/${selected._id}`, form);
        toast.success('Department updated!');
      } else {
        await api.post('/admin/departments', form);
        toast.success('Department created!');
      }
      setShowModal(false); setForm({ name: '', description: '', headOf: '' }); fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this department?')) return;
    try {
      await api.delete(`/admin/departments/${id}`);
      toast.success('Deleted!');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const openEdit = (dept) => {
    setSelected(dept); setEditMode(true);
    setForm({ name: dept.name, description: dept.description || '', headOf: dept.headOf?._id || '' });
    setShowModal(true);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Departments</h2><p className="page-subtitle">{departments.length} departments</p></div>
        <button onClick={() => { setEditMode(false); setForm({ name: '', description: '', headOf: '' }); setShowModal(true); }} className="btn-primary">
          + Create Department
        </button>
      </div>

      {departments.length === 0 ? (
        <EmptyState icon={<SI d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" size={40} color="text-violet-400" />} title="No departments" message="Create your first department."
          action={{ label: 'Create', onClick: () => setShowModal(true) }} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(dept => (
            <motion.div key={dept._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <SI d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" size={20} color="text-violet-600" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(dept)} className="btn-ghost btn-sm text-xs">Edit</button>
                  <button onClick={() => handleDelete(dept._id)} className="btn-ghost btn-sm text-xs text-gray-900 hover:text-gray-900 hover:bg-gray-100">Delete</button>
                </div>
              </div>
              <h3 className="font-bold text-violet-900 text-lg">{dept.name}</h3>
              {dept.description && <p className="text-sm text-violet-500 mt-1">{dept.description}</p>}
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-violet-500">Head: <span className="font-medium text-violet-900">{dept.headOf?.name || 'Not assigned'}</span></span>
                <span className="badge-purple">{dept.employeeCount || 0} employees</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editMode ? 'Edit Department' : 'Create Department'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">Department Name *</label>
            <input className="input-field" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Engineering" />
          </div>
          <div>
            <label className="input-label">Description</label>
            <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Department description" />
          </div>
          <div>
            <label className="input-label">Department Head</label>
            <select className="input-field" value={form.headOf} onChange={e => setForm(f => ({ ...f, headOf: e.target.value }))}>
              <option value="">Not assigned</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : editMode ? 'Update' : 'Create'}</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AdminDepartments;
