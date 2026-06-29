import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/UI/Spinner';
import { formatCurrency, formatDate } from '../../utils/helpers';
import AnnouncementWidget from '../../components/UI/AnnouncementWidget';
import HolidayWidget from '../../components/UI/HolidayWidget';
import toast from 'react-hot-toast';

/* ── Icon helper ── */
const Icon = ({ d, size = 16, className = '', strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

/* ── Icon paths ── */
const IC = {
  users:      "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  phone:      "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  calendar:   "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  video:      "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  doc:        "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  deal:       "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  client:     "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  chart:      "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  money:      "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  task:       "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  check:      "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  trash:      "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  clock:      "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  arrow:      "M13 7l5 5m0 0l-5 5m5-5H6",
  plus:       "M12 4v16m8-8H4",
  lead:       "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  building:   "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  lightning:  "M13 10V3L4 14h7v7l9-11h-7z",
};

/* ── Duration helpers ── */
const DURATION_OPTS = [
  { label: 'No Timer', value: '' },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: '8 hours', value: 480 },
  { label: '1 day', value: 1440 },
  { label: '2 days', value: 2880 },
  { label: '1 week', value: 10080 },
];

const fmtDuration = (mins) => {
  if (!mins) return '';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${mins / 60}h`;
  if (mins < 10080) return `${mins / 1440}d`;
  return `${mins / 10080}w`;
};

/* ── Live countdown hook ── */
const useCountdown = (startedAt, durationMins) => {
  const [left, setLeft] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!startedAt || !durationMins) { setLeft(null); return; }
    const tick = () => {
      const endsAt = new Date(startedAt).getTime() + durationMins * 60000;
      setLeft(Math.max(0, endsAt - Date.now()));
    };
    tick();
    ref.current = setInterval(tick, 1000);
    return () => clearInterval(ref.current);
  }, [startedAt, durationMins]);
  return left;
};

const fmtMs = (ms) => {
  if (ms == null) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sc}s`;
  return `${sc}s`;
};

const CountdownBadge = ({ task }) => {
  const ms = useCountdown(task.startedAt, task.duration);
  if (!task.duration || task.status !== 'in-progress' || ms == null) return null;
  const expired = ms === 0;
  const urgent = !expired && ms < task.duration * 60000 * 0.2;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
      expired ? 'bg-red-100 text-red-600 animate-pulse'
      : urgent ? 'bg-amber-100 text-amber-600 animate-pulse'
      : 'bg-violet-100 text-violet-600'
    }`}>
      {expired ? 'Expired' : fmtMs(ms)}
    </span>
  );
};

const priorityStyle = {
  high:   { bg: 'bg-red-50',   text: 'text-red-600',   dot: 'bg-red-400',   label: 'High' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400', label: 'Med' },
  low:    { bg: 'bg-gray-100', text: 'text-gray-500',  dot: 'bg-gray-300',  label: 'Low' },
};
const statusCycle = { 'not-started': 'in-progress', 'in-progress': 'completed', 'completed': 'not-started' };
const statusStyle = {
  'not-started': { dot: 'bg-gray-300',   ring: 'ring-gray-300' },
  'in-progress': { dot: 'bg-amber-400',  ring: 'ring-amber-400' },
  'completed':   { dot: 'bg-violet-500', ring: 'ring-violet-500' },
};

/* ── Week start (Monday) ── */
const getWeekStart = () => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
};

/* ── KPI card — outlined icon left · number right · label below ── */
const WeeklyKPI = ({ label, value, icon, color, to, className = '' }) => {
  const cls = {
    violet: 'bg-violet-50 text-violet-500',
    blue:   'bg-blue-50   text-blue-500',
    indigo: 'bg-indigo-50 text-indigo-500',
    amber:  'bg-amber-50  text-amber-500',
    slate:  'bg-slate-50  text-slate-500',
    green:  'bg-emerald-50 text-emerald-500',
    rose:   'bg-rose-50   text-rose-500',
  }[color] || 'bg-violet-50 text-violet-500';

  const inner = (
    <div className="bg-white border border-gray-100 rounded-2xl px-4 py-4 hover:shadow-md hover:border-violet-100 transition-all duration-150 cursor-pointer group">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
          <Icon d={icon} size={14} sw={1.75} />
        </span>
        <span className="text-base font-extrabold text-gray-900 tabular-nums leading-none group-hover:text-violet-700 transition-colors">
          {value ?? 0}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 font-medium leading-none truncate">{label}</p>
    </div>
  );
  return to ? <Link to={to} className={`block ${className}`}>{inner}</Link> : <div className={className}>{inner}</div>;
};

/* ── Stat card (bottom stats row) ── */
const StatCard = ({ label, value, icon, color, to, sub }) => {
  const c = {
    violet: { iconBg: 'bg-violet-50 text-violet-600', val: 'text-gray-900' },
    amber:  { iconBg: 'bg-amber-50  text-amber-600',  val: 'text-gray-900' },
    green:  { iconBg: 'bg-emerald-50 text-emerald-600', val: 'text-gray-900' },
    red:    { iconBg: 'bg-red-50    text-red-500',    val: 'text-gray-900' },
    blue:   { iconBg: 'bg-blue-50   text-blue-600',   val: 'text-gray-900' },
  }[color] || { iconBg: 'bg-violet-50 text-violet-600', val: 'text-gray-900' };

  const inner = (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-none ${c.val}`}>{value ?? '—'}</p>
        <p className="text-xs text-gray-400 mt-0.5 font-medium truncate">{label}</p>
        {sub && <p className="text-[10px] text-gray-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
};

/* ══════════════════════════════ MAIN COMPONENT ═══════════════════════════════ */
const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats]           = useState(null);
  const [payroll, setPayroll]       = useState(null);
  const [crmReport, setCrmReport]   = useState(null);
  const [allLeads, setAllLeads]     = useState([]);
  const [deals, setDeals]           = useState([]);
  const [clients, setClients]       = useState([]);
  const [finance, setFinance]       = useState(null);
  const [prevFinance, setPrevFinance] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [automationData, setAutomationData] = useState(null);
  const [showIntelBanner, setShowIntelBanner] = useState(false);

  /* tasks */
  const [myTasks, setMyTasks]           = useState([]);
  const [taskFilter, setTaskFilter]     = useState('active');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm]         = useState({ title: '', priority: 'medium', deadline: '', duration: '' });
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [activeFocus, setActiveFocus]   = useState(null);

  const fetchMyTasks  = () => api.get('/tasks/my').then(r => setMyTasks(r.data.tasks || [])).catch(() => {});
  const fetchFocus    = () => api.get('/tasks/active-self').then(r => setActiveFocus(r.data || null)).catch(() => setActiveFocus(null));

  useEffect(() => {
    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const pm    = month === 1 ? 12 : month - 1;
    const py    = month === 1 ? year - 1 : year;

    Promise.all([
      api.get('/admin/dashboard-stats').then(r => setStats(r.data)).catch(() => {}),
      api.get(`/admin/reports/payroll?month=${month}&year=${year}`).then(r => setPayroll(r.data)).catch(() => {}),
      api.get('/admin/reports/crm').then(r => setCrmReport(r.data)).catch(() => {}),
      api.get('/leads').then(r => setAllLeads(r.data?.leads || r.data || [])).catch(() => {}),
      api.get('/deals').then(r => setDeals(r.data?.deals || r.data || [])).catch(() => {}),
      api.get('/clients').then(r => setClients(r.data || [])).catch(() => {}),
      api.get(`/finance/dashboard?month=${month}&year=${year}`).then(r => setFinance(r.data)).catch(() => {}),
      api.get(`/finance/dashboard?month=${pm}&year=${py}`).then(r => setPrevFinance(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));

    fetchMyTasks();
    fetchFocus();
    api.get('/automation/dashboard').then(r => setAutomationData(r.data)).catch(() => {});
  }, []);

  /* ── Work Intelligence: show banner after 30s, auto-hide after 8s ── */
  useEffect(() => {
    const showTimer = setTimeout(() => {
      setShowIntelBanner(true);
      const hideTimer = setTimeout(() => setShowIntelBanner(false), 8000);
      return () => clearTimeout(hideTimer);
    }, 30000);
    return () => clearTimeout(showTimer);
  }, []);

  /* ── weekly metrics ── */
  const weekStart = getWeekStart();
  const weekLeads        = allLeads.filter(l => new Date(l.createdAt) >= weekStart);
  const weekActivities   = allLeads.flatMap(l => (l.activities || []).filter(a => new Date(a.date || a.createdAt) >= weekStart));
  const weekCallsMade    = weekActivities.filter(a => a.type === 'call').length;
  const weekMeetings     = weekActivities.filter(a => a.type === 'meeting').length;
  const weekDemos        = weekActivities.filter(a => ['demo', 'Demo'].includes(a.type)).length;
  const weekProposals    = weekActivities.filter(a => a.type === 'proposal' || (a.notes && a.notes.toLowerCase().includes('proposal'))).length;
  const weekDeals        = deals.filter(d => d.status === 'won' && new Date(d.updatedAt || d.createdAt) >= weekStart).length;
  const activeClients    = clients.filter(c => c.status === 'active').length || clients.length;

  /* ── finance derived ── */
  const netProfit   = finance?.profit ?? null;
  const prevProfit  = prevFinance?.profit ?? null;
  const profitGrowth = netProfit != null && prevProfit != null && prevProfit !== 0
    ? ((netProfit - prevProfit) / Math.abs(prevProfit)) * 100 : null;
  const isGrowing   = profitGrowth != null ? profitGrowth >= 0 : null;

  /* ── task handlers ── */
  const focusLocked = activeFocus && taskForm.duration;

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !taskForm.deadline) return toast.error('Title and deadline required');
    if (focusLocked) return toast.error('Complete your active timed task first.');
    setTaskSubmitting(true);
    try {
      const payload = { title: taskForm.title, priority: taskForm.priority, deadline: taskForm.deadline, assignedTo: user._id, description: '' };
      if (taskForm.duration) payload.duration = Number(taskForm.duration);
      await api.post('/tasks', payload);
      toast.success('Task added');
      setTaskForm({ title: '', priority: 'medium', deadline: '', duration: '' });
      setShowTaskForm(false);
      fetchMyTasks(); fetchFocus();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setTaskSubmitting(false); }
  };

  const handleStatusToggle = async (task) => {
    const next = statusCycle[task.status];
    try {
      await api.put(`/tasks/${task._id}/status`, { status: next });
      setMyTasks(prev => prev.map(t => t._id === task._id
        ? { ...t, status: next, startedAt: next === 'in-progress' ? new Date().toISOString() : t.startedAt }
        : t));
      fetchFocus();
    } catch { toast.error('Failed'); }
  };

  const handleDeleteTask = async (id) => {
    try { await api.delete(`/tasks/${id}`); setMyTasks(prev => prev.filter(t => t._id !== id)); }
    catch { toast.error('Failed'); }
  };

  const filteredTasks = myTasks.filter(t =>
    taskFilter === 'active' ? t.status !== 'completed'
    : taskFilter === 'completed' ? t.status === 'completed'
    : true
  );
  const isOverdue = (t) => t.status !== 'completed' && new Date(t.deadline) < new Date();

  /* ── chart data ── */
  const crmPieData = crmReport ? [
    { name: 'Converted',     value: crmReport.totalConverted ?? 0 },
    { name: 'Not Converted', value: Math.max(0, (crmReport.totalLeads ?? 0) - (crmReport.totalConverted ?? 0)) },
  ] : [];

  /* payroll trend */
  const payrollBarData = (payroll?.payslips || []).slice(0, 8).map(p => ({
    name: p.employee?.name?.split(' ')[0] || '?',
    net:  p.netSalary ?? 0,
  }));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-violet-500 font-medium">Loading Zaltix Overview…</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 xl:px-6 py-2 space-y-4 sm:space-y-6 animate-fade-in">

      {/* ═══ HERO BANNER ═══ */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-100 rounded-2xl px-4 sm:px-6 py-4 sm:py-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-violet-500 inline-block flex-shrink-0" />
              <p className="text-[11px] font-semibold text-violet-500 uppercase tracking-widest">Zaltix Overview</p>
            </div>
            <h1 className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight truncate">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]}</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5 truncate">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {/* Net profit pill */}
          <div className="flex-shrink-0 bg-gray-50 border border-gray-100 rounded-xl px-2.5 sm:px-5 py-2 sm:py-3 text-right">
            <p className="text-[10px] sm:text-[11px] text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap">Net Profit · This Month</p>
            <p className={`text-base sm:text-xl font-extrabold mt-0.5 ${netProfit == null ? 'text-gray-300' : netProfit >= 0 ? 'text-violet-700' : 'text-red-500'}`}>
              {netProfit != null ? formatCurrency(netProfit) : '—'}
            </p>
            {profitGrowth != null && (
              <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isGrowing ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}>
                <span>{isGrowing ? '▲' : '▼'}</span>
                <span>{Math.abs(profitGrowth).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ═══ WEEKLY PERFORMANCE — CRM KPIs ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900">This Week's Performance</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — Today
            </p>
          </div>
          <Link to="/admin/crm" className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1">
            Full CRM Report <Icon d={IC.arrow} size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <WeeklyKPI label="Leads Generated"  value={weekLeads.length} icon={IC.lead}     color="violet" to="/admin/crm" />
          <WeeklyKPI label="Calls Made"       value={weekCallsMade}    icon={IC.phone}    color="blue"   to="/admin/crm" />
          <WeeklyKPI label="Meetings Booked"  value={weekMeetings}     icon={IC.calendar} color="indigo" to="/admin/crm" />
          <WeeklyKPI label="Demos Completed"  value={weekDemos}        icon={IC.video}    color="amber"  to="/admin/crm" />
          <WeeklyKPI label="Proposals Sent"   value={weekProposals}    icon={IC.doc}      color="slate"  to="/admin/crm" />
          <WeeklyKPI label="Deals Closed"     value={weekDeals}        icon={IC.deal}     color="green"  to="/admin/crm" />
          <WeeklyKPI label="Active Clients"   value={activeClients}    icon={IC.client}   color="rose"   to="/crm" className="col-span-2 sm:col-span-1 lg:col-span-1" />
        </div>
      </motion.div>


      {/* ═══ MY TASKS + QUICK ACTIONS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* My Tasks — 3/5 */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-violet-50 rounded-xl flex items-center justify-center">
                <Icon d={IC.task} size={15} className="text-violet-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">My Tasks</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {myTasks.filter(t => t.status !== 'completed').length} active
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/admin/my-tasks" className="text-xs text-violet-500 hover:text-violet-700 font-semibold">
                Full view →
              </Link>
              <button onClick={() => setShowTaskForm(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors">
                <Icon d={IC.plus} size={12} className="text-white" />
                Add
              </button>
            </div>
          </div>

          {/* Focus lock */}
          {activeFocus && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              <span className="font-semibold truncate">Focus: {activeFocus.title}</span>
              {activeFocus.minsLeft > 0 && (
                <span className="ml-auto flex-shrink-0 text-amber-500">~{fmtDuration(activeFocus.minsLeft)} left</span>
              )}
            </div>
          )}

          {/* Add form */}
          <AnimatePresence>
            {showTaskForm && (
              <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} onSubmit={handleAddTask}
                className="mb-4 overflow-hidden">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-3">
                  <input className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                    placeholder="Task title…" value={taskForm.title}
                    onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} autoFocus />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <input type="date" className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      value={taskForm.deadline} onChange={e => setTaskForm(p => ({ ...p, deadline: e.target.value }))} />
                    <select className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      value={taskForm.duration} onChange={e => setTaskForm(p => ({ ...p, duration: e.target.value }))}>
                      {DURATION_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowTaskForm(false)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">Cancel</button>
                    <button type="submit" disabled={taskSubmitting || focusLocked}
                      className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                      {taskSubmitting ? 'Adding…' : 'Add Task'}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-3">
            {[
              { key: 'active',    label: 'Active',    n: myTasks.filter(t => t.status !== 'completed').length },
              { key: 'completed', label: 'Done',      n: myTasks.filter(t => t.status === 'completed').length },
              { key: 'all',       label: 'All',       n: myTasks.length },
            ].map(f => (
              <button key={f.key} onClick={() => setTaskFilter(f.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  taskFilter === f.key ? 'bg-violet-100 text-violet-700' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {f.label}
                {f.n > 0 && (
                  <span className={`ml-1 text-[10px] px-1 py-0.5 rounded font-bold ${
                    taskFilter === f.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>{f.n}</span>
                )}
              </button>
            ))}
          </div>

          {/* Task list */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-6">
                <Icon d={IC.task} size={28} className="mx-auto text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">{taskFilter === 'completed' ? 'No completed tasks' : 'No active tasks'}</p>
              </div>
            ) : (
              <AnimatePresence>
                {filteredTasks.map(task => {
                  const st  = statusStyle[task.status];
                  const pr  = priorityStyle[task.priority] || priorityStyle.medium;
                  const ov  = isOverdue(task);
                  const isFocus = activeFocus && activeFocus._id === task._id;
                  const hasDuration = task.duration && task.status === 'in-progress' && task.startedAt;
                  const pct = hasDuration
                    ? Math.min(100, ((Date.now() - new Date(task.startedAt).getTime()) / (task.duration * 60000)) * 100)
                    : null;
                  return (
                    <motion.div key={task._id}
                      initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}
                      className={`p-2.5 rounded-xl border transition-colors ${
                        task.status === 'completed' ? 'bg-gray-50 border-gray-100 opacity-60'
                        : isFocus ? 'bg-amber-50 border-amber-100'
                        : ov ? 'bg-red-50/40 border-red-100'
                        : 'bg-white border-gray-100 hover:border-violet-100 hover:bg-violet-50/30'
                      }`}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleStatusToggle(task)}
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center hover:ring-2 ring-offset-1 transition-all ${st.ring} ${
                            task.status === 'completed' ? 'bg-violet-500 border-violet-500' : 'bg-white border-gray-300'
                          }`}>
                          {task.status === 'completed' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} className="w-2 h-2"><path d="M5 13l4 4L19 7" /></svg>
                          )}
                          {task.status === 'in-progress' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pr.bg} ${pr.text}`}>{pr.label}</span>
                            <span className={`text-[9px] ${ov ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                              {ov ? '⚠ ' : ''}{formatDate(task.deadline)}
                            </span>
                          </div>
                        </div>
                        <CountdownBadge task={task} />
                        <button onClick={() => handleDeleteTask(task._id)}
                          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                          <Icon d={IC.trash} size={13} />
                        </button>
                      </div>
                      {pct != null && (
                        <div className="mt-1.5 h-0.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-amber-400' : 'bg-violet-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </motion.div>

        {/* Quick Actions — 2/5 */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="font-bold text-gray-900 text-sm mb-4">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'New Lead',      path: '/crm',               icon: IC.lead,     bg: 'bg-violet-50 text-violet-600 hover:bg-violet-100' },
              { label: 'Schedule Demo', path: '/crm',               icon: IC.video,    bg: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
              { label: 'Add Task',      action: () => { setShowTaskForm(true); }, icon: IC.task, bg: 'bg-amber-50 text-amber-600 hover:bg-amber-100' },
              { label: 'CRM Reports',   path: '/admin/crm',         icon: IC.chart,    bg: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' },
              { label: 'Finance',       path: '/admin/finance',     icon: IC.money,    bg: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' },
              { label: 'Payroll',       path: '/admin/payslips',    icon: IC.building, bg: 'bg-rose-50 text-rose-500 hover:bg-rose-100' },
              { label: 'Recruitment',   path: '/admin/recruitment', icon: IC.users,    bg: 'bg-slate-50 text-slate-600 hover:bg-slate-100' },
              { label: 'Leave Mgmt',    path: '/admin/leaves',      icon: IC.clock,    bg: 'bg-gray-50 text-gray-600 hover:bg-gray-100' },
            ].map(item => {
              const cls = `${item.bg} p-3 rounded-xl flex flex-col items-center gap-1.5 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer`;
              const inner = (
                <>
                  <Icon d={item.icon} size={18} />
                  <span className="text-[10px] font-semibold text-center leading-tight">{item.label}</span>
                </>
              );
              return item.action
                ? <button key={item.label} onClick={item.action} className={cls}>{inner}</button>
                : <Link key={item.path + item.label} to={item.path} className={cls}>{inner}</Link>;
            })}
          </div>

          {/* HR stats summary */}
          <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-3 gap-2">
            {[
              { label: 'Employees', value: stats?.totalEmployees, color: 'text-violet-700' },
              { label: 'Present',   value: stats?.presentToday,   color: 'text-emerald-600' },
              { label: 'Leaves',    value: stats?.pendingLeaves,  color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="text-center py-2 bg-gray-50 rounded-xl">
                <p className={`text-lg font-extrabold leading-none ${s.color}`}>{s.value ?? '—'}</p>
                <p className="text-[9px] text-gray-400 font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ═══ STATS ROW ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Employees"   value={stats?.totalEmployees}        icon={<Icon d={IC.users}   size={18} />} color="violet" to="/admin/employees" />
        <StatCard label="Present Today"     value={stats?.presentToday}          icon={<Icon d={IC.check}   size={18} />} color="green"  to="/admin/attendance" sub={`of ${stats?.totalEmployees ?? '?'}`} />
        <StatCard label="Active Clients"    value={activeClients || '—'}         icon={<Icon d={IC.client}  size={18} />} color="blue"   to="/crm" />
        <StatCard label="Monthly Revenue"   value={finance?.totalIncome != null ? formatCurrency(finance.totalIncome) : '—'} icon={<Icon d={IC.money} size={18} />} color="amber" to="/admin/finance" />
        <StatCard label="Total Leads"       value={crmReport?.totalLeads || '—'} icon={<Icon d={IC.lead}    size={18} />} color="violet" to="/admin/crm" />
        <StatCard label="Pending Leaves"    value={stats?.pendingLeaves ?? '—'}  icon={<Icon d={IC.clock}   size={18} />} color="red"    to="/admin/leaves" />
      </motion.div>

      {/* ═══ CHARTS ═══ */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Payroll bar chart */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-bold text-gray-900 text-sm">Payroll Summary</p>
              <p className="text-[11px] text-gray-400">Net salary by employee</p>
            </div>
            <Link to="/admin/payslips" className="text-xs font-semibold text-violet-500 hover:text-violet-700">View →</Link>
          </div>
          {payrollBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={payrollBarData} barSize={20}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#D1D5DB' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={v => [formatCurrency(v), 'Net Salary']}
                  contentStyle={{ borderRadius: 10, border: '1px solid #F3F4F6', fontSize: 11, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#F5F3FF' }}
                />
                <Bar dataKey="net" fill="#7C3AED" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">No payslip data this month</div>
          )}
        </motion.div>

        {/* CRM conversion donut */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-bold text-gray-900 text-sm">CRM Conversion</p>
              <p className="text-[11px] text-gray-400">Lead-to-client pipeline</p>
            </div>
            <Link to="/admin/crm" className="text-xs font-semibold text-violet-500 hover:text-violet-700">Analytics →</Link>
          </div>
          {crmPieData.some(d => d.value > 0) ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={crmPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                    dataKey="value" paddingAngle={3} strokeWidth={0}>
                    <Cell fill="#7C3AED" />
                    <Cell fill="#EDE9FE" />
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #F3F4F6', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-1.5 -mt-2">
                <span className="text-sm text-gray-500">Conversion Rate:</span>
                <span className="text-lg font-extrabold text-violet-700">{crmReport?.overallConversionRate ?? 0}%</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">No CRM data available</div>
          )}
        </motion.div>
      </div>

      {/* ═══ ANNOUNCEMENTS + HOLIDAYS ═══ */}
      <div className="grid lg:grid-cols-2 gap-4">
        <AnnouncementWidget />
        <HolidayWidget />
      </div>

      {/* ═══ WORK INTELLIGENCE FLOATING BANNER (30s delay, 8s visible) ═══ */}
      <AnimatePresence>
        {showIntelBanner && automationData && (
          automationData.summary?.totalOverdue > 0 ||
          (automationData.missingCheckouts?.length ?? 0) > 0 ||
          (automationData.staleLeads?.length ?? 0) > 0 ||
          (automationData.pendingDocs?.length ?? 0) > 0
        ) && (
          <motion.div
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-80 bg-white border border-amber-200 rounded-2xl shadow-xl overflow-hidden">
            {/* amber top bar */}
            <div className="h-1 bg-amber-400 w-full" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                    <Icon d={IC.lightning} size={14} className="text-amber-500" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-gray-900 leading-none">Work Intelligence</p>
                    <p className="text-[10px] text-amber-500 mt-0.5">Auto-detected issues</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIntelBanner(false)}
                  className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0 mt-0.5">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Overdue Tasks',     value: automationData.summary?.totalOverdue ?? 0,          warn: (automationData.summary?.totalOverdue ?? 0) > 0 },
                  { label: 'Missing Checkouts', value: automationData.missingCheckouts?.length ?? 0,       warn: (automationData.missingCheckouts?.length ?? 0) > 0 },
                  { label: 'Stale CRM Leads',   value: automationData.staleLeads?.length ?? 0,             warn: (automationData.staleLeads?.length ?? 0) > 0 },
                  { label: 'Pending Docs',      value: automationData.pendingDocs?.length ?? 0,            warn: (automationData.pendingDocs?.length ?? 0) > 0 },
                ].map(({ label, value, warn }) => (
                  <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${warn ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-lg font-extrabold leading-none ${warn ? 'text-amber-600' : 'text-gray-400'}`}>{value}</p>
                    <p className="text-[10px] font-medium text-gray-500 leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              <Link to="/admin/automation"
                onClick={() => setShowIntelBanner(false)}
                className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">
                View full report →
              </Link>
            </div>

            {/* countdown bar */}
            <motion.div
              className="h-0.5 bg-amber-300 origin-left"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 8, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default AdminDashboard;
