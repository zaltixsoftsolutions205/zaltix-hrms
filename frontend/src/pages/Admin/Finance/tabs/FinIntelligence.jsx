import { useState, useEffect } from 'react';
import { TrendingUp, Wallet, Flame, AlertTriangle, Brain, Target, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmtL = (n) => `₹${(Number(n || 0) / 100000).toFixed(1)}L`;
const tt = { background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' };
const PIE_COLORS = ['#7c3aed', '#f59e0b', '#16a34a', '#dc2626', '#a78bfa', '#f97316'];

export function FinIntelligence() {
  const [data, setData] = useState({ trend: [], topClients: [], expenseBreakdown: [], insights: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/finance/intelligence').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { trend = [], topClients = [], expenseBreakdown = [], insights = {} } = data;

  const chartTrend = trend.map(d => ({
    ...d,
    revenueL: +(d.revenue / 100000).toFixed(2),
    expensesL: +(d.expenses / 100000).toFixed(2),
  }));

  const aiInsights = [
    insights.incomeGrowth > 0
      ? { type: 'success', icon: TrendingUp, title: 'Revenue Growing', text: `Income grew by ${insights.incomeGrowth}% vs last month.` }
      : { type: 'warning', icon: AlertTriangle, title: 'Revenue Declined', text: `Income dropped by ${Math.abs(insights.incomeGrowth)}% vs last month.` },
    insights.expenseGrowth > 10
      ? { type: 'danger', icon: Flame, title: 'Expense Spike', text: `Expenses increased by ${insights.expenseGrowth}% this month.` }
      : { type: 'info', icon: Target, title: 'Expenses Stable', text: `Expense growth is ${insights.expenseGrowth}% — within normal range.` },
    topClients.length > 0
      ? { type: 'warning', icon: Users, title: 'Client Concentration', text: `Top client: ${topClients[0]?._id} with ${fmtL(topClients[0]?.total)} invoiced.` }
      : { type: 'info', icon: Users, title: 'Client Data', text: 'No invoice data available yet.' },
    { type: 'success', icon: Brain, title: 'Profit Margin', text: `Current month net margin is ${insights.profitMargin || 0}%.` },
  ];

  const insightColor = { warning: '#d97706', danger: '#dc2626', info: '#7c3aed', success: '#16a34a' };
  const insightBg    = { warning: '#fffbeb', danger: '#fff1f2', info: '#f5f3ff', success: '#f0fdf4' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Current Income"    value={fmtL(insights.curIncome)}    icon={Wallet}     accentColor="revenue" />
        <FinKPICard title="Current Expenses"  value={fmtL(insights.curExpense)}   icon={Flame}      accentColor="expense" />
        <FinKPICard title="Net Margin"        value={`${insights.profitMargin || 0}%`} change={insights.profitMargin} changeLabel="" icon={TrendingUp} accentColor="profit" />
        <FinKPICard title="Revenue Growth"    value={`${insights.incomeGrowth > 0 ? '+' : ''}${insights.incomeGrowth || 0}%`} icon={TrendingUp} accentColor="revenue" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 fin-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>Revenue vs Expense Trend (₹ Lakhs)</h3>
          {loading ? (
            <div className="flex items-center justify-center h-64" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartTrend}>
                <defs>
                  <linearGradient id="intRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="intExpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip contentStyle={tt} formatter={(v) => [`₹${v}L`]} />
                <Area type="monotone" dataKey="revenueL"  stroke="#7c3aed" fill="url(#intRevGrad)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="expensesL" stroke="#f87171" fill="url(#intExpGrad)" strokeWidth={2} name="Expense" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="fin-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>AI Insights</h3>
          <div className="space-y-3">
            {aiInsights.map((ins, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="rounded-lg p-3" style={{ background: '#f5f3ff' }}>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 rounded-md p-1.5" style={{ color: insightColor[ins.type], background: insightBg[ins.type] }}>
                    <ins.icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--fin-fg)' }}>{ins.title}</p>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--fin-muted)' }}>{ins.text}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {expenseBreakdown.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="fin-card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>Expense Breakdown</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={expenseBreakdown} dataKey="total" nameKey="_id" cx="50%" cy="50%" outerRadius={85} label={({ _id, percent }) => `${_id}: ${(percent * 100).toFixed(0)}%`}>
                  {expenseBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tt} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`]} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="fin-card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>Top Clients by Invoice Value</h3>
            <div className="space-y-3">
              {topClients.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-2" style={{ borderBottom: i < topClients.length - 1 ? '1px solid var(--fin-border)' : 'none' }}>
                  <span className="font-medium" style={{ color: 'var(--fin-fg)' }}>{c._id || 'Unknown'}</span>
                  <span className="font-bold" style={{ color: '#7c3aed' }}>{fmtL(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
