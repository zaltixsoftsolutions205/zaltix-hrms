import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Clock, Plus, Check, Trash2, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_STYLE = {
  Filed:    { color: '#16a34a', bg: '#dcfce7' },
  Pending:  { color: '#d97706', bg: '#fef3c7' },
  Upcoming: { color: '#7c3aed', bg: '#ede9fe' },
  Overdue:  { color: '#dc2626', bg: '#fee2e2' },
};

const FILING_TYPES = ['GST', 'TDS', 'Income Tax', 'PF', 'ESI', 'Other'];
const STATUSES     = ['Pending', 'Filed', 'Upcoming', 'Overdue'];

const EMPTY_FORM = {
  name: '', description: '', filingType: 'GST', period: '',
  dueDate: '', amount: '', notes: '', status: 'Pending',
};

export function FinCompliance() {
  const [data, setData]       = useState({ filings: [], overdue: 0, pending: 0, filed: 0, upcoming: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const fetchData = () => {
    setLoading(true);
    api.get('/finance/compliance')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (f) => {
    setEditing(f._id);
    setForm({
      name: f.name, description: f.description, filingType: f.filingType,
      period: f.period, dueDate: f.dueDate ? f.dueDate.slice(0, 10) : '',
      amount: f.amount ?? '', notes: f.notes || '', status: f.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.period || !form.dueDate) return;
    setSaving(true);
    try {
      const payload = { ...form, amount: form.amount !== '' ? Number(form.amount) : null };
      if (editing) {
        await api.put(`/finance/compliance/${editing}`, payload);
      } else {
        await api.post('/finance/compliance', payload);
      }
      setShowModal(false);
      fetchData();
    } catch (e) {
      alert(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkFiled = async (id) => {
    try {
      await api.put(`/finance/compliance/${id}/mark-filed`);
      fetchData();
    } catch (e) {
      alert('Failed to mark as filed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this filing?')) return;
    try {
      await api.delete(`/finance/compliance/${id}`);
      fetchData();
    } catch (e) {
      alert('Delete failed');
    }
  };

  const { filings = [], overdue, pending, filed, upcoming, total } = data;
  const score = total > 0 ? Math.round((filed / total) * 100) : 0;

  const filterOptions = ['All', 'Pending', 'Overdue', 'Filed', 'Upcoming'];
  const displayed = filter === 'All' ? filings : filings.filter(f => f.status === filter);

  const riskAlerts = filings.filter(f => f.status === 'Overdue' || f.status === 'Pending');

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Compliance Score"  value={`${score}%`}        icon={Shield}        accentColor="profit"  />
        <FinKPICard title="Filed on Time"     value={`${filed}/${total}`} icon={CheckCircle2}  accentColor="revenue" />
        <FinKPICard title="Pending / Overdue" value={`${pending} / ${overdue}`} icon={Clock}  accentColor="warning" />
        <FinKPICard title="Upcoming"          value={String(upcoming)}    icon={AlertTriangle} accentColor="expense" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Filing Register */}
        <div className="lg:col-span-2 fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Filing Register</h3>
            <div className="flex items-center gap-2">
              {/* Filter tabs */}
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                {filterOptions.map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${filter === f ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <button onClick={openAdd} className="fin-btn fin-btn-primary flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" />Add
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : displayed.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No filings found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="fin-table">
                <thead><tr>
                  <th>Filing</th><th>Period</th><th>Due Date</th><th>Amount</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {displayed.map((f, i) => (
                    <motion.tr key={f._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                      <td>
                        <p className="font-semibold text-xs" style={{ color: 'var(--fin-fg)' }}>{f.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--fin-muted)' }}>{f.description}</p>
                      </td>
                      <td className="text-xs">{f.period}</td>
                      <td className="text-xs" style={{ color: f.status === 'Overdue' ? '#dc2626' : 'var(--fin-muted)' }}>
                        {fmtDate(f.dueDate)}
                        {f.filedDate && <div className="text-[10px] text-green-600">Filed: {fmtDate(f.filedDate)}</div>}
                      </td>
                      <td className="text-xs font-semibold">
                        {f.amount != null ? `₹${Number(f.amount).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ color: STATUS_STYLE[f.status]?.color, background: STATUS_STYLE[f.status]?.bg }}>
                          {f.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {f.status !== 'Filed' && (
                            <button onClick={() => handleMarkFiled(f._id)} title="Mark as Filed"
                              className="p-1 rounded-md hover:bg-green-50 text-green-600 transition-colors">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => openEdit(f)} title="Edit"
                            className="p-1 rounded-md hover:bg-violet-50 text-violet-600 transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(f._id)} title="Delete"
                            className="p-1 rounded-md hover:bg-red-50 text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Risk Alerts */}
          <div className="fin-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fin-fg)' }}>Risk Alerts</h3>
            {riskAlerts.length === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <p className="text-xs text-green-600 font-medium">All filings are up to date!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {riskAlerts.map((f, i) => (
                  <motion.div key={f._id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                    className="rounded-lg p-3"
                    style={{ background: f.status === 'Overdue' ? '#fee2e2' : '#fef3c7', borderLeft: `3px solid ${f.status === 'Overdue' ? '#dc2626' : '#f59e0b'}` }}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: f.status === 'Overdue' ? '#dc2626' : '#d97706' }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--fin-fg)' }}>{f.name} — {f.status}</p>
                        <p className="text-[11px]" style={{ color: 'var(--fin-muted)' }}>{f.period} · Due {fmtDate(f.dueDate)}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="fin-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fin-fg)' }}>Summary</h3>
            <div className="space-y-2">
              {[
                ['Total Filings', total, '#111827'],
                ['Filed', filed, '#16a34a'],
                ['Pending', pending, '#d97706'],
                ['Overdue', overdue, '#dc2626'],
                ['Upcoming', upcoming, '#7c3aed'],
              ].map(([label, value, color], i, arr) => (
                <div key={label} className="flex items-center justify-between text-xs py-1.5"
                  style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--fin-border)' : 'none' }}>
                  <span style={{ color: 'var(--fin-muted)' }}>{label}</span>
                  <span className="font-bold" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
            {/* Score bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: 'var(--fin-muted)' }}>Compliance Score</span>
                <span className="font-bold" style={{ color: score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626' }}>{score}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#ede9fe' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">{editing ? 'Edit Filing' : 'Add Compliance Filing'}</h3>
                <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Filing Name *</label>
                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      className="fin-input w-full" placeholder="e.g. GSTR-1" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Filing Type</label>
                    <select value={form.filingType} onChange={e => setForm(p => ({ ...p, filingType: e.target.value }))} className="fin-input w-full">
                      {FILING_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="fin-input w-full">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Period *</label>
                    <input value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                      className="fin-input w-full" placeholder="e.g. Jun 2026" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Due Date *</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="fin-input w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹)</label>
                    <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                      className="fin-input w-full" placeholder="Optional" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                    <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                      className="fin-input w-full" placeholder="Brief description" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                    <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      className="fin-input w-full resize-none" rows={2} placeholder="Any additional notes" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button onClick={() => setShowModal(false)} className="fin-btn fin-btn-outline">Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.name || !form.period || !form.dueDate}
                  className="fin-btn fin-btn-primary disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Update' : 'Add Filing'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
