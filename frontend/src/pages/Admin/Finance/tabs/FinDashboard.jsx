import { useState, useEffect } from 'react';
import { IndianRupee, TrendingDown, Wallet, Clock, ArrowUpRight } from 'lucide-react';
import { FinKPICard } from '../components/FinKPICard';
import { RevenueExpenseChart } from '../components/RevenueExpenseChart';
import { CashFlowMini } from '../components/CashFlowMini';
import { HealthScore } from '../components/HealthScore';
import { AIInsights } from '../components/AIInsights';
import { ComplianceStatus } from '../components/ComplianceStatus';
import api from '../../../../utils/api';

const fmt = (n) => `₹${(Number(n || 0) / 100000).toFixed(1)}L`;

export function FinDashboard({ month, year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = month && year ? { month, year } : {};
    api.get('/finance/dashboard', { params })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month, year]);

  const totalIncome  = data?.totalIncome  || 0;
  const totalExpense = data?.totalExpense || 0;
  const profit       = data?.profit       || 0;
  const outstanding  = data?.invoices?.pending?.total || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Revenue"  value={fmt(totalIncome)}  icon={IndianRupee}  accentColor="revenue" />
        <FinKPICard title="Total Expenses" value={fmt(totalExpense)} icon={TrendingDown} accentColor="expense" />
        <FinKPICard title="Net Profit"     value={fmt(profit)}       icon={Wallet}       accentColor="profit"  />
        <FinKPICard title="Outstanding"    value={fmt(outstanding)}  icon={Clock}        accentColor="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueExpenseChart />
        </div>
        <div className="flex flex-col gap-4">
          <div className="fin-card flex items-center justify-center py-6">
            <HealthScore score={data ? Math.max(10, Math.min(100, Math.round((profit / (totalIncome || 1)) * 100 + 50))) : 0} label="Business Health Score" />
          </div>
          <CashFlowMini />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AIInsights />
        </div>
        <div className="flex flex-col gap-4">
          <ComplianceStatus />
        </div>
      </div>

      <div className="fin-card flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg p-3" style={{ background: '#ede9fe' }}>
            <Wallet className="h-5 w-5" style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#111827' }}>Financial Runway</p>
            <p className="text-xs" style={{ color: '#6b7280' }}>Based on current burn rate and cash reserves</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color: '#111827' }}>
            {totalExpense > 0 ? `${Math.round((profit * 12) / (totalExpense / (new Date().getMonth() + 1) || 1) * 30)} days` : '—'}
          </p>
          <div className="flex items-center gap-1 justify-end" style={{ color: profit >= 0 ? '#16a34a' : '#dc2626' }}>
            <ArrowUpRight className="h-3 w-3" />
            <span className="text-xs font-semibold">
              {data ? `${data.profitMargin || 0}% margin` : 'Calculating…'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
