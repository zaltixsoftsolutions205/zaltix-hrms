import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { KpiCard } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import { formatDate, formatTime12, getInitials, formatCurrency, getUploadUrl } from '../../utils/helpers';
import { useAuth } from '../../contexts/AuthContext';
import { useAttendance } from '../../hooks/useAttendance';
import LocationCheckModal from '../../components/UI/LocationCheckModal';
import AnnouncementWidget from '../../components/UI/AnnouncementWidget';
import HolidayWidget from '../../components/UI/HolidayWidget';
import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';

const DI = ({ d, size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const plusCircleD = "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z";
const calendarD = "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z";
const clockD = "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";
const clipboardCheckD = "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4";
const creditCardD = "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z";
const usersD = "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z";
const checkCircleD = "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z";
const clipboardListD = "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h.01M12 12h.01M9 16h6";
const logoutD = "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1";
const xCircleD = "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z";
const currencyD = "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
const trendUpD = "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6";
const trendDownD = "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6";

const HRDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [financeStats, setFinanceStats] = useState(null);
  const [automationData, setAutomationData] = useState(null);
  const [myScore, setMyScore] = useState(null);

  // Personal attendance & leave state
  const [todayRecord, setTodayRecord] = useState(null);
  const [myAttendance, setMyAttendance] = useState(null);
  const [myLeaves, setMyLeaves] = useState(null);

  const fetchPersonal = () => {
    const now = new Date();
    const m = now.getMonth() + 1, y = now.getFullYear();
    api.get(`/attendance/my?month=${m}&year=${y}`)
      .then(r => { setMyAttendance(r.data.summary); setTodayRecord(r.data.todayRecord); })
      .catch(() => {});
    api.get('/leaves/my').then(r => setMyLeaves(r.data)).catch(() => {});
  };

  useEffect(() => {
    const now = new Date();
    const m = now.getMonth() + 1, y = now.getFullYear();
    Promise.all([
      api.get('/admin/dashboard-stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/leaves?status=pending').then(r => setPendingLeaves(r.data.slice(0, 5))).catch(() => {}),
      api.get('/tasks').then(r => setRecentTasks(r.data.slice(0, 5))).catch(() => {}),
      api.get(`/finance/dashboard?month=${m}&year=${y}`).then(r => setFinanceStats(r.data)).catch(() => {}),
      api.get('/automation/dashboard').then(r => setAutomationData(r.data)).catch(() => {}),
      api.get('/automation/my-score').then(r => setMyScore(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
    fetchPersonal();
  }, []);

  const {
    loading: checkLoading,
    locationModal, setLocationModal,
    handleCheckIn, handleCheckOut, confirmAction,
  } = useAttendance(fetchPersonal);

  // Derive personal intelligence alerts from already-fetched data
  const personalAlerts = (() => {
    const alerts = [];
    if (myAttendance?.late >= 5)
      alerts.push({ level: 'error', message: `You've been late ${myAttendance.late} times this month — this may affect your performance score.`, link: '/attendance' });
    else if (myAttendance?.late >= 3)
      alerts.push({ level: 'warning', message: `You've been late ${myAttendance.late} times this month. Try to check in on time.`, link: '/attendance' });
    const casualLeft = myLeaves?.balance?.casual?.remaining ?? null;
    const sickLeft = myLeaves?.balance?.sick?.remaining ?? null;
    if (casualLeft !== null && casualLeft === 0)
      alerts.push({ level: 'error', message: 'You have no casual leaves remaining. Any unplanned absence will be unpaid.', link: '/leaves' });
    else if (casualLeft !== null && casualLeft === 1)
      alerts.push({ level: 'warning', message: 'Only 1 casual leave remaining for this year. Use it wisely.', link: '/leaves' });
    if (sickLeft !== null && sickLeft === 0)
      alerts.push({ level: 'warning', message: 'No sick leaves remaining. Plan accordingly.', link: '/leaves' });
    const pendingLeaveCount = myLeaves?.leaves?.filter(l => l.status === 'pending').length || 0;
    if (pendingLeaveCount > 0)
      alerts.push({ level: 'info', message: `You have ${pendingLeaveCount} pending leave application${pendingLeaveCount > 1 ? 's' : ''} awaiting approval.`, link: '/leaves' });
    return alerts;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-violet-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 space-y-5 animate-fade-in">

      {/* Banner with check-in */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-900 via-violet-800 to-violet-700 text-white shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 w-64 h-24 rounded-full bg-white/5 translate-y-12 -translate-x-1/2" />

        {/* Top row: avatar + name + role */}
        <div className="relative px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-2xl flex-shrink-0 ring-2 ring-white/20 shadow-inner overflow-hidden">
            {user?.profilePicture ? (
              <img src={getUploadUrl(user.profilePicture)} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/20 flex items-center justify-center text-lg sm:text-xl font-bold">
                {getInitials(user?.name)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-violet-200 text-xs sm:text-sm font-medium mb-0.5">
              {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'},
            </p>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold truncate leading-tight">{user?.name}</h2>
            <p className="text-violet-200 text-[11px] sm:text-sm truncate mt-0.5 flex flex-wrap items-center gap-1">
              <span className="capitalize">{user?.designation || 'HR Manager'}</span>
              {user?.department?.name && <span className="text-violet-300">· {user.department.name}</span>}
            </p>
          </div>
        </div>

        <div className="mx-4 sm:mx-6 border-t border-white/10" />

        {/* Check-in row */}
        <div className="relative px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 ${
            todayRecord?.checkIn ? 'bg-violet-400/20 text-violet-200' : 'bg-white/10 text-violet-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${todayRecord?.checkIn ? 'bg-violet-300 animate-pulse' : 'bg-violet-400'}`} />
            {todayRecord?.checkIn
              ? `Checked in at ${formatTime12(todayRecord.checkIn)}${todayRecord.checkOut ? ` · Out at ${formatTime12(todayRecord.checkOut)}` : ''}`
              : 'Not checked in today'}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {!todayRecord?.checkIn && (
              <button onClick={handleCheckIn} disabled={checkLoading}
                className="px-4 py-1.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors shadow-sm min-w-[70px]">
                {checkLoading ? '...' : 'Check In'}
              </button>
            )}
            {todayRecord?.checkIn && !todayRecord?.checkOut && (
              <button onClick={handleCheckOut} disabled={checkLoading}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors shadow-sm min-w-[70px]">
                Check Out
              </button>
            )}
            {todayRecord?.checkIn && todayRecord?.checkOut && (
              <span className="px-3 py-1.5 bg-violet-400/20 text-violet-200 rounded-lg text-xs font-semibold flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Day Complete
              </span>
            )}
            <Link to="/attendance" className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold underline underline-offset-2 whitespace-nowrap">
              My Attendance →
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Personal Intelligence Alerts */}
      <IntelligenceAlerts alerts={personalAlerts} />

      {/* Team Work Intelligence */}
      {automationData && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div>
              <h3 className="font-bold text-violet-900">Team Work Intelligence</h3>
              <p className="text-xs text-violet-400 mt-0.5">Live signals — auto-updated every hour</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Auto-running
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link to="/hr/tasks" className="p-3 rounded-xl bg-red-50 border border-red-100 hover:bg-red-100 transition-colors">
              <p className="text-2xl font-bold text-red-700">{automationData.overdueTasks?.length ?? 0}</p>
              <p className="text-xs font-semibold text-red-600 mt-0.5">Overdue Tasks</p>
              <p className="text-[10px] text-red-400 mt-0.5">Need immediate attention</p>
            </Link>
            <Link to="/hr/attendance" className="p-3 rounded-xl bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors">
              <p className="text-2xl font-bold text-amber-700">{automationData.missingCheckouts?.length ?? 0}</p>
              <p className="text-xs font-semibold text-amber-600 mt-0.5">Missing Checkouts</p>
              <p className="text-[10px] text-amber-400 mt-0.5">Yesterday's pending</p>
            </Link>
            <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
              <p className="text-2xl font-bold text-violet-700">{automationData.pendingDocs?.length ?? 0}</p>
              <p className="text-xs font-semibold text-violet-600 mt-0.5">Pending Documents</p>
              <p className="text-[10px] text-violet-400 mt-0.5">Compliance review needed</p>
            </div>
            <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
              <p className="text-2xl font-bold text-violet-700">{automationData.avgScore ?? 0}%</p>
              <p className="text-xs font-semibold text-violet-600 mt-0.5">Team Avg Score</p>
              <p className="text-[10px] text-violet-400 mt-0.5">Productivity this week</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* My Productivity Score */}
      {myScore?.scores?.length > 0 && (() => {
        const latest = myScore.scores[0];
        return (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="glass-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-violet-900">My Productivity Score</h3>
              <span className="text-xs text-violet-400">{latest.week}</span>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-white">{latest.totalScore}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-900">Overall Score</p>
                <div className="h-2 bg-violet-100 rounded-full mt-1.5 overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${latest.totalScore}%` }} transition={{ delay: 0.3, duration: 0.6 }}
                    className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-violet-50 rounded-xl">
                <p className="text-[10px] text-violet-500 font-medium">Task Score</p>
                <p className="text-lg font-bold text-violet-700">{latest.taskScore}<span className="text-xs font-normal">/40</span></p>
              </div>
              <div className="p-2.5 bg-violet-50 rounded-xl">
                <p className="text-[10px] text-violet-500 font-medium">Attendance Score</p>
                <p className="text-lg font-bold text-violet-700">{latest.attendanceScore}<span className="text-xs font-normal">/40</span></p>
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="glass-card p-4 sm:p-5">
        <h3 className="font-bold text-violet-900 mb-3 sm:mb-4">Quick Actions</h3>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <Link to="/hr/employees"
            className="bg-violet-100 text-violet-700 p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
            <DI d={plusCircleD} className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">Add Employee</span>
          </Link>
          <Link to="/hr/attendance"
            className="bg-violet-100 text-violet-700 p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
            <DI d={calendarD} className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">Attendance</span>
          </Link>
          <Link to="/hr/leaves"
            className="bg-violet-100 text-violet-700 p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
            <DI d={clockD} className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">Leave Requests</span>
          </Link>
          <Link to="/hr/tasks"
            className="bg-golden-100 text-golden-700 p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
            <DI d={clipboardCheckD} className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">Assign Work</span>
          </Link>
          <Link to="/hr/payslips"
            className="bg-gray-100 text-gray-900 p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
            <DI d={creditCardD} className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">Payslip</span>
          </Link>
          <Link to="/leaves"
            className="bg-violet-100 text-violet-700 p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
            <DI d={calendarD} className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">Apply Leave</span>
          </Link>
        </div>
      </motion.div>

      {/* Org KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        <KpiCard label="Total Employees" value={stats?.totalEmployees ?? '—'} icon={<DI d={usersD} />} color="violet" to="/hr/employees" />
        <KpiCard label="Present Today" value={stats?.presentToday ?? '—'} icon={<DI d={checkCircleD} />} color="green" to="/hr/attendance" />
        <KpiCard label="Pending Leaves" value={stats?.pendingLeaves ?? '—'} icon={<DI d={clockD} />} color="golden" to="/hr/leaves" />
        <KpiCard label="Open Tasks" value={stats?.openTasks ?? '—'} icon={<DI d={clipboardListD} />} color="violet" to="/hr/tasks" />
      </div>

      {/* Personal KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        <KpiCard label="My Present (Month)" value={myAttendance?.present ?? '—'} icon={<DI d={checkCircleD} />} color="green" to="/attendance" />
        <KpiCard label="My Absent" value={myAttendance?.absent ?? '—'} icon={<DI d={xCircleD} />} color="red" to="/attendance" />
        <KpiCard label="Casual Leave Left" value={myLeaves?.balance?.casual?.remaining ?? '—'} icon={<DI d={clockD} />} color="golden" to="/leaves" />
        <KpiCard label="Sick Leave Left" value={myLeaves?.balance?.sick?.remaining ?? '—'} icon={<DI d={clipboardListD} />} color="violet" to="/leaves" />
      </div>

      {/* Finance Summary */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="font-bold text-violet-900">Finance — This Month</h3>
          <Link to="/admin/finance" className="text-xs text-golden-600 font-semibold hover:text-golden-700">Manage Finance →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-violet-50 rounded-xl p-3 sm:p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <DI d={currencyD} size={15} className="text-violet-600" />
              </span>
              <span className="text-xs font-semibold text-violet-700">Income</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-violet-700 truncate">
              {financeStats ? formatCurrency(financeStats.totalIncome) : '—'}
            </p>
          </div>
          <div className="bg-gray-100 rounded-xl p-3 sm:p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <DI d={trendDownD} size={15} className="text-gray-900" />
              </span>
              <span className="text-xs font-semibold text-gray-900">Expenses</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {financeStats ? formatCurrency(financeStats.totalExpense) : '—'}
            </p>
          </div>
          <div className={`rounded-xl p-3 sm:p-4 flex flex-col gap-1 ${financeStats?.profit >= 0 ? 'bg-violet-50' : 'bg-gray-100'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${financeStats?.profit >= 0 ? 'bg-violet-100' : 'bg-gray-100'}`}>
                <DI d={trendUpD} size={15} className={financeStats?.profit >= 0 ? 'text-violet-600' : 'text-gray-900'} />
              </span>
              <span className={`text-xs font-semibold ${financeStats?.profit >= 0 ? 'text-violet-700' : 'text-gray-900'}`}>Net Profit</span>
            </div>
            <p className={`text-lg sm:text-xl font-bold truncate ${financeStats?.profit >= 0 ? 'text-violet-700' : 'text-gray-900'}`}>
              {financeStats ? formatCurrency(financeStats.profit) : '—'}
            </p>
          </div>
          <div className="bg-violet-50 rounded-xl p-3 sm:p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <DI d={trendUpD} size={15} className="text-violet-600" />
              </span>
              <span className="text-xs font-semibold text-violet-700">Margin</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-violet-700">
              {financeStats ? `${financeStats.profitMargin}%` : '—'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* My Leave Balance + Pending Leave Requests */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">

        {/* My Leave Balance */}
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          className="glass-card p-4 sm:p-5 h-full">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-bold text-violet-900">My Leave Balance</h3>
            <Link to="/leaves" className="text-xs text-golden-600 font-semibold hover:text-golden-700">Apply Leave →</Link>
          </div>
          {myLeaves && Object.keys(myLeaves.balance || {}).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(myLeaves.balance).map(([type, bal]) => (
                <div key={type}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-semibold text-violet-800 capitalize">{type} Leave</span>
                    <span className="text-xs text-violet-500">{bal.used}/{bal.total} used</span>
                  </div>
                  <div className="h-2.5 bg-violet-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${bal.total > 0 ? Math.min((bal.used / bal.total) * 100, 100) : 0}%` }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                      className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full"
                    />
                  </div>
                  <div className="flex justify-end mt-1">
                    <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                      {bal.remaining} remaining
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-violet-300 gap-3">
              <DI d={clockD} size={36} className="text-violet-300" />
              <p className="text-sm text-violet-400">No leave data available</p>
              <Link to="/leaves" className="text-xs font-semibold text-golden-600 hover:text-golden-700 bg-golden-50 px-4 py-2 rounded-full">
                Apply for Leave →
              </Link>
            </div>
          )}
        </motion.div>

        {/* Pending Leave Requests */}
        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
          className="glass-card p-4 sm:p-5 h-full">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-bold text-violet-900">Pending Leave Requests</h3>
            <Link to="/hr/leaves" className="text-xs text-golden-600 font-semibold hover:text-golden-700">View All →</Link>
          </div>
          {pendingLeaves.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-violet-400">No pending requests</p>
              <Link to="/hr/leaves" className="text-xs text-golden-600 font-semibold mt-2 inline-block hover:text-golden-700">View All Leaves →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingLeaves.map(leave => (
                <Link key={leave._id} to="/hr/leaves"
                  className="flex items-center justify-between p-3 bg-golden-50/60 rounded-xl border border-golden-100 hover:bg-golden-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-violet-900 truncate">{leave.employee?.name}</p>
                    <p className="text-xs text-violet-500 capitalize">{leave.type} leave · {leave.totalDays} day(s)</p>
                    <p className="text-xs text-violet-400">{formatDate(leave.fromDate)} – {formatDate(leave.toDate)}</p>
                  </div>
                  <Badge status="pending" />
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Recent Tasks */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="font-bold text-violet-900">Recent Tasks</h3>
          <Link to="/hr/tasks" className="text-xs text-golden-600 font-semibold hover:text-golden-700">Manage →</Link>
        </div>
        {recentTasks.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-violet-400">No tasks assigned yet</p>
            <Link to="/hr/tasks" className="text-xs text-golden-600 font-semibold mt-2 inline-block hover:text-golden-700">Assign Tasks →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {recentTasks.map(task => (
              <Link key={task._id} to="/hr/tasks"
                className="flex items-center justify-between p-3 bg-violet-50/60 rounded-xl hover:bg-violet-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-violet-900 truncate">{task.title}</p>
                  <p className="text-xs text-violet-500">{task.assignedTo?.name} · Due {formatDate(task.deadline)}</p>
                </div>
                <Badge status={task.status} className="ml-2 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </motion.div>

      {/* Announcements + Holidays */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
        <AnnouncementWidget />
        <HolidayWidget />
      </div>

      <LocationCheckModal
        modal={locationModal}
        onConfirm={confirmAction}
        onCancel={() => setLocationModal(null)}
        loading={checkLoading}
      />
    </div>
  );
};

export default HRDashboard;
