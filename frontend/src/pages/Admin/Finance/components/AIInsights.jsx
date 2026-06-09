import { motion } from 'framer-motion';
import { AlertTriangle, TrendingDown, Target, Zap } from 'lucide-react';

const insights = [
  { icon: AlertTriangle, type: 'warning', title: 'Cash Shortage Risk', description: 'Based on current burn rate, projected cash shortfall in 45 days. Consider accelerating receivables collection.' },
  { icon: TrendingDown,  type: 'alert',   title: 'Expense Spike Detected', description: 'Admin costs increased 23% MoM. Primary driver: software subscriptions (+₹1.2L).' },
  { icon: Target,        type: 'info',    title: 'Revenue Concentration', description: '68% of revenue comes from top 3 clients. Diversification recommended to reduce risk.' },
  { icon: Zap,           type: 'success', title: 'Revenue Leakage Found', description: '2 invoices worth ₹3.4L appear underpaid. Review INV-2024-067 and INV-2024-071.' },
];

const typeColor = {
  warning: '#d97706',
  alert:   '#dc2626',
  info:    '#7c3aed',
  success: '#16a34a',
};
const typeBg = {
  warning: '#fffbeb',
  alert:   '#fff1f2',
  info:    '#f5f3ff',
  success: '#f0fdf4',
};
const typeBorderColor = {
  warning: '#f59e0b',
  alert:   '#f87171',
  info:    '#7c3aed',
  success: '#4ade80',
};

export function AIInsights() {
  return (
    <div className="fin-card">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-4 w-4" style={{ color: '#7c3aed' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>AI Insights</h3>
      </div>
      <div className="space-y-3">
        {insights.map((ins, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
            style={{ background: typeBg[ins.type], borderLeft: `2px solid ${typeBorderColor[ins.type]}`, borderRadius: '0 8px 8px 0', padding: '12px' }}
          >
            <div className="flex items-start gap-2.5">
              <ins.icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: typeColor[ins.type] }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--fin-fg)' }}>{ins.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--fin-muted)' }}>{ins.description}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
