import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, PieChart as PieIcon, FileBarChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const PIE_COLORS = ['#7c3aed', '#f59e0b', '#16a34a', '#dc2626', '#6b7280'];
const tt = { background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' };

export function FinReports() {
  const [yearlyData, setYearlyData] = useState([]);
  const [serviceData, setServiceData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/finance/reports/yearly'),
      api.get('/finance/reports/by-service'),
    ]).then(([yearly, service]) => {
      setYearlyData(yearly.data || []);
      setServiceData(service.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalIncome  = yearlyData.reduce((s, m) => s + m.income, 0);
  const totalExpense = yearlyData.reduce((s, m) => s + m.expense, 0);
  const totalProfit  = totalIncome - totalExpense;
  const grossMargin  = totalIncome > 0 ? Math.round((totalProfit / totalIncome) * 100) : 0;

  const pnlData = [
    { category: 'Revenue',     amount: totalIncome },
    { category: 'Expenses',    amount: -totalExpense },
    { category: 'Net Profit',  amount: totalProfit },
  ];

  const pieData = serviceData.length > 0
    ? serviceData.slice(0, 5).map((s, i) => ({ name: s._id || 'Other', value: s.revenue, color: PIE_COLORS[i] }))
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Revenue"  value={`₹${(totalIncome / 100000).toFixed(1)}L`}  icon={TrendingUp}   accentColor="revenue" />
        <FinKPICard title="Total Expense"  value={`₹${(totalExpense / 100000).toFixed(1)}L`} icon={BarChart3}    accentColor="expense" />
        <FinKPICard title="Net Profit"     value={`₹${(totalProfit / 100000).toFixed(1)}L`}  icon={PieIcon}      accentColor="profit"  />
        <FinKPICard title="Gross Margin"   value={`${grossMargin}%`}                          icon={FileBarChart} accentColor="info"    />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="fin-card">
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--fin-fg)' }}>Profit & Loss Summary</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--fin-muted)' }}>Year to date</p>
          {loading ? (
            <div className="flex items-center justify-center h-48" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pnlData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => `₹${(Math.abs(v) / 100000).toFixed(0)}L`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#374151' }} width={90} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tt} formatter={(v) => [`₹${(Math.abs(Number(v)) / 100000).toFixed(1)}L`]} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {pnlData.map((entry, i) => <Cell key={i} fill={entry.amount >= 0 ? '#7c3aed' : 'rgba(220,38,38,0.7)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="fin-card">
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--fin-fg)' }}>Revenue by Service Type</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--fin-muted)' }}>Revenue contribution breakdown</p>
          {loading ? (
            <div className="flex items-center justify-center h-48" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--fin-muted)' }}>No service revenue data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tt} formatter={(v) => [`₹${(Number(v) / 100000).toFixed(1)}L`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-2">
                {pieData.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2" style={{ color: 'var(--fin-fg)' }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--fin-fg)' }}>₹{(c.value / 100000).toFixed(1)}L</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {yearlyData.length > 0 && (
        <div className="fin-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>Monthly Revenue vs Expense</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
              <XAxis dataKey="monthName" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
              <Tooltip contentStyle={tt} formatter={(v) => [`₹${(Number(v) / 100000).toFixed(1)}L`]} />
              <Bar dataKey="income"  fill="#7c3aed"              radius={[4,4,0,0]} name="Revenue" />
              <Bar dataKey="expense" fill="rgba(220,38,38,0.6)" radius={[4,4,0,0]} name="Expense" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
