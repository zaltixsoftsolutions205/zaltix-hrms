import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import api from '../../../../utils/api';

const cfg = {
  Filed:   { icon: CheckCircle,   color: '#16a34a', label: 'Filed' },
  Pending: { icon: Clock,         color: '#d97706', label: 'Pending' },
  Overdue: { icon: AlertTriangle, color: '#dc2626', label: 'Overdue' },
};

export function ComplianceStatus() {
  const [filings, setFilings] = useState([]);

  useEffect(() => {
    api.get('/finance/compliance')
      .then(r => setFilings(r.data?.filings || []))
      .catch(() => setFilings([]));
  }, []);

  if (filings.length === 0) {
    return (
      <div className="fin-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fin-fg)' }}>Compliance Status</h3>
        <p className="text-xs text-center py-4" style={{ color: 'var(--fin-muted)' }}>No compliance items found</p>
      </div>
    );
  }

  return (
    <div className="fin-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fin-fg)' }}>Compliance Status</h3>
      <div className="space-y-3">
        {filings.map((item) => {
          const c = cfg[item.status] || cfg.Pending;
          const Icon = c.icon;
          return (
            <div key={item.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" style={{ color: c.color }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--fin-fg)' }}>{item.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--fin-muted)' }}>{item.period} · Due: {new Date(item.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold" style={{ color: c.color }}>{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
