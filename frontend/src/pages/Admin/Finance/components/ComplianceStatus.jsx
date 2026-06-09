import { CheckCircle, AlertTriangle, Clock } from 'lucide-react';

const items = [
  { label: 'GSTR-1 (Mar)',      status: 'filed',   deadline: 'Apr 11, 2025' },
  { label: 'GSTR-3B (Mar)',     status: 'pending', deadline: 'Apr 20, 2025' },
  { label: 'TDS Q4',            status: 'due',     deadline: 'Apr 30, 2025' },
  { label: 'GST Annual Return', status: 'pending', deadline: 'Jun 30, 2025' },
];

const cfg = {
  filed:   { icon: CheckCircle,  color: '#16a34a', label: 'Filed' },
  pending: { icon: Clock,        color: '#d97706', label: 'Pending' },
  due:     { icon: AlertTriangle,color: '#dc2626', label: 'Due Soon' },
};

export function ComplianceStatus() {
  return (
    <div className="fin-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fin-fg)' }}>Compliance Status</h3>
      <div className="space-y-3">
        {items.map((item) => {
          const c = cfg[item.status];
          return (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <c.icon className="h-4 w-4" style={{ color: c.color }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--fin-fg)' }}>{item.label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--fin-muted)' }}>Due: {item.deadline}</p>
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
