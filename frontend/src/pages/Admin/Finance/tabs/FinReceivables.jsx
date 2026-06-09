import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, IndianRupee, TrendingUp, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const bucketStyle = {
  current:    { color: '#16a34a', bg: '#dcfce7',    label: '0–30 days' },
  days30:     { color: '#d97706', bg: '#fef3c7',    label: '30–60 days' },
  days60:     { color: '#dc2626', bg: '#fee2e2',    label: '60+ days' },
  days90plus: { color: '#dc2626', bg: '#fee2e2',    label: '60+ days' },
};

function getBucket(daysOverdue) {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'current';
  if (daysOverdue <= 60) return 'days30';
  return 'days60';
}

export function FinReceivables() {
  const [data, setData] = useState({ invoices: [], buckets: {}, totalOutstanding: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/finance/receivables').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { invoices = [], buckets = {}, totalOutstanding = 0 } = data;

  const agingData = [
    { bucket: '0–30 days',  amount: (buckets.current || 0),  color: '#7c3aed' },
    { bucket: '30–60 days', amount: (buckets.days30 || 0),   color: '#f59e0b' },
    { bucket: '60+ days',   amount: (buckets.days60 || 0) + (buckets.days90plus || 0), color: '#dc2626' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Outstanding"   value={fmt(totalOutstanding)}               icon={IndianRupee}   accentColor="warning" />
        <FinKPICard title="0–30 Days"           value={fmt(buckets.current || 0)}           icon={Clock}         accentColor="revenue" />
        <FinKPICard title="30–60 Days"          value={fmt(buckets.days30 || 0)}            icon={TrendingUp}    accentColor="warning" />
        <FinKPICard title="60+ Days (Critical)" value={fmt((buckets.days60 || 0) + (buckets.days90plus || 0))} icon={AlertTriangle} accentColor="expense" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="fin-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>Aging Buckets</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agingData} layout="vertical">
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <YAxis type="category" dataKey="bucket" width={90} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' }}
                formatter={(v) => [`₹${(Number(v) / 100000).toFixed(2)}L`]}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {agingData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {agingData.map((b) => (
              <div key={b.bucket} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2" style={{ color: 'var(--fin-fg)' }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                  {b.bucket}
                </span>
                <span className="font-semibold" style={{ color: 'var(--fin-fg)' }}>{fmt(b.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Outstanding Invoices</h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : invoices.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No outstanding invoices</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="fin-table">
                <thead><tr>
                  <th>Invoice</th><th>Client</th><th>Amount</th><th>Due Date</th><th>Days Overdue</th><th>Bucket</th><th>Action</th>
                </tr></thead>
                <tbody>
                  {invoices.map((r, i) => {
                    const bucket = getBucket(r.daysOverdue);
                    const bs = bucketStyle[bucket];
                    return (
                      <motion.tr key={r._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                        <td className="font-mono text-xs">{r.invoiceNumber}</td>
                        <td>{r.client}</td>
                        <td className="font-semibold">{fmt(r.totalWithGst)}</td>
                        <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{fmtDate(r.dueDate)}</td>
                        <td>
                          <span className="font-semibold text-xs"
                            style={{ color: r.daysOverdue > 60 ? '#dc2626' : r.daysOverdue > 30 ? '#d97706' : '#111827' }}>
                            {r.daysOverdue} days
                          </span>
                        </td>
                        <td>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ color: bs?.color, background: bs?.bg }}>
                            {bs?.label}
                          </span>
                        </td>
                        <td>
                          <button className="fin-btn fin-btn-outline" style={{ height: '28px', fontSize: '11px' }}>
                            <Send className="h-3 w-3" />Remind
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
