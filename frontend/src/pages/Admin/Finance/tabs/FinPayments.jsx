import { useState, useEffect } from 'react';
import { CreditCard, IndianRupee, Clock, CheckCircle2, Plus, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const statusStyle = {
  Paid:    { color: '#16a34a', bg: '#dcfce7' },
  Partial: { color: '#7c3aed', bg: '#ede9fe' },
  Pending: { color: '#d97706', bg: '#fef3c7' },
};

function PaymentModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ client: '', amount: '', paid: '', mode: 'Bank Transfer', date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!form.client || !form.amount) { setErr('Client and amount are required'); return; }
    setSaving(true);
    try {
      await api.post('/finance/payments', form);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to record payment');
    } finally { setSaving(false); }
  };

  const inp = { width: '100%', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: 'var(--fin-fg)', fontSize: '0.875rem', outline: 'none' };
  const lbl = { fontSize: '11px', fontWeight: 600, color: 'var(--fin-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="fin-card w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Record Payment</h3>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: 'var(--fin-muted)' }} /></button>
        </div>
        <div className="space-y-4">
          {[['Client', 'client', 'text'], ['Total Amount (₹)', 'amount', 'number'], ['Amount Paid (₹)', 'paid', 'number']].map(([label, key, type]) => (
            <div key={key}><label style={lbl}>{label}</label><input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inp} /></div>
          ))}
          <div>
            <label style={lbl}>Payment Mode</label>
            <select value={form.mode} onChange={e => setForm(p => ({ ...p, mode: e.target.value }))} style={inp}>
              {['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Card', 'Debit Card'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Date</label><input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} /></div>
          {err && <p className="text-xs" style={{ color: '#f87171' }}>{err}</p>}
          <div className="flex gap-2 pt-2">
            <button className="fin-btn fin-btn-outline flex-1" onClick={onClose}>Cancel</button>
            <button className="fin-btn fin-btn-primary flex-1" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function FinPayments() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = filter !== 'All' ? { status: filter } : {};
      const { data } = await api.get('/finance/payments', { params });
      setPayments(data.payments || []);
      const st = {};
      (data.stats || []).forEach(s => { st[s._id] = s; });
      setStats(st);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const totalReceived = Object.values(stats).reduce((s, v) => s + (v.total || 0), 0);
  const pending = stats['Pending']?.total || 0;
  const partial = stats['Partial']?.count || 0;
  const fullyPaid = stats['Paid']?.count || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Received"   value={fmt(totalReceived)} icon={IndianRupee}  accentColor="revenue" />
        <FinKPICard title="Pending"          value={fmt(pending)}       icon={Clock}        accentColor="warning" />
        <FinKPICard title="Partial Payments" value={String(partial)}    icon={CreditCard}   accentColor="info"    />
        <FinKPICard title="Fully Paid"       value={String(fullyPaid)}  icon={CheckCircle2} accentColor="profit"  />
      </div>

      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Payment Register</h3>
            <div className="flex items-center gap-1 ml-4">
              {['All', 'Paid', 'Partial', 'Pending'].map((s) => (
                <button key={s} onClick={() => setFilter(s)}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={{ background: filter === s ? '#ede9fe' : 'transparent', color: filter === s ? '#7c3aed' : '#6b7280' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button className="fin-btn fin-btn-primary" onClick={() => setShowModal(true)}><Plus className="h-3.5 w-3.5" />Record Payment</button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : payments.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No payments found</div>
          ) : (
            <table className="fin-table">
              <thead><tr>
                <th>Payment ID</th><th>Invoice</th><th>Client</th><th>Amount</th><th>Paid</th><th>Mode</th><th>Date</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {payments.map((p, i) => (
                  <motion.tr key={p._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <td className="font-mono text-xs">{p.paymentNumber}</td>
                    <td className="font-mono text-xs" style={{ color: '#7c3aed' }}>{p.invoiceId?.invoiceNumber || '—'}</td>
                    <td>{p.client}</td>
                    <td className="font-semibold">{fmt(p.amount)}</td>
                    <td className="font-semibold">{fmt(p.paid)}</td>
                    <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{p.mode || '—'}</td>
                    <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{fmtDate(p.date)}</td>
                    <td>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: statusStyle[p.status]?.color, background: statusStyle[p.status]?.bg }}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => {
                        if (window.confirm('Delete this payment?')) {
                          api.delete(`/finance/payments/${p._id}`).then(load).catch(() => alert('Delete failed'));
                        }
                      }} className="p-1 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showModal && <PaymentModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}
