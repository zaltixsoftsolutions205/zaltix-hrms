import { useState, useEffect } from 'react';
import api from '../../utils/api';

// Self-service nudge: shows the employee's own overdue task entries (any day,
// not just today), since otherwise overdue tasks were only visible to
// HR/Admin via Org View and the Performance score.
const OverdueTasksBadge = () => {
  const [overdue, setOverdue] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get('/timesheets/my-overdue').then(res => setOverdue(res.data)).catch(() => {});
  }, []);

  if (overdue.length === 0) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-900 text-xs font-semibold hover:bg-gray-200 transition-colors">
        ⚠ {overdue.length} overdue task{overdue.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-2 space-y-1">
          {overdue.slice(0, 10).map(t => (
            <div key={t.entryId} className="p-2 rounded-lg hover:bg-gray-50 text-xs">
              <p className="font-medium text-violet-900">{t.task}</p>
              <p className="text-gray-400">{t.project && `${t.project} · `}Due {t.dueDate} · logged {t.date}</p>
            </div>
          ))}
          {overdue.length > 10 && <p className="text-[11px] text-gray-400 px-2">+{overdue.length - 10} more</p>}
        </div>
      )}
    </div>
  );
};

export default OverdueTasksBadge;
