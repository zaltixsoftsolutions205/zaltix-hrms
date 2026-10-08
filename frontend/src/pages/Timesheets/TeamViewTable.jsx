import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import EmptyState from '../../components/UI/EmptyState';
import TimesheetCalendar from './TimesheetCalendar';
import WorkCategoryChart from './WorkCategoryChart';

// Manager Team View — department head sees their department's employees,
// read-only. No approve/reject/edit-others controls.
const TeamViewTable = () => {
  const [rows, setRows] = useState([]);
  const [workingDaysInRange, setWorkingDaysInRange] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/timesheets/team');
        setRows(res.data.rows || []);
        setWorkingDaysInRange(res.data.workingDaysInRange || 0);
      } catch {}
      setLoading(false);
    };
    fetch();
  }, []);

  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="text-sm text-violet-600 font-medium hover:underline">
          ← Back to Team View
        </button>
        <h3 className="font-bold text-violet-900">{selected.name}</h3>
        <WorkCategoryChart employeeId={selected._id} />
      </div>
    );
  }

  if (loading) return <Card><p className="text-sm text-violet-400">Loading...</p></Card>;

  return (
    <Card>
      <h3 className="font-bold text-violet-900 text-sm mb-3">Team View</h3>
      {rows.length === 0 ? (
        <EmptyState title="No team members" message="No employees found in your department." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-violet-400 text-left text-xs">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Days Updated</th>
                <th className="py-2 pr-3">Hours</th>
                <th className="py-2 pr-3">Tasks</th>
                <th className="py-2 pr-3">Completed</th>
                <th className="py-2 pr-3">Pending</th>
                <th className="py-2">Productivity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.employee._id} className="border-t border-violet-50 hover:bg-violet-50/50 cursor-pointer"
                  onClick={() => setSelected(r.employee)}>
                  <td className="py-2 pr-3 font-medium text-violet-900">{r.employee.name}</td>
                  <td className="py-2 pr-3">
                    <span className={r.daysUpdated === 0 ? 'text-gray-900 font-medium' : 'text-violet-700'}>
                      {r.daysUpdated}/{workingDaysInRange}
                    </span>
                    {r.daysUpdatedTrend != null && r.daysUpdatedTrend !== 0 && (
                      <span className={`ml-1.5 text-[10px] font-semibold ${r.daysUpdatedTrend > 0 ? 'text-violet-500' : 'text-gray-400'}`}>
                        {r.daysUpdatedTrend > 0 ? '↑' : '↓'}{Math.abs(r.daysUpdatedTrend)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{r.totalHours}h</td>
                  <td className="py-2 pr-3">{r.totalTasks}</td>
                  <td className="py-2 pr-3">{r.completedTasks}</td>
                  <td className="py-2 pr-3">{r.pendingTasks}</td>
                  <td className="py-2">
                    <span className="badge badge-violet">{r.productivityPct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default TeamViewTable;
