import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/helpers';

const CATEGORIES = [
  { key: 'travel', label: 'Travel' },
  { key: 'food', label: 'Food' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'client-meeting', label: 'Client Meeting' },
  { key: 'other', label: 'Other' },
];

const STATUS = {
  pending: { label: 'Pending', chip: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', chip: 'bg-rose-100 text-rose-600', dot: 'bg-rose-500' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const ExpenseClaimsPage = () => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ category: 'travel', amount: '', date: todayStr(), description: '' });
  const [receipt, setReceipt] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = () => api.get('/expense-claims/my')
    .then(r => setClaims(r.data || []))
    .catch(() => toast.error('Could not load claims'))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ category: 'travel', amount: '', date: todayStr(), description: '' });
    setReceipt(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount');
    if (!form.description.trim()) return toast.error('Add a short description');
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('category', form.category);
      fd.append('amount', form.amount);
      fd.append('date', form.date);
      fd.append('description', form.description.trim());
      if (receipt) fd.append('receipt', receipt);
      await api.post('/expense-claims', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Claim submitted to HR & Admin');
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  const withdraw = async (id) => {
    try {
      await api.delete(`/expense-claims/${id}`);
      setClaims(prev => prev.filter(c => c._id !== id));
      toast.success('Claim withdrawn');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const shown = claims.filter(c => filter === 'all' || c.status === filter);
  const totalApproved = claims.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0);
  const totalPending = claims.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Expense Claims</h2>
          <p className="text-sm text-gray-400 mt-0.5">Claim reimbursements — reviewed by HR &amp; Admin</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {showForm ? 'Close' : 'New Claim'}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Claims', value: claims.length, card: 'bg-violet-50/70 border-violet-200/70', text: 'text-violet-700' },
          { label: 'Pending', value: formatCurrency(totalPending), card: 'bg-amber-50/70 border-amber-200/70', text: 'text-amber-700' },
          { label: 'Approved', value: formatCurrency(totalApproved), card: 'bg-emerald-50/70 border-emerald-200/70', text: 'text-emerald-700' },
        ].map(s => (
          <div key={s.label} className={`border rounded-2xl px-4 py-3 ${s.card}`}>
            <p className={`text-lg font-extrabold leading-none tabular-nums ${s.text}`}>{s.value}</p>
            <p className="text-[11px] text-gray-500 font-semibold mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* New claim form */}
      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={submit} className="overflow-hidden">
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Amount (₹)</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Date incurred</label>
                  <input type="date" max={todayStr()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Receipt (jpg/png/pdf, optional)</label>
                  <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setReceipt(e.target.files?.[0] || null)}
                    className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-600 hover:file:bg-violet-100" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  placeholder="What was this expense for?"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                  className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                  {submitting ? 'Submitting…' : 'Submit Claim'}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {['all', 'pending', 'approved', 'rejected'].map(k => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter === k ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {k}
          </button>
        ))}
      </div>

      {/* Claims list */}
      {loading ? (
        <div className="py-16 text-center text-gray-300 text-sm">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center shadow-sm">
          <span className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </span>
          <p className="text-sm font-semibold text-gray-500">{filter === 'all' ? 'No claims yet' : `No ${filter} claims`}</p>
          <p className="text-[11px] text-gray-400 mt-1">Tap “New Claim” to submit your first reimbursement.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map(c => {
            const st = STATUS[c.status] || STATUS.pending;
            return (
              <div key={c._id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-sm capitalize">{c.category.replace('-', ' ')}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${st.chip}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 break-words">{c.description}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Incurred {formatDate(c.date)} · Submitted {formatDate(c.createdAt)}
                      {c.receiptFileName && (
                        <> · <a href={`/uploads/expenses/${c.receiptFileName}`} target="_blank" rel="noreferrer" className="text-violet-600 font-semibold hover:underline">Receipt</a></>
                      )}
                    </p>
                    {c.reviewNote && (
                      <p className="text-[11px] text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-2 py-1">
                        <span className="font-semibold">{c.reviewedBy?.name || 'Reviewer'}:</span> {c.reviewNote}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-extrabold text-gray-900 tabular-nums">{formatCurrency(c.amount)}</p>
                    {c.status === 'pending' && (
                      <button onClick={() => withdraw(c._id)} className="text-[11px] text-rose-500 font-semibold hover:underline mt-1">
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExpenseClaimsPage;
