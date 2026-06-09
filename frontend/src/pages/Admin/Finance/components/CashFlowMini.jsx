import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { day: 'Mon', inflow: 180000, outflow: 120000 },
  { day: 'Tue', inflow: 240000, outflow: 90000 },
  { day: 'Wed', inflow: 150000, outflow: 200000 },
  { day: 'Thu', inflow: 310000, outflow: 160000 },
  { day: 'Fri', inflow: 280000, outflow: 140000 },
  { day: 'Sat', inflow: 90000,  outflow: 60000 },
  { day: 'Sun', inflow: 40000,  outflow: 30000 },
];

export function CashFlowMini() {
  return (
    <div className="fin-card">
      <div className="mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Cash Flow (This Week)</h3>
        <p className="text-xs" style={{ color: 'var(--fin-muted)' }}>Net: +₹4.7L</p>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} barGap={2}>
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' }}
            formatter={(v) => [`₹${(Number(v) / 1000).toFixed(0)}K`]}
          />
          <Bar dataKey="inflow"  fill="#7c3aed" radius={[3, 3, 0, 0]} />
          <Bar dataKey="outflow" fill="rgba(248,113,113,0.6)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
