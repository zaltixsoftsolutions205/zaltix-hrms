import { useState, useEffect } from 'react';
import { ClipboardList, Shield, Edit, User, Plus, Eye, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmtTs = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const actionIcons  = { Created: Plus, Edited: Edit, Deleted: Trash2, Viewed: Eye, Approved: Shield, Rejected: Shield };
const actionColor  = { Created: '#16a34a', Edited: '#d97706', Deleted: '#dc2626', Viewed: '#7c3aed', Approved: '#16a34a', Rejected: '#dc2626' };

export function FinAuditLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filter !== 'All' ? { action: filter } : {};
    api.get('/finance/audit-log', { params })
      .then(r => { setLogs(r.data.logs || []); setTotal(r.data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const thisMonth = logs.filter(l => {
    const d = new Date(l.createdAt);
    const n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  });
  const edits = thisMonth.filter(l => l.action === 'Edited').length;
  const uniqueUsers = new Set(logs.map(l => l.user?._id)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Actions"    value={String(total)}           icon={ClipboardList} accentColor="info"    />
        <FinKPICard title="Users Active"     value={String(uniqueUsers)}     icon={User}          accentColor="revenue" />
        <FinKPICard title="Edits This Month" value={String(edits)}           icon={Edit}          accentColor="warning" />
        <FinKPICard title="Security Events"  value="0"                       icon={Shield}        accentColor="profit"  />
      </div>

      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Activity Log</h3>
            <div className="flex items-center gap-1 ml-4">
              {['All', 'Created', 'Edited', 'Deleted', 'Viewed', 'Approved', 'Rejected'].map((s) => (
                <button key={s} onClick={() => setFilter(s)}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={{ background: filter === s ? '#ede9fe' : 'transparent', color: filter === s ? '#7c3aed' : '#6b7280' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No audit logs found</div>
          ) : (
            <table className="fin-table">
              <thead><tr>
                <th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Module</th><th>Target</th><th>Details</th>
              </tr></thead>
              <tbody>
                {logs.map((log, i) => {
                  const ActionIcon = actionIcons[log.action] || Eye;
                  return (
                    <motion.tr key={log._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                      <td className="text-xs whitespace-nowrap" style={{ color: 'var(--fin-muted)' }}>{fmtTs(log.createdAt)}</td>
                      <td className="font-semibold text-xs">{log.user?.name || '—'}</td>
                      <td>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ color: '#7c3aed', background: '#ede9fe' }}>
                          {log.user?.role || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: actionColor[log.action] }}>
                          <ActionIcon className="h-3 w-3" />{log.action}
                        </span>
                      </td>
                      <td className="text-xs">{log.module}</td>
                      <td className="font-mono text-xs" style={{ color: '#7c3aed' }}>{log.target}</td>
                      <td className="text-xs max-w-[220px] truncate" style={{ color: 'var(--fin-muted)' }}>{log.details || '—'}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
