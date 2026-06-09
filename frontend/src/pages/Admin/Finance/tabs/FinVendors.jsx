import { useState, useEffect } from 'react';
import { Users, IndianRupee, AlertTriangle, CheckCircle2, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function VendorModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', contact: '', phone: '', gstin: '', category: 'General', totalPayable: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!form.name) { setErr('Vendor name is required'); return; }
    setSaving(true);
    try {
      await api.post('/finance/vendors', form);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to add vendor');
    } finally { setSaving(false); }
  };

  const inp = { width: '100%', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: 'var(--fin-fg)', fontSize: '0.875rem', outline: 'none' };
  const lbl = { fontSize: '11px', fontWeight: 600, color: 'var(--fin-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="fin-card w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Add Vendor</h3>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: 'var(--fin-muted)' }} /></button>
        </div>
        <div className="space-y-4">
          {[['Vendor Name', 'name', 'text'], ['Contact Email', 'contact', 'email'], ['Phone', 'phone', 'text'], ['GSTIN', 'gstin', 'text'], ['Category', 'category', 'text'], ['Total Payable (₹)', 'totalPayable', 'number']].map(([label, key, type]) => (
            <div key={key}><label style={lbl}>{label}</label><input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inp} /></div>
          ))}
          {err && <p className="text-xs" style={{ color: '#f87171' }}>{err}</p>}
          <div className="flex gap-2 pt-2">
            <button className="fin-btn fin-btn-outline flex-1" onClick={onClose}>Cancel</button>
            <button className="fin-btn fin-btn-primary flex-1" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Vendor'}</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function FinVendors() {
  const [vendors, setVendors] = useState([]);
  const [summary, setSummary] = useState({ total: 0, totalPayable: 0, totalPaid: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/finance/vendors');
      setVendors(data.vendors || []);
      setSummary({ total: data.total || 0, totalPayable: data.totalPayable || 0, totalPaid: data.totalPaid || 0, totalPending: data.totalPending || 0 });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const dueAlerts = vendors.filter(v => v.dueAlert).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Vendors" value={String(summary.total)}           icon={Users}        accentColor="info"    />
        <FinKPICard title="Total Payable" value={fmt(summary.totalPayable)}       icon={IndianRupee}  accentColor="expense" />
        <FinKPICard title="Paid"          value={fmt(summary.totalPaid)}          icon={CheckCircle2} accentColor="revenue" />
        <FinKPICard title="Due Alerts"    value={String(dueAlerts)}               icon={AlertTriangle} accentColor="warning" />
      </div>

      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Vendor Directory</h3>
          <button className="fin-btn fin-btn-primary" onClick={() => setShowModal(true)}><Plus className="h-3.5 w-3.5" />Add Vendor</button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : vendors.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No vendors found</div>
          ) : (
            <table className="fin-table">
              <thead><tr>
                <th>ID</th><th>Vendor Name</th><th>Contact</th><th>Total Payable</th><th>Paid</th><th>Pending</th><th>Status</th><th>Alert</th>
              </tr></thead>
              <tbody>
                {vendors.map((v, i) => (
                  <motion.tr key={v._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <td className="font-mono text-xs">{v.vendorId}</td>
                    <td className="font-semibold">{v.name}</td>
                    <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{v.contact || '—'}</td>
                    <td className="font-semibold">{fmt(v.totalPayable)}</td>
                    <td style={{ color: '#16a34a', fontSize: '14px' }}>{fmt(v.paid)}</td>
                    <td className="text-sm font-semibold" style={{ color: v.pending > 0 ? '#d97706' : '#6b7280' }}>{fmt(v.pending)}</td>
                    <td>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: v.status === 'Active' ? '#16a34a' : '#6b7280', background: v.status === 'Active' ? '#dcfce7' : '#f3f4f6' }}>
                        {v.status}
                      </span>
                    </td>
                    <td>
                      {v.dueAlert && (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#fbbf24' }}>
                          <AlertTriangle className="h-3 w-3" />Due
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showModal && <VendorModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}
