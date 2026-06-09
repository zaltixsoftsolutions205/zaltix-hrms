import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { month: 'Jan', revenue: 420000, expenses: 310000 },
  { month: 'Feb', revenue: 480000, expenses: 290000 },
  { month: 'Mar', revenue: 510000, expenses: 340000 },
  { month: 'Apr', revenue: 470000, expenses: 320000 },
  { month: 'May', revenue: 560000, expenses: 350000 },
  { month: 'Jun', revenue: 620000, expenses: 370000 },
  { month: 'Jul', revenue: 580000, expenses: 390000 },
  { month: 'Aug', revenue: 640000, expenses: 360000 },
  { month: 'Sep', revenue: 710000, expenses: 400000 },
  { month: 'Oct', revenue: 680000, expenses: 420000 },
  { month: 'Nov', revenue: 740000, expenses: 410000 },
  { month: 'Dec', revenue: 790000, expenses: 440000 },
];

const fmt = (v) => `₹${(v / 100000).toFixed(1)}L`;

export function RevenueExpenseChart() {
  return (
    <div className="fin-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Revenue vs Expenses</h3>
          <p className="text-xs" style={{ color: 'var(--fin-muted)' }}>FY 2024-25</p>
        </div>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--fin-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: '#7c3aed' }} />Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: '#f87171' }} />Expenses
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={fmt} />
          <Tooltip
            contentStyle={{ background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' }}
            formatter={(v) => [fmt(Number(v))]}
          />
          <Area type="monotone" dataKey="revenue" stroke="#7c3aed" fill="url(#revGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="expenses" stroke="#f87171" fill="url(#expGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
