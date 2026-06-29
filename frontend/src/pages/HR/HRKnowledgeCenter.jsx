import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../../utils/api';

const CATEGORIES = [
  { value: 'company_overview',    label: 'Company Overview',    bg: 'bg-violet-100', text: 'text-violet-700' },
  { value: 'department_training', label: 'Department Training', bg: 'bg-blue-100',   text: 'text-blue-700'   },
  { value: 'work_processes',      label: 'Work Processes',      bg: 'bg-emerald-100',text: 'text-emerald-700'},
  { value: 'tool_tutorials',      label: 'Tool Tutorials',      bg: 'bg-orange-100', text: 'text-orange-700' },
  { value: 'product_training',    label: 'Product Training',    bg: 'bg-amber-100',  text: 'text-amber-700'  },
];

function CatChip({ value }) {
  const c = CATEGORIES.find(c => c.value === value) || CATEGORIES[0];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export default function HRKnowledgeCenter() {
  const [report, setReport]   = useState([]);
  const [topics, setTopics]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [tab, setTab]         = useState('progress'); // progress | topics
  const [sortBy, setSortBy]   = useState('name');     // name | progress | role

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, topicsRes] = await Promise.all([
        api.get('/kt/progress/report'),
        api.get('/kt'),
      ]);
      setReport(reportRes.data.data || []);
      setTopics(topicsRes.data.data || []);
    } catch {/* ignore */} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredReport = report
    .filter(r => !search || r.employee.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'progress') return b.percentage - a.percentage;
      if (sortBy === 'role')     return a.employee.role.localeCompare(b.employee.role);
      return a.employee.name.localeCompare(b.employee.name);
    });

  const totalEmployees   = report.length;
  const fullyCompleted   = report.filter(r => r.percentage === 100).length;
  const avgProgress      = totalEmployees ? Math.round(report.reduce((s, r) => s + r.percentage, 0) / totalEmployees) : 0;
  const notStarted       = report.filter(r => r.completed === 0).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Knowledge Center — HR View</h1>
          <p className="text-xs text-gray-400 mt-0.5">Track employee training progress and onboarding completion</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: totalEmployees, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Fully Completed', value: fullyCompleted, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Avg Progress', value: `${avgProgress}%`, color: 'text-violet-700', bg: 'bg-violet-50' },
          { label: 'Not Started', value: notStarted, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-2xl p-4 border border-white`}>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{card.label}</p>
            <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[['progress', 'Employee Progress'], ['topics', 'All Topics']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-all ${tab === v ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'progress' ? (
        <>
          {/* Filters */}
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative">
              <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white w-44 focus:outline-none focus:border-violet-400" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:border-violet-400">
              <option value="name">Sort by Name</option>
              <option value="progress">Sort by Progress</option>
              <option value="role">Sort by Role</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filteredReport.length} employees</span>
          </div>

          {/* Progress table */}
          {loading ? (
            <div className="text-center text-gray-400 py-20 text-sm">Loading…</div>
          ) : filteredReport.length === 0 ? (
            <div className="text-center text-gray-400 py-20 text-sm">No employees found</div>
          ) : (
            <div className="space-y-2">
              {filteredReport.map((r, idx) => (
                <motion.div key={r.employee._id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                  className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {r.employee.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-gray-900">{r.employee.name}</p>
                      <span className="text-[10px] text-gray-400 capitalize bg-gray-100 px-2 py-0.5 rounded-full">
                        {r.employee.role?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400">{r.employee.employeeId}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${r.percentage === 100 ? 'bg-emerald-500' : r.percentage >= 50 ? 'bg-amber-500' : r.percentage > 0 ? 'bg-violet-500' : 'bg-red-300'}`}
                          style={{ width: `${r.percentage}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-10 text-right flex-shrink-0 ${r.percentage === 100 ? 'text-emerald-600' : r.percentage >= 50 ? 'text-amber-600' : r.percentage > 0 ? 'text-violet-600' : 'text-red-500'}`}>
                        {r.percentage}%
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.completed} of {r.total} topics</p>
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    {r.percentage === 100 ? (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Complete</span>
                    ) : r.completed === 0 ? (
                      <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">Not Started</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">In Progress</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* ── Topics tab ── */
        <div className="space-y-3">
          {topics.length === 0 ? (
            <div className="text-center text-gray-400 py-20 text-sm">No topics created yet. Ask admin to add training materials.</div>
          ) : (
            topics.map(t => (
              <div key={t._id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                    <CatChip value={t.category} />
                    {t.isRequired && (
                      <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Required</span>
                    )}
                  </div>
                  {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {t.estimatedDuration} min ·{' '}
                    {t.assignedRoles?.length ? t.assignedRoles.join(', ') : 'All roles'} ·{' '}
                    {t.attachments?.length || 0} attachment{t.attachments?.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-900">{t.progress?.completed ? '✓' : '–'}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
