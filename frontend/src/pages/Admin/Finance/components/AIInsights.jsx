import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingDown, Target, Zap, TrendingUp, CheckCircle } from 'lucide-react';
import api from '../../../../utils/api';

const typeConfig = {
  warning: { icon: AlertTriangle, color: '#d97706', bg: '#fffbeb', border: '#f59e0b' },
  alert:   { icon: TrendingDown,  color: '#dc2626', bg: '#fff1f2', border: '#f87171' },
  info:    { icon: Target,        color: '#7c3aed', bg: '#f5f3ff', border: '#7c3aed' },
  success: { icon: TrendingUp,    color: '#16a34a', bg: '#f0fdf4', border: '#4ade80' },
  good:    { icon: CheckCircle,   color: '#16a34a', bg: '#f0fdf4', border: '#4ade80' },
};

function deriveInsights(data) {
  if (!data) return [];
  const insights = [];
  const { totalIncome = 0, totalExpense = 0, profit = 0, profitMargin = 0, pendingInvoices = 0 } = data;

  if (profitMargin >= 20) {
    insights.push({ type: 'success', title: 'Healthy Profit Margin', description: `Current margin is ${profitMargin}%. Business is performing well this period.` });
  } else if (profitMargin > 0) {
    insights.push({ type: 'warning', title: 'Low Profit Margin', description: `Margin at ${profitMargin}%. Consider reducing expenses or increasing revenue.` });
  } else if (profit < 0) {
    insights.push({ type: 'alert', title: 'Operating at a Loss', description: `Expenses exceed income by ₹${Math.abs(profit).toLocaleString('en-IN')} this period. Review cost structure.` });
  }

  if (pendingInvoices > 0) {
    insights.push({ type: 'warning', title: 'Pending Invoices', description: `${pendingInvoices} invoice${pendingInvoices > 1 ? 's' : ''} awaiting payment. Follow up to improve cash flow.` });
  }

  if (totalExpense > totalIncome * 0.8) {
    insights.push({ type: 'alert', title: 'High Expense Ratio', description: `Expenses are ${Math.round((totalExpense / (totalIncome || 1)) * 100)}% of revenue. Target below 80% for sustainable growth.` });
  }

  if (totalIncome > 0 && insights.length < 2) {
    insights.push({ type: 'info', title: 'Revenue Tracking Active', description: `₹${totalIncome.toLocaleString('en-IN')} recorded this period. Check Reports for a detailed breakdown.` });
  }

  if (insights.length === 0) {
    insights.push({ type: 'info', title: 'No Data This Period', description: 'Add income and expenses to get AI-powered financial insights.' });
  }

  return insights;
}

export function AIInsights() {
  const [insights, setInsights] = useState([]);

  useEffect(() => {
    const now = new Date();
    api.get('/finance/dashboard', { params: { month: now.getMonth() + 1, year: now.getFullYear() } })
      .then(r => setInsights(deriveInsights(r.data)))
      .catch(() => setInsights(deriveInsights(null)));
  }, []);

  return (
    <div className="fin-card">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-4 w-4" style={{ color: '#7c3aed' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>AI Insights</h3>
      </div>
      <div className="space-y-3">
        {insights.map((ins, i) => {
          const cfg = typeConfig[ins.type] || typeConfig.info;
          const InsIcon = cfg.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
              style={{ background: cfg.bg, borderLeft: `2px solid ${cfg.border}`, borderRadius: '0 8px 8px 0', padding: '12px' }}>
              <div className="flex items-start gap-2.5">
                <InsIcon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: cfg.color }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--fin-fg)' }}>{ins.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--fin-muted)' }}>{ins.description}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
