import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import DailyHistory from './DailyHistory';
import { verdictTone, verdictLabel, todayLocal } from './timesheetUtils';

const StatusPill = ({ status }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${verdictTone[status]}`}>
    {verdictLabel[status]}
  </span>
);

const thisMonth = () => todayLocal().slice(0, 7);

// Admin/HR: time intelligence across the organisation — actual vs system-estimated
// time per employee and per kind of work, plus the biggest overruns. Clicking an
// employee opens their day-by-day history (read-only).
const IntelligenceDashboard = () => {
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ month: thisMonth(), departmentId: '' });
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    api.get('/admin/departments').then(res => setDepartments(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const [year, month] = filters.month.split('-');
    const params = { month: Number(month), year: Number(year) };
    if (filters.departmentId) params.departmentId = filters.departmentId;
    setData(null);
    api.get('/timesheets/intelligence', { params }).then(res => setData(res.data)).catch(() => setData({ empty: true }));
  }, [filters]);

  if (viewing) return <DailyHistory employeeId={viewing} onBack={() => setViewing(null)} />;
  if (!data) return <Card><p className="text-sm text-violet-400">Loading...</p></Card>;
  if (data.empty) return <Card><p className="text-sm text-violet-400">Could not load intelligence.</p></Card>;

  const { overall } = data;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-3">
          <input type="month" className="input-field w-auto" value={filters.month} max={thisMonth()}
            onChange={e => e.target.value && setFilters(f => ({ ...f, month: e.target.value }))} />
          <select className="input-field w-auto" value={filters.departmentId}
            onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value }))}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Tasks Analysed" value={overall.analysedTasks} />
        <KpiCard label="Actual Hours" value={`${overall.actualHours}h`} />
        <KpiCard label="Estimated Hours" value={`${overall.estimatedHours}h`} />
        <KpiCard label="Time vs Estimate" value={overall.ratioPct != null ? `${overall.ratioPct}%` : '—'}
          color={overall.ratioPct > 120 ? 'red' : 'green'} />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-violet-900">Smart Insights</h3>
        <ul className="space-y-2">
          {data.highlights.map((h, i) => (
            <li key={i} className="rounded-lg bg-violet-50 px-3 py-2 text-xs leading-snug text-violet-800">{h}</li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-gray-400">
          Compares completed tasks only. Estimates are set by the system from how long the same work has taken before.
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-violet-900">Employees — actual vs estimated time</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-violet-400">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Tasks</th>
                <th className="py-2 pr-3">Actual</th>
                <th className="py-2 pr-3">Estimated</th>
                <th className="py-2 pr-3">Over / On / Fast</th>
                <th className="py-2 pr-3">Time vs Est.</th>
                <th className="py-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map(r => (
                <tr key={r.employee._id} onClick={() => setViewing(r.employee._id)}
                  className="cursor-pointer border-t border-violet-50 hover:bg-violet-50/50" title="View daily history">
                  <td className="py-2 pr-3 font-medium text-violet-900">{r.employee.name}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500">{r.employee.department || '—'}</td>
                  <td className="py-2 pr-3">{r.analysedTasks}</td>
                  <td className="py-2 pr-3">{r.actualHours}h</td>
                  <td className="py-2 pr-3">{r.estimatedHours}h</td>
                  <td className="py-2 pr-3 text-xs">
                    <span className="text-rose-600">{r.over}</span> / <span className="text-gray-600">{r.onTarget}</span> / <span className="text-emerald-600">{r.under}</span>
                  </td>
                  <td className="py-2 pr-3 font-semibold">{r.ratioPct != null ? `${r.ratioPct}%` : '—'}</td>
                  <td className="py-2"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-gray-400">Click an employee to see what they posted each day.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-bold text-violet-900">By work category</h3>
          {data.categories.length === 0 ? (
            <p className="text-sm text-violet-400">No completed tasks analysed yet.</p>
          ) : (
            <div className="space-y-2">
              {data.categories.map(c => (
                <div key={c.category} className="flex items-center gap-2 text-xs">
                  <span className="w-28 flex-shrink-0 truncate text-violet-700">{c.category}</span>
                  <span className="flex-1 text-gray-500">{c.actualHours}h of {c.estimatedHours}h est. · {c.analysedTasks} task{c.analysedTasks === 1 ? '' : 's'}</span>
                  <span className={`font-semibold ${c.status === 'over' ? 'text-rose-600' : 'text-emerald-600'}`}>{c.ratioPct}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-bold text-violet-900">Biggest overruns</h3>
          {data.overruns.length === 0 ? (
            <p className="text-sm text-violet-400">No tasks ran over their estimate.</p>
          ) : (
            <div className="space-y-2">
              {data.overruns.map((o, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-2.5 text-xs">
                  <p><span className="font-semibold text-violet-900">{o.employee}</span> — {o.task}</p>
                  <p className="text-gray-500">
                    {o.date} · {o.category}{o.project ? ` · ${o.project}` : ''} · {o.actualHours}h vs {o.estimatedHours}h est.
                    <span className="ml-1 font-semibold text-rose-600">+{o.overBy}h</span>
                  </p>
                  {o.remarks && <p className="mt-0.5 text-gray-400">“{o.remarks}”</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default IntelligenceDashboard;
