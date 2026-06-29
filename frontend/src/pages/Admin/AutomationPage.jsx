import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../../utils/api';
import { formatDate } from '../../utils/helpers';

// ── Tiny helpers ──────────────────────────────────────────────────────────────

const ScoreBar = ({ value, color = 'violet' }) => {
  const colors = {
    violet: 'bg-violet-600',
    green:  'bg-green-500',
    amber:  'bg-amber-500',
    red:    'bg-red-500',
  };
  const c = value >= 85 ? 'green' : value >= 65 ? 'violet' : value >= 50 ? 'amber' : 'red';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
      <motion.div
        className={`h-2 rounded-full ${colors[c]}`}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
};

const ScoreBadge = ({ score }) => {
  if (score === null || score === undefined) return <span className="text-gray-400 text-xs">N/A</span>;
  const cls = score >= 85 ? 'bg-green-100 text-green-700' : score >= 65 ? 'bg-violet-100 text-violet-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{score}%</span>;
};

const SectionCard = ({ title, icon, count, countColor = 'text-violet-700', children }) => (
  <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4 border-b border-violet-50">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      {count !== undefined && (
        <span className={`text-sm font-bold ${countColor}`}>{count}</span>
      )}
    </div>
    <div className="divide-y divide-gray-50">{children}</div>
  </div>
);

const EmptyRow = ({ msg }) => (
  <div className="px-5 py-4 text-sm text-gray-400 text-center">{msg}</div>
);

const JobButton = ({ label, jobKey, onRun, loading }) => (
  <button
    onClick={() => onRun(jobKey)}
    disabled={loading === jobKey}
    className="text-xs px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium border border-violet-200 disabled:opacity-50 transition-colors"
  >
    {loading === jobKey ? 'Running...' : label}
  </button>
);

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jobLoading, setJobLoading] = useState(null);
  const [jobMsg, setJobMsg] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/automation/dashboard');
      setData(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const runJob = async (job) => {
    setJobLoading(job);
    setJobMsg('');
    try {
      const res = await api.post(`/automation/run/${job}`);
      setJobMsg(res.data.message);
      await fetchDashboard();
    } catch (err) {
      setJobMsg(err.response?.data?.message || 'Job failed.');
    } finally {
      setJobLoading(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
    </div>
  );

  const { summary, overdueTasks, upcomingTasks, missingCheckouts, staleLeads, pendingDocs, scores, scoresWeek } = data || {};

  const tabs = [
    { id: 'overview',   label: 'Overview' },
    { id: 'tasks',      label: `Tasks ${overdueTasks?.length ? `(${overdueTasks.length} overdue)` : ''}` },
    { id: 'attendance', label: `Attendance ${missingCheckouts?.length ? `(${missingCheckouts.length})` : ''}` },
    { id: 'crm',        label: `CRM ${staleLeads?.length ? `(${staleLeads.length} stale)` : ''}` },
    { id: 'documents',  label: `Docs ${pendingDocs?.length ? `(${pendingDocs.length})` : ''}` },
    { id: 'scores',     label: 'Scores' },
    { id: 'engine',     label: 'Engine' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Automation & Work Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live monitoring of employee work, attendance, and CRM activity.</p>
        </div>
        <button onClick={fetchDashboard} className="text-xs px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors">
          Refresh
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Employees', value: summary?.totalEmployees, color: 'text-violet-700', bg: 'bg-violet-50' },
          { label: 'Active Tasks',     value: summary?.totalActiveTasks, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Overdue Tasks',    value: summary?.totalOverdue, color: summary?.totalOverdue > 0 ? 'text-red-600' : 'text-green-600', bg: summary?.totalOverdue > 0 ? 'bg-red-50' : 'bg-green-50' },
          { label: `Avg Score (${summary?.weekLabel || ''})`, value: summary?.avgScore != null ? `${summary.avgScore}%` : '—', color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 border border-white`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value ?? '—'}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b border-gray-100 pb-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${activeTab === t.id ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-violet-600 hover:bg-violet-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Overdue tasks snapshot */}
          <SectionCard title="Overdue Tasks" icon="⏰" count={overdueTasks?.length} countColor="text-red-600">
            {overdueTasks?.length === 0 && <EmptyRow msg="No overdue tasks" />}
            {overdueTasks?.slice(0, 5).map(t => (
              <div key={t._id} className="px-5 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400">{t.assignedTo?.name} · Due {formatDate(t.deadline)}</p>
                </div>
                <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${t.priority === 'high' ? 'bg-red-100 text-red-600' : t.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.priority}
                </span>
              </div>
            ))}
          </SectionCard>

          {/* Missing checkouts */}
          <SectionCard title="Missing Checkouts Today" icon="🕐" count={missingCheckouts?.length} countColor={missingCheckouts?.length > 0 ? 'text-amber-600' : 'text-green-600'}>
            {missingCheckouts?.length === 0 && <EmptyRow msg="All employees checked out" />}
            {missingCheckouts?.map(r => (
              <div key={r._id} className="px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-800">{r.employee?.name}</p>
                <span className="text-xs text-gray-400">In: {r.checkIn}</span>
              </div>
            ))}
          </SectionCard>

          {/* Stale CRM leads */}
          <SectionCard title="Stale CRM Leads" icon="📞" count={staleLeads?.length} countColor={staleLeads?.length > 0 ? 'text-amber-600' : 'text-green-600'}>
            {staleLeads?.length === 0 && <EmptyRow msg="All leads are being followed up" />}
            {staleLeads?.slice(0, 5).map(l => (
              <div key={l._id} className="px-5 py-3">
                <p className="text-sm font-medium text-gray-800">{l.name}</p>
                <p className="text-xs text-gray-400">{l.assignedTo?.name} · Last update {formatDate(l.updatedAt)}</p>
              </div>
            ))}
          </SectionCard>

          {/* Top 5 scores */}
          <SectionCard title={`Top Performers — ${scoresWeek}`} icon="🌟">
            {scores?.length === 0 && <EmptyRow msg="No scores yet. Run the weekly job." />}
            {scores?.slice(0, 5).map(s => (
              <div key={s._id} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-800">{s.employee?.name}</p>
                  <ScoreBadge score={s.totalScore} />
                </div>
                <ScoreBar value={s.totalScore} />
              </div>
            ))}
          </SectionCard>
        </div>
      )}

      {/* ── TASKS TAB ── */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <SectionCard title="Overdue Tasks" icon="⏰" count={overdueTasks?.length} countColor="text-red-600">
            {overdueTasks?.length === 0 && <EmptyRow msg="No overdue tasks" />}
            {overdueTasks?.map(t => (
              <div key={t._id} className="px-5 py-3 grid grid-cols-3 gap-2 items-center">
                <div className="col-span-2 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400">
                    {t.assignedTo?.name} ({t.assignedTo?.employeeId}) · Assigned by {t.assignedBy?.name}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-red-600 font-medium block">Due {formatDate(t.deadline)}</span>
                  <span className={`text-xs ${t.status === 'not-started' ? 'text-gray-500' : 'text-blue-500'}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Due in Next 48 Hours" icon="⚡" count={upcomingTasks?.length} countColor="text-amber-600">
            {upcomingTasks?.length === 0 && <EmptyRow msg="No tasks due in next 48 hours" />}
            {upcomingTasks?.map(t => (
              <div key={t._id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{t.title}</p>
                  <p className="text-xs text-gray-400">{t.assignedTo?.name} · {t.status}</p>
                </div>
                <span className="text-xs text-amber-600 font-medium">{formatDate(t.deadline)}</span>
              </div>
            ))}
          </SectionCard>
        </div>
      )}

      {/* ── ATTENDANCE TAB ── */}
      {activeTab === 'attendance' && (
        <SectionCard title="Missing Checkouts Today" icon="🕐" count={missingCheckouts?.length}>
          {missingCheckouts?.length === 0 && <EmptyRow msg="All employees have checked out today" />}
          {missingCheckouts?.map(r => (
            <div key={r._id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{r.employee?.name}</p>
                <p className="text-xs text-gray-400">Employee ID: {r.employee?.employeeId}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600">Check-in: {r.checkIn}</p>
                <p className="text-xs text-amber-600 font-medium">No checkout</p>
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {/* ── CRM TAB ── */}
      {activeTab === 'crm' && (
        <div className="space-y-4">
          <SectionCard title="Stale Leads (No activity 7+ days)" icon="📞" count={staleLeads?.length} countColor="text-amber-600">
            {staleLeads?.length === 0 && <EmptyRow msg="All leads have recent activity" />}
            {staleLeads?.map(l => (
              <div key={l._id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{l.name}</p>
                  <p className="text-xs text-gray-400">{l.assignedTo?.name} · Status: {l.status} · Pipeline: {l.pipelineStage}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(l.updatedAt)}</span>
              </div>
            ))}
          </SectionCard>
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {activeTab === 'documents' && (
        <SectionCard title="Employees with Pending Documents" icon="📄" count={pendingDocs?.length}>
          {pendingDocs?.length === 0 && <EmptyRow msg="All employee documents are submitted" />}
          {pendingDocs?.map(d => (
            <div key={String(d._id)} className="px-5 py-3">
              <p className="text-sm font-medium text-gray-800">{d.employee?.name} <span className="text-gray-400 font-normal">({d.employee?.employeeId})</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Pending: {d.docs?.join(', ')}</p>
            </div>
          ))}
        </SectionCard>
      )}

      {/* ── SCORES TAB ── */}
      {activeTab === 'scores' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">Productivity scores for <span className="font-medium text-violet-700">{scoresWeek}</span>. Weights: Tasks 40% · Attendance 40% · CRM 20%.</p>
          </div>
          <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-violet-50/60">
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Employee</th>
                  <th className="px-3 py-3 text-center">Total</th>
                  <th className="px-3 py-3 text-center">Tasks</th>
                  <th className="px-3 py-3 text-center">Attendance</th>
                  <th className="px-3 py-3 text-center">CRM</th>
                  <th className="px-5 py-3 text-left">Score Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {scores?.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-400 text-sm">No scores yet. Run the weekly job from the Engine tab.</td></tr>
                )}
                {scores?.map(s => (
                  <tr key={s._id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{s.employee?.name}</p>
                      <p className="text-xs text-gray-400">{s.employee?.role} · {s.employee?.employeeId}</p>
                    </td>
                    <td className="px-3 py-3 text-center"><ScoreBadge score={s.totalScore} /></td>
                    <td className="px-3 py-3 text-center text-gray-600">{s.taskScore}%</td>
                    <td className="px-3 py-3 text-center text-gray-600">{s.attendanceScore}%</td>
                    <td className="px-3 py-3 text-center"><ScoreBadge score={s.crmScore} /></td>
                    <td className="px-5 py-3 min-w-[100px]"><ScoreBar value={s.totalScore} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ENGINE TAB ── */}
      {activeTab === 'engine' && (
        <div className="space-y-4">
          {jobMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">
              {jobMsg}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-violet-50 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Scheduled Jobs</h3>
                <p className="text-xs text-gray-400 mt-0.5">All jobs run <strong>automatically</strong> on their schedule — no manual action needed. "Run Now" is only for testing.</p>
              </div>
              <span className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                Auto-running
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { key: 'tasks',      icon: '⏰', label: 'Task Monitoring',       schedule: 'Every hour',          desc: 'Detects overdue & upcoming deadlines, notifies employees and admins.' },
                { key: 'morning',    icon: '☀️', label: 'Morning Summary',        schedule: 'Mon–Sat at 8:30 AM',  desc: 'Sends each employee their pending tasks and follow-ups for the day.' },
                { key: 'evening',    icon: '🌙', label: 'Evening Summary',        schedule: 'Mon–Sat at 6:30 PM',  desc: 'Sends task completion summary + detects missing check-outs.' },
                { key: 'crm',        icon: '📞', label: 'CRM Alerts',             schedule: 'Mon–Sat at 9:30 AM',  desc: 'Flags stale leads, overdue follow-ups, and sales target alerts.' },
                { key: 'documents',  icon: '📄', label: 'Document Compliance',    schedule: 'Mon–Sat at 9:30 AM',  desc: 'Reminds employees to upload missing onboarding documents.' },
                { key: 'attendance', icon: '📋', label: 'Attendance Pattern',     schedule: 'Every Monday 9:00 AM',desc: 'Checks last 10 days for late/absent patterns and alerts HR.' },
                { key: 'checkout',   icon: '🕐', label: 'Missing Checkout',       schedule: 'Mon–Sat at 6:30 PM',  desc: 'Detects employees who checked in but forgot to check out.' },
                { key: 'scores',     icon: '📊', label: 'Productivity Scores',    schedule: 'Every Monday 9:00 AM',desc: 'Calculates weekly score: Tasks 40% + Attendance 40% + CRM 20%.' },
                { key: 'weekly',     icon: '📈', label: 'Weekly Report',          schedule: 'Every Monday 9:00 AM',desc: 'Sends personal performance report to each employee and team summary to admin.' },
              ].map(({ key, icon, label, schedule, desc }) => (
                <div key={key} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xl mt-0.5 flex-shrink-0">{icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-xs text-violet-600 font-medium">{schedule}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <JobButton label="Run Now" jobKey={key} onRun={runJob} loading={jobLoading} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Score formula */}
          <div className="bg-violet-50 rounded-2xl border border-violet-100 px-5 py-4">
            <h4 className="font-semibold text-violet-800 text-sm mb-3">Productivity Score Formula</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-white rounded-xl p-3 border border-violet-100">
                <p className="font-medium text-gray-700">Task Score (40%)</p>
                <p className="text-xs text-gray-500 mt-1">Tasks completed / total × 100 − (overdue × 5 pts). Neutral 80 if no tasks assigned.</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-violet-100">
                <p className="font-medium text-gray-700">Attendance Score (40%)</p>
                <p className="text-xs text-gray-500 mt-1">Present days / working days × 100 − (late × 5 pts) − (early leave × 3 pts).</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-violet-100">
                <p className="font-medium text-gray-700">CRM Score (20%)</p>
                <p className="text-xs text-gray-500 mt-1">Sales/Admin only. Conversion rate × 60% + follow-up activity rate × 40%. Non-sales roles use 50/50 Tasks/Attendance.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
