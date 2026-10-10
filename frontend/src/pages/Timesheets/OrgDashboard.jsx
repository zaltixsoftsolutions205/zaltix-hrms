import { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import OrgUpdates from './OrgUpdates';

const EMPTY_FILTERS = { departmentId: '', role: '', employeeId: '' };

const Empty = ({ children }) => <p className="text-sm text-violet-400">{children}</p>;

// A person row; clicking the name narrows the whole page to that employee.
const PersonName = ({ id, name, onPick }) => (
  <button type="button" onClick={() => onPick(id)}
    className="font-medium text-violet-900 hover:text-violet-600 hover:underline text-left" title="Show only this employee">
    {name}
  </button>
);

// HR/Admin org-level Timesheet view: totals, work category distribution and the
// day/week updates. Every card and bar opens the detail behind it, and the page can
// be narrowed to a department, role or a single employee.
const OrgDashboard = () => {
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [detail, setDetail] = useState(null);       // which KPI card is open
  const [category, setCategory] = useState(null);   // which category bar is open
  const updatesRef = useRef(null);

  useEffect(() => {
    api.get('/admin/departments').then(res => setDepartments(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get('/timesheets/org', { params }).then(res => setData(res.data)).catch(() => {});
  }, [filters]);

  // Picking a department/role changes who is in the employee list, so clear the person.
  const setScope = (patch) => setFilters(f => ({ ...f, ...patch, employeeId: '' }));

  const pickEmployee = (id) => {
    setFilters(f => ({ ...f, employeeId: id }));
    setDetail(null);
    setCategory(null);
    setTimeout(() => updatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  if (!data) return <Card><p className="text-sm text-violet-400">Loading...</p></Card>;

  const categoryEntries = Object.entries(data.workCategoryDistribution || {}).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(...categoryEntries.map(([, h]) => h), 1);
  const selected = data.employeeOptions.find(e => String(e._id) === String(filters.employeeId));
  const filtered = Object.values(filters).some(Boolean);

  const cards = [
    { key: 'employees', label: 'Total Employees', value: data.totalEmployees },
    { key: 'updated', label: 'Updated Today', value: data.updatedToday, color: 'green' },
    { key: 'missing', label: 'Missing Today', value: data.missingToday, color: 'red' },
    { key: 'hours', label: 'Total Hours', value: `${data.totalHours}h` },
    { key: 'completed', label: 'Completed Tasks', value: data.totalCompletedTasks },
  ];

  const detailTitle = {
    employees: 'All employees',
    updated: 'Updated today — logged work or posted a daily update',
    missing: 'Missing today — nothing logged yet',
    hours: 'Hours logged this month, by employee',
    completed: 'Tasks completed this month',
  }[detail];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-3 flex-wrap items-center">
          <select className="input-field w-auto" value={filters.departmentId}
            onChange={e => setScope({ departmentId: e.target.value })}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select className="input-field w-auto" value={filters.role}
            onChange={e => setScope({ role: e.target.value })}>
            <option value="">All Roles</option>
            <option value="employee">Employee</option>
            <option value="sales">Sales</option>
            <option value="field_sales">Field Sales</option>
            <option value="hr">HR</option>
          </select>
          <select className="input-field w-auto min-w-[200px]" value={filters.employeeId}
            onChange={e => { setFilters(f => ({ ...f, employeeId: e.target.value })); setDetail(null); setCategory(null); }}>
            <option value="">All Employees</option>
            {data.employeeOptions.map(e => (
              <option key={e._id} value={e._id}>{e.name}{e.department ? ` — ${e.department}` : ''}</option>
            ))}
          </select>
          {filtered && (
            <button type="button" className="text-xs font-semibold text-violet-600 hover:underline"
              onClick={() => { setFilters(EMPTY_FILTERS); setDetail(null); setCategory(null); }}>
              Clear filters
            </button>
          )}
        </div>
        {selected && (
          <p className="mt-3 text-xs text-violet-600">
            Showing only <span className="font-semibold">{selected.name}</span>
            {selected.department ? ` (${selected.department})` : ''} — all figures below are for this person.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(c => (
          <button key={c.key} type="button" onClick={() => setDetail(d => (d === c.key ? null : c.key))}
            className={`block w-full text-left rounded-2xl transition ${
              detail === c.key ? 'ring-2 ring-violet-500' : 'hover:ring-1 hover:ring-violet-300'}`}
            title="Click to see the list">
            <KpiCard label={c.label} value={c.value} color={c.color} />
          </button>
        ))}
      </div>

      {detail && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-violet-900 text-sm">{detailTitle}</h3>
            <button type="button" className="text-xs font-semibold text-violet-500 hover:underline" onClick={() => setDetail(null)}>Close</button>
          </div>

          {detail === 'employees' && (data.employeesList.length === 0 ? <Empty>No employees.</Empty> : (
            <div className="divide-y divide-violet-50">
              {data.employeesList.map(e => (
                <div key={e._id} className="py-2 flex items-center gap-3 text-sm">
                  <PersonName id={e._id} name={e.name} onPick={pickEmployee} />
                  <span className="text-xs text-gray-400">{e.employeeId}</span>
                  <span className="text-xs text-gray-500 ml-auto">{e.department || '—'}</span>
                </div>
              ))}
            </div>
          ))}

          {detail === 'updated' && (data.updatedTodayList.length === 0 ? <Empty>Nobody has updated today yet.</Empty> : (
            <div className="divide-y divide-violet-50">
              {data.updatedTodayList.map(e => (
                <div key={e._id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <PersonName id={e._id} name={e.name} onPick={pickEmployee} />
                  <span className="text-xs text-gray-500">{e.department || '—'}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs">
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 font-bold text-violet-700">{e.hours}h</span>
                    <span className="text-gray-500">{e.tasks} task{e.tasks === 1 ? '' : 's'}</span>
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${e.dailyUpdate ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {e.dailyUpdate ? 'Daily update posted' : 'No daily update'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}

          {detail === 'missing' && (data.missingTodayList.length === 0 ? <Empty>Everyone has updated today.</Empty> : (
            <div className="divide-y divide-violet-50">
              {data.missingTodayList.map(e => (
                <div key={e._id} className="py-2 flex items-center gap-3 text-sm">
                  <PersonName id={e._id} name={e.name} onPick={pickEmployee} />
                  <span className="text-xs text-gray-400">{e.employeeId}</span>
                  <span className="text-xs text-gray-500 ml-auto">{e.department || '—'}</span>
                </div>
              ))}
            </div>
          ))}

          {detail === 'hours' && (
            <div className="divide-y divide-violet-50">
              {[...data.workload].sort((a, b) => b.totalHours - a.totalHours).map(w => (
                <div key={w.employeeId} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <PersonName id={(data.employeesList.find(e => e.employeeId === w.employeeId) || {})._id} name={w.employee} onPick={pickEmployee} />
                  <span className="text-xs text-gray-500">{w.department || '—'}</span>
                  <span className="ml-auto flex items-center gap-3 text-xs">
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 font-bold text-violet-700">{w.totalHours}h</span>
                    <span className="text-gray-500">{w.completedTasks}/{w.totalTasks} tasks done</span>
                    <span className="text-gray-500">{w.daysUpdated}/{data.workingDaysInRange} days</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {detail === 'completed' && (data.completedTasks.length === 0 ? <Empty>No completed tasks this month.</Empty> : (
            <div className="divide-y divide-violet-50">
              {data.completedTasks.map((t, i) => (
                <div key={i} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <PersonName id={t.employeeRef} name={t.employee} onPick={pickEmployee} />
                    <span className="text-gray-800">{t.task}</span>
                    <span className="ml-auto rounded bg-violet-50 px-1.5 py-0.5 text-xs font-bold text-violet-700">{t.hours}h</span>
                  </div>
                  <p className="text-xs text-gray-500">{t.date} · {t.category}{t.project ? ` · ${t.project}` : ''}</p>
                </div>
              ))}
              {data.totalCompletedTasks > data.completedTasks.length && (
                <p className="pt-2 text-xs text-gray-400">Showing the latest {data.completedTasks.length} of {data.totalCompletedTasks}.</p>
              )}
            </div>
          ))}
        </Card>
      )}

      <Card>
        <h3 className="font-bold text-violet-900 text-sm mb-1">Work Category Distribution</h3>
        <p className="text-[11px] text-gray-400 mb-3">Click a bar to see who did that work.</p>
        {categoryEntries.length === 0 ? (
          <Empty>No logged work this month.</Empty>
        ) : (
          <div className="space-y-1.5">
            {categoryEntries.map(([cat, hours]) => {
              const open = category === cat;
              const people = data.categoryBreakdown?.[cat] || [];
              return (
                <div key={cat}>
                  <button type="button" onClick={() => setCategory(open ? null : cat)}
                    className={`w-full flex items-center gap-2 rounded-lg px-1 py-1 text-left transition ${open ? 'bg-violet-50' : 'hover:bg-violet-50/60'}`}>
                    <span className="text-xs text-violet-700 w-28 flex-shrink-0 truncate">{cat}</span>
                    <div className="flex-1 h-4 bg-violet-50 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-600 rounded-full" style={{ width: `${(hours / maxCategory) * 100}%` }} />
                    </div>
                    <span className="text-xs text-violet-500 w-12 text-right flex-shrink-0">{Math.round(hours * 10) / 10}h</span>
                    <span className="text-xs text-violet-400 w-3">{open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <div className="ml-[7.5rem] mr-4 my-1 rounded-lg border border-violet-100 bg-white divide-y divide-violet-50">
                      {people.map(p => (
                        <div key={String(p._id)} className="px-3 py-1.5 flex items-center gap-3 text-sm">
                          <PersonName id={p._id} name={p.employee} onPick={pickEmployee} />
                          <span className="ml-auto flex items-center gap-3 text-xs">
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 font-bold text-violet-700">{p.hours}h</span>
                            <span className="text-gray-500">{p.tasks} task{p.tasks === 1 ? '' : 's'}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div ref={updatesRef}>
        <OrgUpdates departmentId={filters.departmentId} role={filters.role} employeeId={filters.employeeId} />
      </div>

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
