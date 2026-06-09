import { useState, useEffect } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, Clock, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmtL = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const tt = { background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' };

export function FinCashFlow() {
  const [cashData, setCashData] = useState({ data: [], projections: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/finance/cashflow', { params: { months: 6 } })
      .then(r => setCashData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { data = [], projections = {} } = cashData;

  const currentBalance = data.length > 0 ? data[data.length - 1].balance : 0;
  const latestInflow = data.length > 0 ? data[data.length - 1].inflow : 0;
  const latestOutflow = data.length > 0 ? data[data.length - 1].outflow : 0;
  const runway = projections.runway;

  const chartData = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Net Balance"     value={fmtL(currentBalance)}   icon={Wallet}        accentColor="revenue" />
        <FinKPICard title="Last Month Inflow"  value={fmtL(latestInflow)}  icon={ArrowUpRight}  accentColor="profit"  />
        <FinKPICard title="Last Month Outflow" value={fmtL(latestOutflow)} icon={ArrowDownRight} accentColor="expense" />
        <FinKPICard title="Runway" value={runway ? `${runway} days` : '—'} icon={Clock}          accentColor="info"    />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 fin-card">
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--fin-fg)' }}>Cumulative Cash Balance</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--fin-muted)' }}>Last 6 months</p>
          {loading ? (
            <div className="flex items-center justify-center h-48" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="cfBalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Tooltip contentStyle={tt} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`]} />
                <Area type="monotone" dataKey="balance" stroke="#7c3aed" fill="url(#cfBalGrad)" strokeWidth={2} name="Balance" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="fin-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>Cash Flow Projection</h3>
          <div className="space-y-3">
            {[
              { period: 'Next 30 days', projected: projections.nextMonthInflow, confColor: '#7c3aed', confBg: 'rgba(124,58,237,0.08)', confidence: 'Inflow Est.' },
              { period: 'Expected Outflow', projected: projections.nextMonthOutflow, confColor: '#dc2626', confBg: 'rgba(220,38,38,0.08)', confidence: 'Outflow Est.' },
              { period: 'Net Cash Flow', projected: projections.nextMonthNet, confColor: (projections.nextMonthNet || 0) >= 0 ? '#16a34a' : '#dc2626', confBg: (projections.nextMonthNet || 0) >= 0 ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', confidence: 'Projected' },
            ].map((p, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="rounded-lg p-3" style={{ background: '#f5f3ff' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: '#111827' }}>{p.period}</span>
                  <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ color: p.confColor, background: p.confBg }}>{p.confidence}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold" style={{ color: '#111827' }}>{fmtL(p.projected)}</span>
                  {(p.projected || 0) >= 0
                    ? <TrendingUp className="h-3.5 w-3.5" style={{ color: '#16a34a' }} />
                    : <ArrowDownRight className="h-3.5 w-3.5" style={{ color: '#dc2626' }} />}
                </div>
              </motion.div>
            ))}
          </div>
          {runway && (
            <div className="mt-4 rounded-lg p-3" style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <p className="text-[11px] font-medium" style={{ color: '#7c3aed' }}>
                Based on avg 3-month burn rate. Runway: {runway} days.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="fin-card">
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--fin-fg)' }}>Monthly Inflow vs Outflow (₹ Lakhs)</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--fin-muted)' }}>Last 6 months</p>
        {loading ? (
          <div className="flex items-center justify-center h-48" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={tt} formatter={(v) => [`₹${v}L`]} />
              <Bar dataKey="inflowL"  fill="#7c3aed"              radius={[4,4,0,0]} name="Inflow"  />
              <Bar dataKey="outflowL" fill="rgba(248,113,113,0.7)" radius={[4,4,0,0]} name="Outflow" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
