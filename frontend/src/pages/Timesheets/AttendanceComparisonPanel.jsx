import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import { formatDate } from '../../utils/helpers';

// Read-only comparison of Attendance office-hours vs Timesheet logged-hours
// for the same day. Consumes existing attendance data; never writes to it.
const AttendanceComparisonPanel = ({ employeeId }) => {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/timesheets/attendance-comparison', { params: employeeId ? { employeeId } : {} });
        setRows(res.data);
      } catch {}
    };
    fetch();
  }, [employeeId]);

  return (
    <Card>
      <h3 className="font-bold text-violet-900 text-sm mb-3">Attendance vs Timesheet Hours</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-violet-400">No data for this month yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-violet-400 text-left">
                <th className="py-1.5 pr-3">Date</th>
                <th className="py-1.5 pr-3 text-right">Office Hours</th>
                <th className="py-1.5 pr-3 text-right">Logged Hours</th>
                <th className="py-1.5 text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.date} className="border-t border-violet-50">
                  <td className="py-1.5 pr-3 text-violet-900">{formatDate(r.date)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.officeHours}h</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.loggedHours}h</td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${r.delta < 0 ? 'text-gray-900' : 'text-violet-600'}`}>
                    {r.delta > 0 ? '+' : ''}{r.delta}h
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

export default AttendanceComparisonPanel;
