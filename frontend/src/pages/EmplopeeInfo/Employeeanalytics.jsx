import { useState, useEffect, useMemo, useRef } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';
import api from '../../utils/api';
import { getOverview, getEmployeeDistribution, getDepartmentDistribution, getJoiningTrend, getSalaryAnalysis, getExperienceAnalysis, getStatusAnalysis, getMissingInformation, getRoleDistribution, getDepartmentHealth, getPerformanceAnalysis, } from '../../utils/employeeAnalytics';

/* ── Shared icon primitive — mirrors the Ico component in HREmployees.jsx ── */
const Ico = ({ d, d2, className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  check: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0',
  x: 'M18 6L6 18M6 6l12 12',
  grad: 'M22 10v6M2 10l10-5 10 5-10 5-10-5zM6 12v5c3 3 9 3 12 0v-5',
  building: 'M3 21h18M6 21V7l6-4 6 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  pie: 'M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z',
  rupee: 'M6 3h12M6 8h12M6 3c0 6 8 5 8 10 0 3-3 5-8 5m8-10l-8 10',
  trend: 'M23 6l-9.5 9.5-5-5L1 18',
  alert: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  award: 'M12 15a7 7 0 100-14 7 7 0 000 14zM8.21 13.89L7 23l5-3 5 3-1.21-9.12',
  briefcase: 'M20 7h-4V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2',
  layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  target: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
};

// Violet-forward palette so charts read as part of the same app.
const COLORS = ['#7c3aed', '#a78bfa', '#f59e0b', '#c4b5fd', '#ede9fe', '#6d28d9'];

const currency = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Grade badge classes stay in the app's existing palette (violet / amber /
// neutral gray) — no red, matching how HREmployees.jsx handles negative
// states (e.g. the "Reject" button uses gray, not red).
const GRADE_TONE_CLASSES = {
  excellent: 'bg-violet-100 text-violet-700',
  good: 'bg-violet-50 text-violet-600',
  average: 'bg-amber-100 text-amber-700',
  poor: 'bg-gray-100 text-gray-700',
};

/* ── Card shells — reuse the exact card language from HREmployees.jsx ── */
function Section({ title, icon, subtitle, children, className = '' }) {
  return (
    <div className={`bg-white border border-violet-100 rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow duration-200 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
            <Ico d={icon} className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-violet-900">{title}</h3>
            {subtitle && <p className="text-xs text-violet-400">{subtitle}</p>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, accent = 'violet' }) {
  const accents = {
    violet: 'bg-violet-100 text-violet-600',
    amber: 'bg-amber-100 text-amber-600',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <div className="bg-white border border-violet-100 rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accents[accent]}`}>
          <Ico d={icon} className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-violet-900 mt-3 leading-none">{value}</p>
      <p className="text-xs text-violet-500 mt-1">{label}</p>
    </div>
  );
}

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-violet-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-violet-900 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-violet-600">
          <span className="font-semibold">{p.name}: </span>
          {formatter ? formatter(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

function EmptyState({ label = 'No data available yet' }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-300 flex items-center justify-center mb-2">
        <Ico d={ICONS.pie} className="w-5 h-5" />
      </div>
      <p className="text-xs text-violet-400">{label}</p>
    </div>
  );
}

/* ── Main page ── */
export default function EmployeeAnalytics({ employees }) {
  const isLoading = employees === undefined || employees === null;
  const data = useMemo(() => employees || [], [employees]);

  const overview = useMemo(() => getOverview(data), [data]);
  const employeeDist = useMemo(() => getEmployeeDistribution(data), [data]);
  const deptDist = useMemo(() => getDepartmentDistribution(data), [data]);
  const joiningTrend = useMemo(() => getJoiningTrend(data), [data]);
  const salary = useMemo(() => getSalaryAnalysis(data), [data]);
  const experience = useMemo(() => getExperienceAnalysis(data), [data]);
  const status = useMemo(() => getStatusAnalysis(data), [data]);
  const missing = useMemo(() => getMissingInformation(data), [data]);
  const roleDist = useMemo(() => getRoleDistribution(data), [data]);
  const deptHealth = useMemo(() => getDepartmentHealth(data), [data]);

  /* ── Performance data — fetched from the EXISTING per-employee route ──
     GET /automation/scores/:employeeId (same one TabContent.jsx already
     calls for a single employee's Performance tab). There is no bulk
     endpoint today, so this fires one request per employee in parallel.
     Fine for typical HR headcounts; if the org grows into the thousands,
     a bulk GET /automation/scores?ids=... route would be worth adding
     later — not created here since it wasn't requested. */
  const [scoresMap, setScoresMap] = useState(new Map());
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (data.length === 0) {
      setScoresMap(new Map());
      return;
    }
    const requestId = ++requestIdRef.current;
    setPerformanceLoading(true);

    Promise.allSettled(
      data.map((e) => api.get(`/automation/scores/${e._id}`).then((res) => [e._id, res.data]))
    ).then((results) => {
      if (requestId !== requestIdRef.current) return; // stale — employees list changed mid-flight
      const map = new Map();
      results.forEach((r) => {
        if (r.status !== 'fulfilled') return; // employee has no score record yet — treated as pending
        const [employeeId, payload] = r.value;
        const latest = payload?.scores?.[0];
        if (latest) map.set(employeeId, latest);
      });
      setScoresMap(map);
      setPerformanceLoading(false);
    });
  }, [data]);

  const performance = useMemo(() => getPerformanceAnalysis(data, scoresMap), [data, scoresMap]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-violet-50 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 rounded-2xl bg-violet-50 animate-pulse" />
          <div className="h-72 rounded-2xl bg-violet-50 animate-pulse" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-violet-100 rounded-2xl shadow-sm p-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-500 flex items-center justify-center mx-auto mb-3">
          <Ico d={ICONS.users} className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-violet-900">No employee data to analyze yet</p>
        <p className="text-xs text-violet-400 mt-1">Add employees from the "All-Employees" tab to see analytics here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── 1. Overview Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Total Employees" value={overview.total} icon={ICONS.users} accent="violet" />
        <StatCard label="Active" value={overview.active} icon={ICONS.check} accent="violet" />
        <StatCard label="Inactive" value={overview.inactive} icon={ICONS.x} accent="gray" />
        <StatCard label="Interns" value={overview.interns} icon={ICONS.grad} accent="amber" />
        <StatCard label="Freshers" value={overview.freshers} icon={ICONS.briefcase} accent="violet" />
        <StatCard label="Experienced" value={overview.experienced} icon={ICONS.award} accent="violet" />
        <StatCard label="Departments" value={overview.departments} icon={ICONS.building} accent="violet" />
        <StatCard label="Joined This Month" value={overview.joinedThisMonth} icon={ICONS.calendar} accent="amber" />
      </div>

      {/* ── 2 & 3. Distribution + Department bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Employee Distribution" subtitle="Freshers · Experienced · Interns" icon={ICONS.pie}>
          {employeeDist.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={employeeDist} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {employeeDist.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Department Wise Employees" subtitle="Headcount per department" icon={ICONS.building}>
          {deptDist.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptDist} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8b5cf6' }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8b5cf6' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f3ff' }} />
                <Bar dataKey="count" name="Employees" fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* ── 4. Joining Trend ── */}
      <Section title="Employee Joining Trend" subtitle="New joiners over the last 12 months" icon={ICONS.trend}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={joiningTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="joiningTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8b5cf6' }} interval={1} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8b5cf6' }} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="count" name="Joined" stroke="#7c3aed" strokeWidth={2} fill="url(#joiningTrendFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      {/* ── 5. Salary Analysis ── */}
      <Section title="Salary Analysis" subtitle={`Based on ${salary.count} employee${salary.count === 1 ? '' : 's'} with salary set`} icon={ICONS.rupee}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-violet-50/60 border border-violet-100 p-3">
            <p className="text-xs text-violet-500">Highest Salary</p>
            <p className="text-lg font-bold text-violet-900 mt-1">{currency(salary.highest)}</p>
          </div>
          <div className="rounded-xl bg-violet-50/60 border border-violet-100 p-3">
            <p className="text-xs text-violet-500">Lowest Salary</p>
            <p className="text-lg font-bold text-violet-900 mt-1">{currency(salary.lowest)}</p>
          </div>
          <div className="rounded-xl bg-violet-50/60 border border-violet-100 p-3">
            <p className="text-xs text-violet-500">Average Salary</p>
            <p className="text-lg font-bold text-violet-900 mt-1">{currency(salary.average)}</p>
          </div>
          <div className="rounded-xl bg-violet-100/70 border border-violet-200 p-3">
            <p className="text-xs text-violet-600">Total Payroll</p>
            <p className="text-lg font-bold text-violet-900 mt-1">{currency(salary.totalPayroll)}</p>
          </div>
        </div>
      </Section>

      {/* ── 6 & 7. Experience + Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Experience Analysis" subtitle="Tenure at this company (by joining date)" icon={ICONS.layers}>
          {experience.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={experience} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} paddingAngle={2}>
                  {experience.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Status Analysis" subtitle="Active vs inactive accounts" icon={ICONS.check}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={status} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                <Cell fill="#7c3aed" />
                <Cell fill="#e5e7eb" />
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* ── 8. Missing Information Report ── */}
      <Section title="Missing Information Report" subtitle={`${missing.totalIncomplete} employee${missing.totalIncomplete === 1 ? '' : 's'} with incomplete records`} icon={ICONS.alert}>
        {missing.rows.length === 0 ? (
          <EmptyState label="Every employee record is complete 🎉" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="max-h-80 overflow-y-auto rounded-xl border border-violet-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-violet-50 z-10">
                  <tr className="text-left text-xs font-semibold text-violet-600">
                    <th className="px-3 py-2">Employee ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Missing Fields</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-50">
                  {missing.rows.map((r) => (
                    <tr key={r._id} className="hover:bg-violet-50/50 transition-colors">
                      <td className="px-3 py-2 text-violet-900 font-medium whitespace-nowrap">{r.employeeId}</td>
                      <td className="px-3 py-2 text-violet-800 whitespace-nowrap">{r.name}</td>
                      <td className="px-3 py-2 text-violet-500 whitespace-nowrap">{r.department}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.missing.map((m) => (
                            <span key={m} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* ── 9. Performance Summary — backed by GET /automation/scores/:id ── */}
      <Section
        title="Performance Summary"
        subtitle={
          performanceLoading
            ? 'Loading performance scores…'
            : performance.available
              ? `${performance.totalWithScores} employee${performance.totalWithScores === 1 ? '' : 's'} scored · ${performance.totalPending} pending`
              : 'No performance scores recorded yet'
        }
        icon={ICONS.award}
      >
        {performanceLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-violet-50 animate-pulse" />
            ))}
          </div>
        ) : !performance.available ? (
          <EmptyState label="No employees have a performance score yet." />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="rounded-xl bg-violet-50/60 border border-violet-100 p-3">
                <p className="text-xs text-violet-500">Avg. Performance Score</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{performance.avgScore}/100</p>
              </div>
              <div className="rounded-xl bg-violet-100/70 border border-violet-200 p-3">
                <p className="text-xs text-violet-600">Top Performers</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{performance.topPerformersCount}</p>
                <p className="text-[11px] text-violet-400 mt-0.5">Score ≥ 90</p>
              </div>
              <div className="rounded-xl bg-violet-50/60 border border-violet-100 p-3">
                <p className="text-xs text-violet-500">Task Completion</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{performance.taskCompletionRate}%</p>
                <p className="text-[11px] text-violet-400 mt-0.5">{performance.tasksCompletedSum}/{performance.tasksTotalSum} tasks</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs text-amber-600">Attendance Rate</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{performance.attendanceRate}%</p>
                <p className="text-[11px] text-violet-400 mt-0.5">{performance.attendanceDaysSum}/{performance.workingDaysSum} days</p>
              </div>
            </div>

            {/* Ranking bar chart — highest to lowest */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-violet-600 mb-2 flex items-center gap-1.5">
                <Ico d={ICONS.target} className="w-3.5 h-3.5" /> Performance Ranking
              </p>
              <ResponsiveContainer width="100%" height={Math.max(240, performance.chartData.length * 34)}>
                <BarChart data={performance.chartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#8b5cf6' }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#8b5cf6' }} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v}/100`} />} cursor={{ fill: '#f5f3ff' }} />
                  <Bar dataKey="score" name="Score" fill="#7c3aed" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Full performance table */}
            <div className="overflow-x-auto -mx-4 px-4">
              <div className="max-h-80 overflow-y-auto rounded-xl border border-violet-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-violet-50 z-10">
                    <tr className="text-left text-xs font-semibold text-violet-600">
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Score</th>
                      <th className="px-3 py-2">Grade</th>
                      <th className="px-3 py-2">Tasks</th>
                      <th className="px-3 py-2">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-50">
                    {performance.rows.map((r, i) => (
                      <tr key={r._id} className="hover:bg-violet-50/50 transition-colors">
                        <td className="px-3 py-2 text-violet-400 font-medium">#{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <p className="text-violet-900 font-medium">{r.name}</p>
                          <p className="text-[11px] text-violet-400">{r.employeeId}</p>
                        </td>
                        <td className="px-3 py-2 text-violet-500 whitespace-nowrap">{r.department}</td>
                        <td className="px-3 py-2 text-violet-900 font-semibold">{r.score}/100</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${GRADE_TONE_CLASSES[r.gradeTone]}`}>
                            {r.grade}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-violet-600 whitespace-nowrap">{r.tasksCompleted}/{r.tasksTotal}</td>
                        <td className="px-3 py-2 text-violet-600 whitespace-nowrap">{r.attendanceDays}/{r.workingDays} days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* ── 10. Role Distribution ── */}
      <Section title="Role Distribution" subtitle="Headcount per role" icon={ICONS.briefcase}>
        {roleDist.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={Math.max(220, roleDist.length * 40)}>
            <BarChart data={roleDist} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#8b5cf6' }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#8b5cf6' }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f3ff' }} />
              <Bar dataKey="count" name="Employees" fill="#a78bfa" radius={[0, 6, 6, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* ── 11. Department Health ── */}
      <Section title="Department Health" subtitle="Headcount, status split and average salary per department" icon={ICONS.building}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-violet-600 border-b border-violet-100">
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Employees</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Inactive</th>
                <th className="px-3 py-2">Interns</th>
                <th className="px-3 py-2">Avg. Salary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-50">
              {deptHealth.map((row) => (
                <tr key={row.department} className="hover:bg-violet-50/50 transition-colors">
                  <td className="px-3 py-2 font-semibold text-violet-900 whitespace-nowrap">{row.department}</td>
                  <td className="px-3 py-2 text-violet-700">{row.employees}</td>
                  <td className="px-3 py-2 text-violet-700">{row.active}</td>
                  <td className="px-3 py-2 text-violet-400">{row.inactive}</td>
                  <td className="px-3 py-2 text-amber-600 font-medium">{row.interns}</td>
                  <td className="px-3 py-2 text-violet-700">{currency(row.avgSalary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}