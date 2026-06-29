import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Modal from '../../components/UI/Modal';

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     bg: 'bg-gray-100',   text: 'text-gray-600' },
  confirmed:   { label: 'Confirmed',   bg: 'bg-violet-100',   text: 'text-violet-700' },
  'in-progress': { label: 'In Progress', bg: 'bg-amber-100', text: 'text-amber-700' },
  delivered:   { label: 'Delivered',   bg: 'bg-violet-100',  text: 'text-violet-700' },
  cancelled:   { label: 'Cancelled',   bg: 'bg-gray-100',    text: 'text-gray-900' },
};

const STATUSES = ['pending', 'confirmed', 'in-progress', 'delivered', 'cancelled'];

const emptyItem = () => ({ description: '', quantity: 1, rate: 0, amount: 0 });

const emptyForm = {
  clientName: '', clientEmail: '', clientPhone: '', clientCompany: '',
  taxPercent: 18, deliveryDate: '', paymentTerms: '', notes: '',
  items: [emptyItem()],
};

const PurchaseOrdersTab = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/purchase-orders${statusFilter ? `?status=${statusFilter}` : ''}`);
      setOrders(r.data);
    } catch { toast.error('Failed to load purchase orders'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [statusFilter]);

  const updateItem = (idx, field, val) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: field === 'description' ? val : Number(val) };
      items[idx].amount = items[idx].quantity * items[idx].rate;
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const subtotal = form.items.reduce((s, i) => s + i.amount, 0);
  const taxAmt = subtotal * ((form.taxPercent || 0) / 100);
  const total = subtotal + taxAmt;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientName.trim()) return toast.error('Client name required');
    if (form.items.some(i => !i.description.trim())) return toast.error('All items need a description');
    setSubmitting(true);
    try {
      await api.post('/purchase-orders', form);
      toast.success('Purchase order created');
      setForm(emptyForm);
      setShowForm(false);
      fetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create');
    } finally { setSubmitting(false); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const r = await api.put(`/purchase-orders/${id}/status`, { status });
      setOrders(prev => prev.map(o => o._id === id ? r.data : o));
      if (selected?._id === id) setSelected(r.data);
      toast.success('Status updated');
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this purchase order?')) return;
    try {
      await api.delete(`/purchase-orders/${id}`);
      setOrders(prev => prev.filter(o => o._id !== id));
      toast.success('Deleted');
      setSelected(null);
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {['', ...STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === s ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-violet-50'
              }`}>
              {s ? STATUS_CONFIG[s].label : 'All'} ({s ? orders.filter(o => o.status === s).length : orders.length})
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm">
          {showForm ? 'Cancel' : '+ New Purchase Order'}
        </button>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card p-4">
            <h3 className="font-bold text-violet-900 mb-4">New Purchase Order</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Client Info */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Client Name *</label>
                  <input className="input-field" value={form.clientName}
                    onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Full name" />
                </div>
                <div>
                  <label className="label-text">Company</label>
                  <input className="input-field" value={form.clientCompany}
                    onChange={e => setForm(f => ({ ...f, clientCompany: e.target.value }))} placeholder="Company name" />
                </div>
                <div>
                  <label className="label-text">Email</label>
                  <input className="input-field" type="email" value={form.clientEmail}
                    onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} placeholder="email@example.com" />
                </div>
                <div>
                  <label className="label-text">Phone</label>
                  <input className="input-field" value={form.clientPhone}
                    onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} placeholder="+91 ..." />
                </div>
                <div>
                  <label className="label-text">Delivery Date</label>
                  <input type="date" className="input-field" value={form.deliveryDate}
                    onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">Payment Terms</label>
                  <input className="input-field" value={form.paymentTerms}
                    onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="e.g. Net 30, 50% advance" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label-text">Items *</label>
                  <button type="button" onClick={addItem} className="text-xs text-violet-600 font-semibold hover:underline">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-400 uppercase px-1">
                    <span className="col-span-5">Description</span>
                    <span className="col-span-2 text-right">Qty</span>
                    <span className="col-span-2 text-right">Rate (₹)</span>
                    <span className="col-span-2 text-right">Amount</span>
                    <span className="col-span-1" />
                  </div>
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input className="input-field col-span-5 text-sm" placeholder="Item description"
                        value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                      <input className="input-field col-span-2 text-sm text-right" type="number" min="1"
                        value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                      <input className="input-field col-span-2 text-sm text-right" type="number" min="0"
                        value={item.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} />
                      <span className="col-span-2 text-right text-sm font-semibold text-violet-700">
                        {formatCurrency(item.amount)}
                      </span>
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)}
                          className="col-span-1 text-gray-900 hover:text-gray-900 text-xs font-bold text-center">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="label-text">Tax %</label>
                  <input type="number" min="0" max="100" className="input-field" value={form.taxPercent}
                    onChange={e => setForm(f => ({ ...f, taxPercent: Number(e.target.value) }))} />
                </div>
                <div className="sm:col-span-2 bg-violet-50 rounded-xl p-3 border border-violet-100">
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                    <div className="flex justify-between"><span>Tax ({form.taxPercent}%)</span><span>{formatCurrency(taxAmt)}</span></div>
                  </div>
                  <div className="flex justify-between font-bold text-violet-900 mt-1 pt-1 border-t border-violet-200">
                    <span>Total</span><span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="label-text">Notes</label>
                <textarea className="input-field resize-none" rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional terms or notes..." />
              </div>

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary btn-sm">
                  {submitting ? 'Creating...' : 'Create PO'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <p className="text-center text-sm text-violet-400 py-8">Loading...</p>
      ) : orders.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-violet-400 text-sm">No purchase orders yet.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-3">Create First PO</button>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(po => {
            const cfg = STATUS_CONFIG[po.status] || STATUS_CONFIG.pending;
            return (
              <motion.div key={po._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="glass-card p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelected(po)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-violet-400">{po.poNumber}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                      {po.quotation && (
                        <span className="text-[10px] text-gray-400">from {po.quotation.quotationNumber}</span>
                      )}
                    </div>
                    <p className="font-semibold text-violet-900 truncate">{po.clientName}</p>
                    {po.clientCompany && <p className="text-xs text-gray-400">{po.clientCompany}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-violet-900">{formatCurrency(po.total)}</p>
                    <p className="text-xs text-gray-400">{formatDate(po.createdAt)}</p>
                    {po.deliveryDate && (
                      <p className={`text-[10px] ${new Date(po.deliveryDate) < new Date() && po.status !== 'delivered' ? 'text-gray-900' : 'text-gray-400'}`}>
                        Delivery: {formatDate(po.deliveryDate)}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.poNumber || ''} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-400 text-xs">Client</span><p className="font-semibold">{selected.clientName}</p></div>
              {selected.clientCompany && <div><span className="text-gray-400 text-xs">Company</span><p className="font-semibold">{selected.clientCompany}</p></div>}
              {selected.clientEmail && <div><span className="text-gray-400 text-xs">Email</span><p>{selected.clientEmail}</p></div>}
              {selected.clientPhone && <div><span className="text-gray-400 text-xs">Phone</span><p>{selected.clientPhone}</p></div>}
              {selected.deliveryDate && <div><span className="text-gray-400 text-xs">Delivery Date</span><p>{formatDate(selected.deliveryDate)}</p></div>}
              {selected.paymentTerms && <div><span className="text-gray-400 text-xs">Payment Terms</span><p>{selected.paymentTerms}</p></div>}
              {selected.quotation && <div><span className="text-gray-400 text-xs">From Quotation</span><p className="text-violet-600 font-semibold">{selected.quotation.quotationNumber}</p></div>}
            </div>

            {/* Items table */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Items</p>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold">Description</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500 font-semibold">Qty</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500 font-semibold">Rate</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.rate)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-sm space-y-1 text-right pr-1">
                <div className="flex justify-end gap-8 text-gray-500"><span>Subtotal</span><span>{formatCurrency(selected.subtotal)}</span></div>
                <div className="flex justify-end gap-8 text-gray-500"><span>Tax ({selected.taxPercent}%)</span><span>{formatCurrency(selected.taxAmount)}</span></div>
                <div className="flex justify-end gap-8 font-bold text-violet-900 text-base"><span>Total</span><span>{formatCurrency(selected.total)}</span></div>
              </div>
            </div>

            {selected.notes && (
              <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Notes</p><p className="text-sm text-gray-600">{selected.notes}</p></div>
            )}

            {/* Status */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-400 font-semibold">Status:</span>
              {STATUSES.map(s => (
                <button key={s} onClick={() => handleStatusChange(selected._id, s)}
                  className={`px-2 py-0.5 rounded-md text-xs font-semibold border transition-colors ${
                    selected.status === s
                      ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} border-transparent`
                      : 'border-gray-200 text-gray-500 hover:border-violet-300'
                  }`}>
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => handleDelete(selected._id)}
                className="btn-sm border border-gray-200 text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1 text-xs font-semibold">
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PurchaseOrdersTab;
