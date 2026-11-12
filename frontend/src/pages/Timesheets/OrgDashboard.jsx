import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import OrgUpdates from './OrgUpdates';

// HR/Admin org-level Timesheet view: totals, missing updates, work category
// distribution, workload table, blockers list. Filterable by department/role.
const OrgDashboard = () => {
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ departmentId: '', role: '' });

  useEffect(() => {
    api.get('/admin/departments').then(res => setDepartments(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const params = {};
        if (filters.departmentId) params.departmentId = filters.departmentId;
        if (filters.role) params.role = filters.role;
        const res = await api.get('/timesheets/org', { params });
        setData(res.data);
      } catch {}
    };
    fetch();
  }, [filters]);

  if (!data) return <Card><p className="text-sm text-violet-400">Loading...</p></Card>;

  const categoryEntries = Object.entries(data.workCategoryDistribution || {}).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(...categoryEntries.map(([, h]) => h), 1);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-3 flex-wrap">
          <select className="input-field w-auto" value={filters.departmentId}
            onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value }))}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select className="input-field w-auto" value={filters.role}
            onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}>
            <option value="">All Roles</option>
            <option value="employee">Employee</option>
            <option value="sales">Sales</option>
            <option value="field_sales">Field Sales</option>
            <option value="hr">HR</option>
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Employees" value={data.totalEmployees} />
        <KpiCard label="Updated Today" value={data.updatedToday} color="green" />
        <KpiCard label="Missing Today" value={data.missingToday} color="red" />
        <KpiCard label="Total Hours" value={`${data.totalHours}h`} />
        <KpiCard label="Completed Tasks" value={data.totalCompletedTasks} />
      </div>

      <Card>
        <h3 className="font-bold text-violet-900 text-sm mb-3">Work Category Distribution</h3>
        {categoryEntries.length === 0 ? (
          <p className="text-sm text-violet-400">No logged work this month.</p>
        ) : (
          <div className="space-y-2">
            {categoryEntries.map(([cat, hours]) => (
              <div key={cat} className="flex items-center gap-2">
                <span className="text-xs text-violet-700 w-28 flex-shrink-0 truncate">{cat}</span>
                <div className="flex-1 h-4 bg-violet-50 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full" style={{ width: `${(hours / maxCategory) * 100}%` }} />
                </div>
                <span className="text-xs text-violet-500 w-12 text-right flex-shrink-0">{Math.round(hours * 10) / 10}h</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <OrgUpdates departmentId={filters.departmentId} role={filters.role} />

      {data.blockers.length > 0 && (
        <Card>
          <h3 className="font-bold text-violet-900 text-sm mb-3">Blockers</h3>
          <div className="space-y-2">
            {data.blockers.map((b, i) => (
              <div key={i} className="p-3 border border-gray-200 rounded-lg text-sm">
                <span className="font-medium text-violet-900">{b.employee}</span> — {b.task}
                <p className="text-xs text-gray-500 mt-1">{b.date} · {b.blocker}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default OrgDashboard;
