import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../../../utils/api';

const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export function RevenueExpenseChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get('/finance/reports/yearly', { params: { year: new Date().getFullYear() } })
      .then(r => {
        const months = Array.isArray(r.data) ? r.data : (r.data?.months || []);
        setData(months.map(m => ({
          month: m.monthName || new Date(2000, m.month - 1).toLocaleString('default', { month: 'short' }),
          revenue: m.income || m.totalIncome || 0,
          expenses: m.expense || m.totalExpense || 0,
        })));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="fin-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Revenue vs Expenses</h3>
          <p className="text-xs" style={{ color: 'var(--fin-muted)' }}>FY {new Date().getFullYear()}</p>
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
