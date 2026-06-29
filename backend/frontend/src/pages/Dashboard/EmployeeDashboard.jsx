import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { KpiCard } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import { formatCurrency, getInitials, monthName, formatTime12, getUploadUrl } from '../../utils/helpers';
import { useAttendance } from '../../hooks/useAttendance';
import { requestPushToken } from '../../utils/firebase';
import LocationCheckModal from '../../components/UI/LocationCheckModal';
import AnnouncementWidget from '../../components/UI/AnnouncementWidget';
import HolidayWidget from '../../components/UI/HolidayWidget';
import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';

/* ── tiny inline SVG helper ── */
const Icon = ({ d, d2, circle, className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    {circle && <circle cx={circle[0]} cy={circle[1]} r={circle[2]} />}
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const IC = {
  clock:     "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  calendar:  "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  task:      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  card:      "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  crm:       "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  check:     "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  x:         "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  users:     "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  star:      "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  sparkle:   "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  trend:     "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  chevron:   "M19 9l-7 7-7-7",
  logout:    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
};

const fade = (i = 0) => ({ 
  hidden: { opacity: 0, y: 14 }, 
  visible: { opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.28 } } 
});

const QuickLink = ({ to, bg, text, icon, label }) => (
  <Link 
    to={to}
    className={`${bg} ${text} rounded-xl flex flex-col items-center justify-center gap-1.5 p-2.5 min-h-[80px] hover:opacity-85 active:scale-95 transition-all duration-150 w-full`}
  >
    <Icon d={icon} className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
    <span className="text-[10px] sm:text-[11px] font-semibold text-center leading-tight px-1">{label}</span>
  </Link>
);

const SectionCard = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const SectionHeader = ({ title, linkTo, linkLabel }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-violet-50">
    <h3 className="font-bold text-violet-900 text-sm sm:text-base">{title}</h3>
    {linkTo && (
      <Link to={linkTo} className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1">
        {linkLabel} <span className="text-sm">→</span>
      </Link>
    )}
  </div>
);

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState(null);
  const [leaves, setLeaves]         = useState(null);
  const [payslip, setPayslip]       = useState(null);
  const [tasks, setTasks]           = useState(null);
  const [crmStats, setCrmStats]     = useState(null);
  const [todayRecord, setTodayRecord] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [team, setTeam]             = useState([]);
  const [teamDept, setTeamDept]     = useState(null);
  const [showTeam, setShowTeam]     = useState(false);
  const [profileCompletion, setProfileCompletion] = useState(null);
  const [myScore, setMyScore]       = useState(null);

  const [notifPermission, setNotifPermission] = useState(() =>
    ('Notification' in window) ? Notification.permission : 'denied'
  );

  const enableNotifications = async () => {
    try {
      const token = await requestPushToken();
      if (token) {
        await api.post('/notifications/push-token', { token });
        localStorage.setItem('fcmToken', token);
        setNotifPermission('granted');
        toast.success('Notifications enabled!');
      } else {
        setNotifPermission(Notification.permission);
        toast.error('Could not get push token. Check browser settings.');
      }
    } catch (err) {
      toast.error('Notification setup failed: ' + (err?.message || 'Unknown error'));
    }
  };


  const fetchDashboard = () => {
    const now = new Date();
    const m = now.getMonth() + 1, y = now.getFullYear();
    const reqs = [
      api.get(`/attendance/my?month=${m}&year=${y}`).then(r => {
        setAttendance(r.data.summary);
        setTodayRecord(r.data.todayRecord);
      }).catch(() => {}),
      api.get('/leaves/my').then(r => setLeaves(r.data)).catch(() => {}),
      api.get('/payslips/my').then(r => setPayslip(r.data[0] || null)).catch(() => {}),
      api.get('/tasks/my').then(r => setTasks(r.data.kpi)).catch(() => {}),
      api.get('/user/profile-completion').then(r => setProfileCompletion(r.data)).catch(() => {}),
    ];
    if (user?.role === 'sales') reqs.push(api.get('/leads').then(r => setCrmStats(r.data.stats)).catch(() => {}));
    Promise.all(reqs).finally(() => setLoading(false));
    api.get('/automation/my-score').then(r => setMyScore(r.data)).catch(() => {});
    api.get('/employees/team').then(r => {
      setTeam(r.data.team || []);
      setTeamDept(r.data.deptName || null);
    }).catch(() => {});
  };

  useEffect(() => { fetchDashboard(); }, [user?.role]);

  const {
    loading: checkLoading,
    locationModal, setLocationModal,
    handleCheckIn, handleCheckOut, confirmAction,
  } = useAttendance(fetchDashboard);

  const greeting = () => { 
    const h = new Date().getHours(); 
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; 
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
      <Spinner size="lg" />
      <p className="text-sm text-violet-500 font-medium animate-pulse">Loading your dashboard...</p>
    </div>
  );

  const isSales = user?.role === 'sales';

  return (
    <div className="space-y-5 pb-8 px-3 sm:px-4 max-w-7xl mx-auto w-full">


      {/* ── Notification Enable Banner ── */}
      {notifPermission !== 'granted' && 'Notification' in window && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 text-amber-700">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Enable Push Notifications</p>
            <p className="text-xs text-amber-700 mt-0.5">Get notified about payslips, tasks & leaves even when the app is closed.</p>
          </div>
          {notifPermission === 'denied' ? (
            <p className="text-xs text-gray-900 font-medium whitespace-nowrap">Blocked in browser settings</p>
          ) : (
            <button onClick={enableNotifications}
              className="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
              Enable
            </button>
          )}
        </motion.div>
      )}
      {/* ── Welcome Banner ── */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }} 
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-900 via-violet-800 to-violet-700 text-white shadow-lg w-full"
      >
        {/* decorative circles */}
        <div className="pointer-events-none absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 w-64 h-24 rounded-full bg-white/5 translate-y-12 -translate-x-1/2" />

        {/* top row: avatar + name */}
        <div className="relative px-4 pt-4 pb-3 flex items-center gap-3 sm:gap-4">
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
            <p className="text-violet-200 text-xs sm:text-sm font-medium mb-0.5">{greeting()},</p>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold truncate leading-tight">{user?.name}</h2>
            <p className="text-violet-200 text-[11px] sm:text-sm truncate mt-0.5 flex flex-wrap items-center gap-1">
              <span className="capitalize">{user?.designation || user?.role}</span>
              {user?.department?.name && <span className="text-violet-300">· {user.department.name}</span>}
              {user?.employeeId && <span className="text-violet-300 hidden xs:inline">· {user.employeeId}</span>}
            </p>
          </div>
        </div>

        {/* divider */}
        <div className="mx-4 border-t border-white/10" />

        {/* bottom row: check-in status + buttons */}
        <div className="relative px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          {/* status pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 ${
            todayRecord?.checkIn 
              ? 'bg-violet-400/20 text-violet-200' 
              : 'bg-white/10 text-violet-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${todayRecord?.checkIn ? 'bg-violet-300 animate-pulse' : 'bg-violet-400'}`} />
            {todayRecord?.checkIn
              ? `Checked in at ${formatTime12(todayRecord.checkIn)}${todayRecord.checkOut ? ` · Out at ${formatTime12(todayRecord.checkOut)}` : ''}`
              : 'Not checked in today'}
          </div>

          {/* action buttons - right aligned */}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {!todayRecord?.checkIn && (
              <button
                onClick={handleCheckIn}
                disabled={checkLoading}
                className="px-4 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors shadow-sm min-w-[70px]"
              >
                {checkLoading ? '...' : 'Check In'}
              </button>
            )}
            {todayRecord?.checkIn && !todayRecord?.checkOut && (
              <button
                onClick={handleCheckOut}
                disabled={checkLoading}
                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors shadow-sm min-w-[70px]"
              >
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
          </div>
        </div>
      </motion.div>

      {/* ── Profile Completion Banner ── */}
      {profileCompletion && profileCompletion.percentage < 100 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link to="/profile" className="block w-full">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-orange-400 text-white shadow-lg hover:shadow-xl transition-all cursor-pointer">
              <div className="pointer-events-none absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10" />
              <div className="relative px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
                {/* Inline circle — 72px */}
                <div className="flex-shrink-0 relative" style={{ width: 72, height: 72 }}>
                  <svg viewBox="0 0 72 72" width="72" height="72" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
                    <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="5" />
                    <circle cx="36" cy="36" r="28" fill="none" stroke="white" strokeWidth="5"
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - profileCompletion.percentage / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-base font-bold text-white leading-none">{profileCompletion.percentage}%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm sm:text-base leading-tight">Complete Your Profile</h3>
                  <p className="text-xs sm:text-sm text-white/90 mt-0.5">
                    {100 - profileCompletion.percentage}% more to unlock payslip downloads
                  </p>
                </div>
                <div className="flex-shrink-0 ml-1">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Present (Month)', value: attendance?.present ?? '—', icon: <Icon d={IC.check} />, color: 'green',  to: '/attendance' },
          { label: 'Absent',          value: attendance?.absent  ?? '—', icon: <Icon d={IC.x} />,     color: 'red',    to: '/attendance' },
          { label: 'Tasks Done',      value: tasks?.completed    ?? '—', icon: <Icon d={IC.task} />,  color: 'violet', to: '/tasks' },
          { label: 'Leave Balance',   value: leaves?.balance?.casual?.remaining ?? '—', icon: <Icon d={IC.clock} />, color: 'green', to: '/leaves' },
        ].map((card, i) => (
          <motion.div key={card.label} custom={i} variants={fade(i)} initial="hidden" animate="visible" className="h-full">
            <KpiCard {...card} />
          </motion.div>
        ))}
      </div>

      {/* ── My Intelligence Alerts ── */}
      {(() => {
        const alerts = [];
        const now = new Date();
        if (tasks?.overdue > 0)
          alerts.push({ level: 'error', message: `You have ${tasks.overdue} overdue task${tasks.overdue > 1 ? 's' : ''}. Update status to protect your performance score.`, link: '/tasks' });
        if (attendance?.late >= 5)
          alerts.push({ level: 'error', message: `${attendance.late} late check-ins this month. This is impacting your attendance score.`, link: '/attendance' });
        else if (attendance?.late >= 3)
          alerts.push({ level: 'warning', message: `${attendance.late} late check-ins this month. 5 or more will reduce your score.`, link: '/attendance' });
        const casualLeft = leaves?.balance?.casual?.remaining ?? null;
        if (casualLeft !== null && casualLeft <= 1)
          alerts.push({ level: 'warning', message: `Only ${casualLeft} casual leave${casualLeft === 1 ? '' : 's'} remaining this year. Plan accordingly.`, link: '/leaves' });
        if (profileCompletion && profileCompletion.percentage < 80)
          alerts.push({ level: 'info', message: `Profile is ${profileCompletion.percentage}% complete. Finish it to unlock payslip downloads.`, link: '/profile' });
        if (alerts.length === 0) return null;
        return <IntelligenceAlerts alerts={alerts} />;
      })()}

      {/* ── Productivity Score Card ── */}
      {myScore?.scores?.length > 0 && (() => {
        const latest = myScore.scores[0];
        const grade = latest.totalScore >= 90 ? { label: 'Excellent', cls: 'text-green-600', bg: 'bg-green-50', bar: 'bg-green-500' }
          : latest.totalScore >= 75 ? { label: 'Good', cls: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-600' }
          : latest.totalScore >= 60 ? { label: 'Average', cls: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' }
          : { label: 'Needs Improvement', cls: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' };
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <SectionCard>
              <SectionHeader title={`📊 Performance Score — ${latest.week}`} />
              <div className="px-4 py-3 flex flex-wrap items-center gap-4">
                <div className={`flex-shrink-0 w-16 h-16 rounded-2xl ${grade.bg} flex flex-col items-center justify-center`}>
                  <span className={`text-2xl font-extrabold leading-none ${grade.cls}`}>{latest.totalScore}</span>
                  <span className={`text-[10px] font-semibold ${grade.cls}`}>/ 100</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${grade.cls}`}>{grade.label}</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Tasks', val: latest.taskScore, details: `${latest.tasksCompleted}/${latest.tasksTotal} completed` },
                      { label: 'Attendance', val: latest.attendanceScore, details: `${latest.attendanceDays}/${latest.workingDays} days · ${latest.lateDays} late` },
                      ...(latest.crmScore != null ? [{ label: 'CRM', val: latest.crmScore, details: `${latest.leadsConverted} converted` }] : []),
                    ].map(({ label, val, details }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}: {val}%</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${grade.bar}`} style={{ width: `${val}%`, transition: 'width 0.6s ease' }} />
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">{details}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          </motion.div>
        );
      })()}

      {/* ── Quick Actions ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <SectionCard>
          <SectionHeader title="Quick Actions" />
          <div className={`p-3 sm:p-4 grid gap-2 ${
            isSales 
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5' 
              : 'grid-cols-2 sm:grid-cols-4'
          }`}>
            <QuickLink to="/leaves"     bg="bg-violet-50"  text="text-violet-700"  icon={IC.clock}    label="Apply Leave" />
            <QuickLink to="/attendance" bg="bg-violet-50" text="text-violet-700" icon={IC.calendar} label="Attendance" />
            <QuickLink to="/tasks"      bg="bg-violet-50"   text="text-violet-700"   icon={IC.task}     label="My Tasks" />
            <QuickLink to="/payslips"   bg="bg-amber-50"  text="text-amber-700"  icon={IC.card}     label="Payslips" />
            {isSales && <QuickLink to="/crm" bg="bg-violet-50" text="text-violet-700" icon={IC.crm} label="CRM" />}
          </div>
        </SectionCard>
      </motion.div>

      {/* ── Leave Balance + Latest Payslip ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Leave Balance */}
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.16 }} className="h-full">
          <SectionCard className="h-full">
            <SectionHeader title="Leave Balance" linkTo="/leaves" linkLabel="View all" />
            <div className="p-4 sm:p-5">
              {leaves && Object.keys(leaves.balance || {}).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(leaves.balance).map(([type, bal]) => {
                    const isLOP = type === 'lop';
                    const typeLabel = { casual: 'Casual', sick: 'Sick', other: 'Other', lop: 'Loss of Pay' }[type] || type;
                    return (
                      <div key={type}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-semibold text-violet-800">{typeLabel} Leave</span>
                          <span className="text-xs text-violet-500">
                            {isLOP ? `${bal.used} day(s) taken` : `${bal.used}/${bal.total} used`}
                          </span>
                        </div>
                        {!isLOP && (
                          <>
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
                          </>
                        )}
                        {isLOP && (
                          <div className="flex justify-end mt-1">
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              Salary deducted
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-violet-300 gap-3">
                  <Icon d={IC.clock} className="w-10 h-10 text-violet-300" />
                  <p className="text-sm text-violet-400">No leave data available</p>
                  <Link to="/leaves" className="text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 px-4 py-2 rounded-full">
                    Apply for Leave →
                  </Link>
                </div>
              )}
            </div>
          </SectionCard>
        </motion.div>

        {/* Latest Payslip */}
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="h-full">
          <SectionCard className="h-full">
            <SectionHeader title="Latest Payslip" linkTo="/payslips" linkLabel="View all" />
            <div className="p-4 sm:p-5">
              {payslip ? (
                <div className="space-y-4">
                  {/* Net pay highlight */}
                  <div className="bg-gradient-to-r from-violet-50 to-amber-50 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-violet-500 mb-1">{monthName(payslip.month)} {payslip.year}</p>
                      <p className="text-sm font-semibold text-violet-900">Net Pay</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl sm:text-2xl font-extrabold text-amber-600 leading-tight">{formatCurrency(payslip.netSalary)}</p>
                      <div className="mt-1">
                        <Badge status={payslip.status} />
                      </div>
                    </div>
                  </div>
                  {/* Gross / Deductions */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-violet-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">Gross Salary</p>
                      <p className="text-sm font-bold text-violet-700">{formatCurrency(payslip.grossSalary)}</p>
                    </div>
                    <div className="bg-gray-100 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">Deductions</p>
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(payslip.deductions?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-violet-300 gap-3">
                  <Icon d={IC.card} className="w-10 h-10 text-violet-300" />
                  <p className="text-sm text-violet-400">No payslips available yet</p>
                  <Link to="/payslips" className="text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 px-4 py-2 rounded-full">
                    View Payslips →
                  </Link>
                </div>
              )}
            </div>
          </SectionCard>
        </motion.div>
      </div>

      {/* ── My Team (collapsible) ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
        <SectionCard>
          <button 
            className="w-full flex items-center justify-between px-4 py-3 sm:py-4 text-left hover:bg-violet-50/50 transition-colors"
            onClick={() => setShowTeam(v => !v)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon d={IC.users} className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600 flex-shrink-0" />
              <span className="font-bold text-violet-900 text-sm sm:text-base">My Team</span>
              {teamDept && (
                <span className="text-xs text-violet-400 truncate hidden sm:inline">· {teamDept}</span>
              )}
              {team.length > 0 && (
                <span className="flex-shrink-0 text-[10px] sm:text-xs bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full">
                  {team.length}
                </span>
              )}
            </div>
            <Icon d={IC.chevron} className={`w-4 h-4 sm:w-5 sm:h-5 text-violet-400 flex-shrink-0 transition-transform duration-200 ${showTeam ? 'rotate-180' : ''}`} />
          </button>

          {showTeam && (
            <div className="border-t border-violet-50 p-4">
              {team.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-violet-400">
                    {teamDept 
                      ? `No other members in ${teamDept} yet.` 
                      : 'No department assigned. Contact HR to set up your team.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {team.map(m => (
                    <div 
                      key={m._id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-violet-50/70 border border-violet-100 hover:bg-violet-100/60 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm">
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-violet-900 truncate">{m.name}</p>
                        <p className="text-xs text-violet-500 truncate capitalize">{m.designation || m.role}</p>
                        <p className="text-[10px] text-violet-400 truncate">{m.employeeId}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </motion.div>

      {/* ── CRM Stats (sales only) ── */}
      {isSales && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <SectionCard>
            <SectionHeader title="CRM Overview" linkTo="/crm" linkLabel="Manage Leads" />
            <div className="p-4">
              {crmStats ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Leads',  value: crmStats.total,          icon: <Icon d={IC.users} />,   color: 'violet', to: '/crm' },
                    { label: 'Interested',   value: crmStats.interested,     icon: <Icon d={IC.star} />,    color: 'golden', to: '/crm' },
                    { label: 'Converted',    value: crmStats.converted,      icon: <Icon d={IC.sparkle} />, color: 'green',  to: '/crm' },
                    { label: 'Conversion %', value: `${crmStats.conversionRate || 0}%`, icon: <Icon d={IC.trend} />, color: 'golden', to: '/crm' },
                  ].map(c => (
                    <KpiCard key={c.label} {...c} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-violet-300">
                  <Icon d={IC.crm} className="w-10 h-10 text-violet-300" />
                  <p className="text-sm text-violet-400">No CRM data available</p>
                  <Link to="/crm" className="text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 px-4 py-2 rounded-full">
                    Add Leads →
                  </Link>
                </div>
              )}
            </div>
          </SectionCard>
        </motion.div>
      )}

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
}