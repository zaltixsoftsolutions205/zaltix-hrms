import { Wallet, TrendingDown, Building2, Repeat, Plus, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { FinKPICard } from '../components/FinKPICard';

const expenses = [
  { id: 'EXP-001', category: 'Software Subscriptions', vendor: 'AWS',         amount: '₹3,40,000', date: 'Apr 10, 2025', type: 'Fixed',    department: 'Technology' },
  { id: 'EXP-002', category: 'Office Rent',            vendor: 'Realty Corp', amount: '₹1,80,000', date: 'Apr 01, 2025', type: 'Fixed',    department: 'Admin' },
  { id: 'EXP-003', category: 'Marketing',              vendor: 'Google Ads',  amount: '₹2,20,000', date: 'Apr 08, 2025', type: 'Variable', department: 'Marketing' },
  { id: 'EXP-004', category: 'Travel',                 vendor: 'Various',     amount: '₹85,000',   date: 'Apr 05, 2025', type: 'Variable', department: 'Sales' },
  { id: 'EXP-005', category: 'Utilities',              vendor: 'BSES Delhi',  amount: '₹45,000',   date: 'Apr 02, 2025', type: 'Fixed',    department: 'Admin' },
  { id: 'EXP-006', category: 'Professional Services',  vendor: 'Deloitte',    amount: '₹4,50,000', date: 'Mar 28, 2025', type: 'Variable', department: 'Finance' },
];

const costByDept = [
  { name: 'Technology', value: 340000, color: '#4ade80' },
  { name: 'Admin',      value: 225000, color: '#60a5fa' },
  { name: 'Marketing',  value: 220000, color: '#fbbf24' },
  { name: 'Sales',      value: 85000,  color: '#c084fc' },
  { name: 'Finance',    value: 450000, color: '#34d399' },
];

export function FinExpenses() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Expenses" value="₹13.20L" change={-3.2} changeLabel="vs last month" icon={Wallet}     accentColor="expense" />
        <FinKPICard title="Fixed Costs"    value="₹5.65L"  icon={Building2}  accentColor="info"    />
        <FinKPICard title="Variable Costs" value="₹7.55L"  icon={TrendingDown} accentColor="warning" />
        <FinKPICard title="Recurring"      value="₹5.20L"  icon={Repeat}     accentColor="profit"  />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Expense Register</h3>
            <div className="flex items-center gap-2">
              <button className="fin-btn fin-btn-outline"><Filter className="h-3.5 w-3.5" />Filter</button>
              <button className="fin-btn fin-btn-primary"><Plus className="h-3.5 w-3.5" />Add Expense</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="fin-table">
              <thead><tr>
                <th>ID</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Type</th><th>Department</th>
              </tr></thead>
              <tbody>
                {expenses.map((exp, i) => (
                  <motion.tr key={exp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                    <td className="font-mono text-xs">{exp.id}</td>
                    <td>{exp.category}</td>
                    <td style={{ color: 'var(--fin-muted)' }}>{exp.vendor}</td>
                    <td className="font-semibold">{exp.amount}</td>
                    <td>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: exp.type === 'Fixed' ? '#60a5fa' : '#fbbf24', background: exp.type === 'Fixed' ? 'rgba(96,165,250,0.1)' : 'rgba(251,191,36,0.1)' }}>
                        {exp.type}
                      </span>
                    </td>
                    <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{exp.department}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fin-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--fin-fg)' }}>Cost by Department</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={costByDept} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {costByDept.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #ede9fe', borderRadius: '8px', fontSize: '12px', color: '#111827' }}
                formatter={(v) => [`₹${(Number(v) / 1000).toFixed(0)}K`]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-2">
            {costByDept.map((dept) => (
              <div key={dept.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2" style={{ color: 'var(--fin-fg)' }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: dept.color }} />
                  {dept.name}
                </span>
                <span style={{ color: 'var(--fin-muted)' }}>₹{(dept.value / 100000).toFixed(1)}L</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
