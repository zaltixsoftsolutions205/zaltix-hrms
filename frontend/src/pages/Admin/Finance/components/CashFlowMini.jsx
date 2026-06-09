import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../../../utils/api';

export function CashFlowMini() {
  const [data, setData]   = useState([]);
  const [net, setNet]     = useState(0);

  useEffect(() => {
    api.get('/finance/cashflow', { params: { months: 6 } })
      .then(r => {
        const rows = r.data?.data || [];
        setData(rows.map(m => ({
          day: m.label || new Date(2000, m.month - 1).toLocaleString('default', { month: 'short' }),
          inflow:  m.inflow  || 0,
          outflow: m.outflow || 0,
        })));
        const totalNet = rows.reduce((s, m) => s + ((m.inflow || 0) - (m.outflow || 0)), 0);
        setNet(totalNet);
      })
      .catch(() => {});
  }, []);

  const fmtNet = (v) => `${v >= 0 ? '+' : '-'}₹${Math.abs(v).toLocaleString('en-IN')}`;

  return (
    <div className="fin-card">
      <div className="mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Cash Flow (6 Months)</h3>
        <p className="text-xs" style={{ color: net >= 0 ? '#16a34a' : '#dc2626' }}>Net: {fmtNet(net)}</p>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} barGap={2}>
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' }}
            formatter={(v) => [`₹${Number(v || 0).toLocaleString('en-IN')}`]}
          />
          <Bar dataKey="inflow"  fill="#7c3aed" radius={[3, 3, 0, 0]} />
          <Bar dataKey="outflow" fill="rgba(248,113,113,0.6)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
