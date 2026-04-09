import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import Badge from '../../components/UI/Badge';
import EmptyState from '../../components/UI/EmptyState';
import { formatDate } from '../../utils/helpers';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

/* ── Leave Approvals section ── */
const LeaveApprovals = () => {
  const [leaves, setLeaves] = useState([]);
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('pending');

  const fetchLeaves = async () => {
    try {
      const res = await api.get(`/leaves${filter ? `?status=${filter}` : ''}`);
      setLeaves(res.data);
    } catch {}
  };
  useEffect(() => { fetchLeaves(); }, [filter]);

  const handleAction = async (status) => {
    setLoading(true);
    try {
      await api.put(`/leaves/${selected._id}/status`, { status, comments });
      toast.success(`Leave ${status} successfully!`);
      setSelected(null);
      setComments('');
      fetchLeaves();
    } catch (err) { toast.error(err.response?.data?.message || 'Action failed'); }
    finally { setLoading(false); }
  };

  const leaveTypeLabel = (type) => {
    const map = { casual: 'Casual', sick: 'Sick', other: 'Other', lop: 'Loss of Pay' };
    return map[type] || type;
  };
  const sessionLabel = (s) => s === 'afternoon' ? 'Afternoon' : 'Morning';

  return (
    <Card>
      <div className="filter-bar mb-5">
        {['pending', 'approved', 'rejected', ''].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={filter === s ? 'filter-pill-active' : 'filter-pill-inactive'}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {leaves.length === 0 ? (
        <EmptyState icon={<SI d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={40} color="text-violet-400" />} title="No leave requests" message={`No ${filter || ''} leave requests found.`} />
      ) : (
        <div className="space-y-3">
          {leaves.map(leave => (
            <div key={leave._id} className="p-4 border border-violet-100 rounded-xl hover:border-violet-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-violet-900">{leave.employee?.name}</p>
                    <span className="text-xs text-violet-400">{leave.employee?.employeeId}</span>
                    <Badge status={leave.status} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-violet-700">{leaveTypeLabel(leave.type)} Leave · {leave.totalDays} day(s)</p>
                    {leave.halfDay && (
                      <span className="badge badge-yellow">½ Day · {sessionLabel(leave.session)}</span>
                    )}
                  </div>
                  <p className="text-sm text-violet-500">{formatDate(leave.fromDate)} → {formatDate(leave.toDate)}</p>
                  <p className="text-sm text-gray-600 mt-1">Reason: {leave.reason}</p>
                  {leave.approverComments && (
                    <p className="text-xs text-violet-400 mt-1 italic">HR Note: {leave.approverComments}</p>
                  )}
                  {leave.approvedBy && (
                    <p className="text-xs text-violet-400 mt-1">Reviewed by: {leave.approvedBy?.name} on {formatDate(leave.approvalDate)}</p>
                  )}
                </div>
                <button
                  onClick={() => { setSelected(leave); setComments(leave.approverComments || ''); }}
                  className={`btn-sm flex-shrink-0 ${leave.status === 'pending' ? 'btn-primary' : 'btn-secondary'}`}>
                  {leave.status === 'pending' ? 'Review' : 'Edit'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.status === 'pending' ? 'Review Leave Request' : 'Edit Leave Decision'}>
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Employee', value: selected.employee?.name },
                { label: 'Type', value: leaveTypeLabel(selected.type) + ' Leave' },
                { label: 'From', value: formatDate(selected.fromDate) },
                { label: 'To', value: formatDate(selected.toDate) },
                { label: 'Total Days', value: `${selected.totalDays} day(s)` },
                ...(selected.halfDay ? [{ label: 'Session', value: sessionLabel(selected.session) }] : []),
              ].map(item => (
                <div key={item.label} className="p-3 bg-violet-50 rounded-xl">
                  <p className="text-xs text-violet-500">{item.label}</p>
                  <p className="text-sm font-semibold text-violet-900 capitalize mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-violet-500 mb-1">Reason</p>
              <p className="text-sm text-gray-700">{selected.reason}</p>
            </div>
            <div>
              <label className="input-label">Comments (Optional)</label>
              <textarea className="input-field" rows={2} value={comments}
                onChange={e => setComments(e.target.value)} placeholder="Add a note for the employee..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleAction('approved')} disabled={loading} className="btn-primary flex-1 bg-violet-600 hover:bg-violet-700">
                <span className="flex items-center justify-center gap-1.5"><SI d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={15} color="text-white" /> Approve</span>
              </button>
              <button onClick={() => handleAction('rejected')} disabled={loading} className="btn-danger flex-1">
                <span className="flex items-center justify-center gap-1.5"><SI d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" size={15} color="text-white" /> Reject</span>
              </button>
              <button onClick={() => setSelected(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};

/* ── Leave Balance section ── */
const LeaveBalance = () => {
  const [employees, setEmployees] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const year = new Date().getFullYear();

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const empRes = await api.get('/employees');
        const emps = empRes.data?.employees || empRes.data || [];
        setEmployees(emps);
        const results = await Promise.all(
          emps.map(e => api.get(`/leaves/balance/${e._id}?year=${year}`).then(r => ({ id: e._id, data: r.data })).catch(() => ({ id: e._id, data: null })))
        );
        const map = {};
        results.forEach(({ id, data }) => { map[id] = data; });
        setBalances(map);
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, []);

  const filtered = employees.filter(e =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" /></div>;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-violet-500">Leave balance for all employees — {year}</p>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employee..."
          className="input-field w-48 text-sm py-1.5"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<SI d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" size={40} color="text-violet-400" />} title="No employees found" message="" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-violet-100">
                <th className="text-left py-2 px-3 text-xs font-semibold text-violet-500 uppercase tracking-wide">Employee</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-violet-500 uppercase tracking-wide">Casual</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-violet-500 uppercase tracking-wide">Sick</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-violet-500 uppercase tracking-wide">Other</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-violet-500 uppercase tracking-wide">LOP</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-violet-500 uppercase tracking-wide">Total Used</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const b = balances[emp._id];
                const totalUsed = b ? (b.casual.used + b.sick.used + b.other.used + b.lop.used) : 0;
                return (
                  <tr key={emp._id} className="border-b border-gray-50 hover:bg-violet-50/40 transition-colors">
                    <td className="py-3 px-3">
                      <p className="font-medium text-violet-900">{emp.name}</p>
                      <p className="text-xs text-violet-400">{emp.employeeId} · {emp.department?.name || '—'}</p>
                    </td>
                    {b ? (
                      <>
                        <td className="py-3 px-3 text-center">
                          <span className="font-semibold text-violet-700">{b.casual.remaining}</span>
                          <span className="text-gray-400 text-xs"> / {b.casual.total}</span>
                          <div className="text-[10px] text-gray-400 mt-0.5">{b.casual.used} used</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-semibold text-blue-600">{b.sick.remaining}</span>
                          <span className="text-gray-400 text-xs"> / {b.sick.total}</span>
                          <div className="text-[10px] text-gray-400 mt-0.5">{b.sick.used} used</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-semibold text-amber-600">{b.other.remaining}</span>
                          <span className="text-gray-400 text-xs"> / {b.other.total}</span>
                          <div className="text-[10px] text-gray-400 mt-0.5">{b.other.used} used</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-semibold text-red-500">{b.lop.used}</span>
                          <div className="text-[10px] text-gray-400 mt-0.5">days</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${totalUsed > 0 ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}>{totalUsed} days</span>
                        </td>
                      </>
                    ) : (
                      <td colSpan={5} className="py-3 px-3 text-center text-xs text-gray-400">No policy set for {year}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

/* ── Leave Policies section ── */
const LeavePolicies = () => {
  const [policies, setPolicies] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: 'Default Policy', year: new Date().getFullYear(), casualLeaves: 12, sickLeaves: 10, otherLeaves: 5 });

  const fetchPolicies = () => api.get('/admin/leave-policies').then(r => setPolicies(r.data)).catch(() => {});
  useEffect(() => { fetchPolicies(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editMode) {
        await api.put(`/admin/leave-policies/${selected._id}`, form);
        toast.success('Policy updated!');
      } else {
        await api.post('/admin/leave-policies', form);
        toast.success('Policy created!');
      }
      setShowModal(false);
      fetchPolicies();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const openEdit = (p) => {
    setSelected(p); setEditMode(true);
    setForm({ name: p.name, year: p.year, casualLeaves: p.casualLeaves, sickLeaves: p.sickLeaves, otherLeaves: p.otherLeaves });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditMode(false);
    setForm({ name: 'Default Policy', year: new Date().getFullYear(), casualLeaves: 12, sickLeaves: 10, otherLeaves: 5 });
    setShowModal(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-violet-500">Configure annual leave day allocations for all employees.</p>
        <button onClick={openCreate} className="btn-primary btn-sm">+ Create Policy</button>
      </div>

      {policies.length === 0 ? (
        <EmptyState
          icon={<SI d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={40} color="text-violet-400" />}
          title="No leave policies"
          message="Create a leave policy to define employee leave entitlements."
          action={{ label: 'Create Policy', onClick: openCreate }}
        />
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
                  { label: 'Sick Leave',   value: p.sickLeaves,   color: 'bg-violet-100 text-violet-700' },
                  { label: 'Other Leave',  value: p.otherLeaves,  color: 'bg-amber-100 text-amber-700' },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className={`${item.color} px-2.5 py-0.5 rounded-lg text-sm font-bold`}>{item.value} days</span>
                  </div>
                ))}
                <div className="border-t border-violet-100 pt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-violet-900">Total</span>
                  <span className="text-sm font-bold text-amber-600">{p.casualLeaves + p.sickLeaves + p.otherLeaves} days</span>
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
            Total: <strong className="text-amber-600">{parseInt(form.casualLeaves || 0) + parseInt(form.sickLeaves || 0) + parseInt(form.otherLeaves || 0)} days</strong> per year
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving...' : editMode ? 'Update' : 'Create'}</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

/* ── Main HRLeaves page with tabs ── */
const HRLeaves = () => {
  const [tab, setTab] = useState('approvals');

  const tabs = [
    { key: 'approvals', label: 'Leave Approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'balance',   label: 'Leave Balance',   icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'policies',  label: 'Leave Policies',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Leave Management</h2>
          <p className="page-subtitle">Approve requests and configure leave policies</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-violet-50 border border-violet-100 rounded-2xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'bg-white text-violet-800 shadow-sm border border-violet-100'
                : 'text-violet-500 hover:text-violet-700'
            }`}>
            <SI d={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'approvals' && <LeaveApprovals />}
      {tab === 'balance'   && <LeaveBalance />}
      {tab === 'policies'  && <LeavePolicies />}
    </div>
  );
};

export default HRLeaves;
