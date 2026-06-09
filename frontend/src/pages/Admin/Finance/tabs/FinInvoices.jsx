import { useState, useEffect } from 'react';
import { FileText, CheckCircle, Clock, AlertTriangle, Plus, Download, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const statusLabel = { paid: 'Paid', pending: 'Pending', overdue: 'Overdue' };

function InvoiceModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    client: '', amount: '', gstRate: '18', date: '', dueDate: '', description: '',
    companyAddress: 'Plot No 69, Greenhills colony, Road no 3,\nKothapet, Hyderabad - 500035',
    companyGST: '36AACCZ6027D1ZF',
    companyPhone: '+91 99666 53131',
    companyEmail: 'info@zaltixsoftsolutions.com',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!form.client || !form.amount || !form.date || !form.dueDate) { setErr('Client, amount, date and due date are required'); return; }
    setSaving(true);
    try {
      await api.post('/finance/invoices', form);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to create invoice');
    } finally { setSaving(false); }
  };

  const inp = { width: '100%', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: 'var(--fin-fg)', fontSize: '0.875rem', outline: 'none' };
  const lbl = { fontSize: '11px', fontWeight: 600, color: 'var(--fin-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="fin-card w-full max-w-lg" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>New Invoice</h3>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: 'var(--fin-muted)' }} /></button>
        </div>
        <div className="space-y-4">
          {/* Client + amount + GST */}
          {[['Client Name', 'client', 'text'], ['Amount (₹)', 'amount', 'number'], ['GST Rate (%)', 'gstRate', 'number']].map(([label, key, type]) => (
            <div key={key}><label style={lbl}>{label}</label><input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inp} /></div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lbl}>Invoice Date</label><input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} /></div>
            <div><label style={lbl}>Due Date</label><input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} style={inp} /></div>
          </div>
          <div><label style={lbl}>Description</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} /></div>
          {/* Company details */}
          <p style={{ ...lbl, color: '#7c3aed', borderTop: '1px solid var(--fin-border)', paddingTop: 12, marginTop: 4 }}>Company Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lbl}>GST Number</label><input value={form.companyGST} onChange={e => setForm(p => ({ ...p, companyGST: e.target.value }))} style={inp} /></div>
            <div><label style={lbl}>Phone</label><input value={form.companyPhone} onChange={e => setForm(p => ({ ...p, companyPhone: e.target.value }))} style={inp} /></div>
          </div>
          <div><label style={lbl}>Email</label><input value={form.companyEmail} onChange={e => setForm(p => ({ ...p, companyEmail: e.target.value }))} style={inp} /></div>
          <div><label style={lbl}>Address</label><textarea rows={2} value={form.companyAddress} onChange={e => setForm(p => ({ ...p, companyAddress: e.target.value }))} style={{ ...inp, resize: 'none' }} /></div>
          {err && <p className="text-xs" style={{ color: '#f87171' }}>{err}</p>}
          <div className="flex gap-2 pt-2">
            <button className="fin-btn fin-btn-outline flex-1" onClick={onClose}>Cancel</button>
            <button className="fin-btn fin-btn-primary flex-1" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create Invoice'}</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function FinInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const { data } = await api.get('/finance/invoices', { params });
      setInvoices(data.invoices || []);
      const st = {};
      (data.stats || []).forEach(s => { st[s._id] = s; });
      setStats(st);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const paid     = st => (st.paid?.total || 0);
  const pending  = st => (st.pending?.total || 0);
  const overdue  = st => (st.overdue?.total || 0);
  const total    = st => paid(st) + pending(st) + overdue(st);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Invoiced" value={fmt(total(stats))}   icon={FileText}      accentColor="revenue" />
        <FinKPICard title="Paid"           value={fmt(paid(stats))}     icon={CheckCircle}   accentColor="revenue" />
        <FinKPICard title="Pending"        value={fmt(pending(stats))}  icon={Clock}         accentColor="warning" />
        <FinKPICard title="Overdue"        value={fmt(overdue(stats))}  icon={AlertTriangle} accentColor="expense" />
      </div>

      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>All Invoices</h3>
            <div className="flex items-center gap-1 ml-4">
              {[['', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['overdue', 'Overdue']].map(([val, label]) => (
                <button key={val} onClick={() => setStatusFilter(val)}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={{ background: statusFilter === val ? '#ede9fe' : 'transparent', color: statusFilter === val ? '#7c3aed' : '#6b7280' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button className="fin-btn fin-btn-primary" onClick={() => setShowModal(true)}><Plus className="h-3.5 w-3.5" />New Invoice</button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : invoices.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No invoices found</div>
          ) : (
            <table className="fin-table">
              <thead><tr>
                <th>Invoice #</th><th>Client</th><th>Amount</th><th>GST</th><th>Date</th><th>Due Date</th><th>Status</th>
              </tr></thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <motion.tr key={inv._id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                    <td className="font-mono text-xs font-semibold">{inv.invoiceNumber}</td>
                    <td>{inv.client}</td>
                    <td className="font-semibold">{fmt(inv.amount)}</td>
                    <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{fmt(inv.gst)}</td>
                    <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{fmtDate(inv.date)}</td>
                    <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{fmtDate(inv.dueDate)}</td>
                    <td>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold fin-status-${inv.status}`}>
                        {statusLabel[inv.status] || inv.status}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showModal && <InvoiceModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}
