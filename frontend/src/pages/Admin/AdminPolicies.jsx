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

const AdminPolicies = () => {
  const [policies, setPolicies] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: 'Default Policy', year: new Date().getFullYear(), casualLeaves: 12, sickLeaves: 10, otherLeaves: 5 });

  const fetch = () => api.get('/admin/leave-policies').then(r => setPolicies(r.data)).catch(() => {});
  useEffect(() => { fetch(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editMode) {
        await api.put(`/admin/leave-policies/${selected._id}`, form);
        toast.success('Policy updated!');
      } else {
        await api.post('/admin/leave-policies', form);
        toast.success('Policy created!');
      }
      setShowModal(false); fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const openEdit = (p) => {
    setSelected(p); setEditMode(true);
    setForm({ name: p.name, year: p.year, casualLeaves: p.casualLeaves, sickLeaves: p.sickLeaves, otherLeaves: p.otherLeaves });
    setShowModal(true);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Leave Policies</h2><p className="page-subtitle">Configure annual leave allocations</p></div>
        <button onClick={() => { setEditMode(false); setForm({ name: 'Default Policy', year: new Date().getFullYear(), casualLeaves: 12, sickLeaves: 10, otherLeaves: 5 }); setShowModal(true); }} className="btn-primary">
          + Create Policy
        </button>
      </div>

      {policies.length === 0 ? (
        <EmptyState icon={<SI d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={40} color="text-violet-400" />} title="No leave policies" message="Create a leave policy to define employee leave entitlements."
          action={{ label: 'Create Policy', onClick: () => setShowModal(true) }} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {policies.map(p => (
            <motion.div key={p._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-violet-900">{p.name}</h3>
                  <span className="badge-purple mt-1">{p.year}</span>
                </div>
                <button onClick={() => openEdit(p)} className="btn-secondary btn-sm">Edit</button>
              </div>
              <div className="space-y-2 mt-3">
                {[
                  { label: 'Casual Leave', value: p.casualLeaves, color: 'bg-violet-100 text-violet-700' },
                  { label: 'Sick Leave', value: p.sickLeaves, color: 'bg-violet-100 text-violet-700' },
                  { label: 'Other Leave', value: p.otherLeaves, color: 'bg-golden-100 text-golden-700' },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className={`${item.color} px-2.5 py-0.5 rounded-lg text-sm font-bold`}>{item.value} days</span>
                  </div>
                ))}
                <div className="border-t border-violet-100 pt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-violet-900">Total</span>
                  <span className="text-sm font-bold text-golden-600">{p.casualLeaves + p.sickLeaves + p.otherLeaves} days</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editMode ? 'Edit Policy' : 'Create Leave Policy'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="input-label">Policy Name</label>
              <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="input-label">Year *</label>
              <input type="number" className="input-field" required value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="input-label">Casual Leaves</label>
              <input type="number" className="input-field" value={form.casualLeaves} min={0} onChange={e => setForm(f => ({ ...f, casualLeaves: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="input-label">Sick Leaves</label>
              <input type="number" className="input-field" value={form.sickLeaves} min={0} onChange={e => setForm(f => ({ ...f, sickLeaves: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="input-label">Other Leaves</label>
              <input type="number" className="input-field" value={form.otherLeaves} min={0} onChange={e => setForm(f => ({ ...f, otherLeaves: parseInt(e.target.value) }))} />
            </div>
          </div>
          <div className="bg-violet-50 rounded-xl p-3 text-sm text-center text-violet-700">
            Total: <strong className="text-golden-600">{parseInt(form.casualLeaves || 0) + parseInt(form.sickLeaves || 0) + parseInt(form.otherLeaves || 0)} days</strong> per year
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

export default AdminPolicies;
