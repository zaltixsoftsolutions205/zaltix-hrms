import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Clock, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const statusStyle = {
  Filed:    { color: '#16a34a', bg: '#dcfce7' },
  Pending:  { color: '#d97706', bg: '#fef3c7' },
  Upcoming: { color: '#7c3aed', bg: '#ede9fe' },
  Overdue:  { color: '#dc2626', bg: '#fee2e2' },
};

export function FinCompliance() {
  const [data, setData] = useState({ filings: [], overdue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/finance/compliance').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { filings = [], overdue = 0 } = data;
  const filed = filings.filter(f => f.status === 'Filed').length;
  const pending = filings.filter(f => f.status === 'Pending').length;
  const total = filings.length;
  const score = total > 0 ? Math.round((filed / total) * 100) : 0;

  const riskAlerts = filings
    .filter(f => f.status === 'Pending' || f.status === 'Overdue')
    .map(f => ({
      severity: f.status === 'Overdue' ? 'high' : 'medium',
      title: `${f.name} ${f.status}`,
      description: `${f.description} — Due ${fmtDate(f.dueDate)}`,
    }));

  const severityStyle = {
    high:   { color: '#dc2626', bg: '#fee2e2' },
    medium: { color: '#d97706', bg: '#fef3c7' },
    low:    { color: '#7c3aed', bg: '#ede9fe' },
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Compliance Score" value={`${score}%`}  change={0} changeLabel="" icon={Shield}       accentColor="profit"  />
        <FinKPICard title="Filed on Time"    value={`${filed}/${total}`}                   icon={CheckCircle2} accentColor="revenue" />
        <FinKPICard title="Pending Filings"  value={String(pending)}                       icon={Clock}        accentColor="warning" />
        <FinKPICard title="Risk Alerts"      value={String(overdue + pending)}             icon={AlertTriangle} accentColor="expense" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Filing Register</h3>
            <button className="fin-btn fin-btn-outline"><Download className="h-3.5 w-3.5" />Export</button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="fin-table">
                <thead><tr>
                  <th>Type</th><th>Description</th><th>Period</th><th>Due Date</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {filings.map((f, i) => (
                    <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                      <td className="font-semibold text-xs">{f.name}</td>
                      <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{f.description}</td>
                      <td className="text-xs">{f.period}</td>
                      <td className="text-xs" style={{ color: 'var(--fin-muted)' }}>{fmtDate(f.dueDate)}</td>
                      <td>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ color: statusStyle[f.status]?.color, background: statusStyle[f.status]?.bg }}>
                          {f.status}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="fin-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fin-fg)' }}>Risk Alerts</h3>
            {riskAlerts.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--fin-muted)' }}>No active risk alerts</p>
            ) : (
              <div className="space-y-3">
                {riskAlerts.map((alert, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                    className="rounded-lg p-3" style={{ background: '#f5f3ff' }}>
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 rounded-md p-1.5" style={{ color: severityStyle[alert.severity]?.color, background: severityStyle[alert.severity]?.bg }}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--fin-fg)' }}>{alert.title}</p>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--fin-muted)' }}>{alert.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="fin-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fin-fg)' }}>Current Month Summary</h3>
            <div className="space-y-2">
              {[
                ['Total Filings Tracked', total],
                ['Filed on Time', filed],
                ['Pending', pending],
                ['Overdue', overdue],
              ].map(([label, value], i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5" style={{ borderBottom: i < 3 ? '1px solid var(--fin-border)' : 'none' }}>
                  <span style={{ color: 'var(--fin-muted)' }}>{label}</span>
                  <span className="font-semibold" style={{ color: 'var(--fin-fg)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
