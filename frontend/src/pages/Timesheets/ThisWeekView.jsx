import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import { todayLocal } from './timesheetUtils';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Self-service weekly table — every day of the current week at a glance, so
// gaps in logging/daily updates are visible before Friday instead of only
// checking one day at a time on the Today tab.
const ThisWeekView = () => {
  const [week, setWeek] = useState(null);

  useEffect(() => {
    api.get('/timesheets/my-week').then(res => setWeek(res.data)).catch(() => {});
  }, []);

  if (!week) return null;

  const today = todayLocal();

  return (
    <Card>
      <h3 className="font-bold text-violet-900 text-sm mb-3">This Week</h3>
      <div className="space-y-1.5">
        {week.days.map((d, i) => {
          const isToday = d.date === today;
          const isFuture = d.date > today;
          return (
            <div key={d.date}
              className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${isToday ? 'bg-violet-50 border border-violet-200' : 'border border-transparent'}`}>
              <span className="w-9 flex-shrink-0 text-xs font-semibold text-violet-400">{DAY_LABELS[i]}</span>
              <span className="w-20 flex-shrink-0 text-xs text-gray-400">{d.date.slice(5)}</span>
              {d.isWeekOff ? (
                <span className="text-xs text-gray-300">Week off</span>
              ) : isFuture ? (
                <span className="text-xs text-gray-300">—</span>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate text-xs text-gray-600">
                    {d.entries.length > 0 ? d.entries.map(e => e.task).join(', ') : 'No tasks logged'}
                  </span>
                  <span className="text-xs text-violet-600 font-medium flex-shrink-0">{d.totalHours}h</span>
                  {d.dailyUpdateSaved ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 flex-shrink-0">Updated</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 flex-shrink-0">No update</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default ThisWeekView;
