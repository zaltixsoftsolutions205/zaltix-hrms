import { useState, useEffect } from 'react';
import { Briefcase, IndianRupee, CheckCircle2, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function FinSalary() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState({ payslips: [], stats: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/finance/salary', { params: { month, year } })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month, year]);

  const { payslips = [], stats = {} } = data;
  const totalGross = stats.totalGrossSalary || 0;
  const totalNet = stats.totalNetSalary || 0;
  const published = stats.published || 0;
  const pending = (stats.total || 0) - published;
  const depts = new Set(payslips.map(p => p.employee?.department)).size;

  const sel = { background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: '0.5rem', padding: '4px 10px', color: 'var(--fin-fg)', fontSize: '13px', outline: 'none', cursor: 'pointer' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Salary Payable" value={fmt(totalGross)} icon={IndianRupee}  accentColor="expense" />
        <FinKPICard title="Net Paid Out"         value={fmt(totalNet)}  icon={CheckCircle2} accentColor="revenue" />
        <FinKPICard title="Pending"              value={String(pending)} icon={Clock}        accentColor="warning" />
        <FinKPICard title="Departments"          value={String(depts)}  icon={Briefcase}    accentColor="info"    />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="fin-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Period</h3>
            <div className="flex items-center gap-2">
              <select value={month} onChange={e => setMonth(+e.target.value)} style={sel}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(+e.target.value)} style={sel}>
                {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {totalGross > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: 'var(--fin-muted)' }}>Published vs Total</span>
                <span className="font-semibold" style={{ color: 'var(--fin-fg)' }}>
                  {stats.total > 0 ? Math.round((published / stats.total) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#ede9fe' }}>
                <div className="h-full rounded-full" style={{ width: `${stats.total > 0 ? (published / stats.total) * 100 : 0}%`, background: '#7c3aed' }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-lg p-3" style={{ background: '#f5f3ff' }}>
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Published</p>
              <p className="text-lg font-bold" style={{ color: '#7c3aed' }}>{published}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: '#f5f3ff' }}>
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Pending</p>
              <p className="text-lg font-bold" style={{ color: '#d97706' }}>{pending}</p>
            </div>
          </div>
          <p className="text-[11px] mt-3" style={{ color: 'var(--fin-muted)' }}>Data from HRMS payslips module.</p>
        </div>

        <div className="lg:col-span-2 fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>
              Salary Register — {MONTHS[month - 1]} {year}
            </h3>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
            ) : payslips.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No payslips for this period</div>
            ) : (
              <table className="fin-table">
                <thead><tr>
                  <th>Employee</th><th>EMP ID</th><th>Department</th><th>Gross</th><th>Net</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {payslips.map((p, i) => (
                    <motion.tr key={p._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                      <td className="font-semibold">{p.employee?.name || '—'}</td>
                      <td className="font-mono text-xs" style={{ color: 'var(--fin-muted)' }}>{p.employee?.employeeId || '—'}</td>
                      <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{p.employee?.department || '—'}</td>
                      <td className="font-semibold">{fmt(p.grossSalary)}</td>
                      <td className="font-semibold" style={{ color: '#4ade80' }}>{fmt(p.netSalary)}</td>
                      <td>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ color: p.status === 'published' ? '#4ade80' : '#fbbf24', background: p.status === 'published' ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)' }}>
                          {p.status === 'published' ? 'Published' : 'Generated'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
