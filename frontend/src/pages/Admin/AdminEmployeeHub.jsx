/**
 * AdminEmployeeHub.jsx
 * CEO Employee Management hub — embeds actual HR/Admin pages.
 * Hub grid → click card → full HR page rendered inline.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';

/* ── Real HR / Admin pages ── */
import HREmployees     from '../HR/HREmployees';
import AdminDepartments from './AdminDepartments';
import HRAttendance    from '../HR/HRAttendance';
import HRLeaves        from '../HR/HRLeaves';
import AdminPolicies   from './AdminPolicies';
import HolidaysPage    from './HolidaysPage';
import AnnouncementsPage from './AnnouncementsPage';

/* ── tiny icon ── */
const Icon = ({ d, size = 15, className = '', sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

/* ── icon paths ── */
const IC = {
  employees:   "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  departments: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  attendance:  "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  leaves:      "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  policies:    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4",
  holidays:    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  announce:    "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
  chevron:     "M9 5l7 7-7 7",
};

/* ════════════════════════════════════════════════════════════════
   SECTIONS CONFIG
════════════════════════════════════════════════════════════════ */
const SECTIONS = [
  {
    key: 'employees',
    label: 'Employees',
    desc: 'Manage all team members, roles and employment details',
    icon: IC.employees,
    accent: 'violet',
  },
  {
    key: 'departments',
    label: 'Departments',
    desc: 'Manage organisational departments and their leads',
    icon: IC.departments,
    accent: 'blue',
  },
  {
    key: 'attendance',
    label: 'Attendance',
    desc: 'View daily check-in and check-out records by date',
    icon: IC.attendance,
    accent: 'emerald',
  },
  {
    key: 'leaves',
    label: 'Leaves',
    desc: 'Review and manage employee leave requests',
    icon: IC.leaves,
    accent: 'amber',
  },
  {
    key: 'leave-policies',
    label: 'Leave Management',
    desc: 'Configure annual leave policies and allocations',
    icon: IC.policies,
    accent: 'indigo',
  },
  {
    key: 'holidays',
    label: 'Holidays',
    desc: 'Manage company-wide public and optional holidays',
    icon: IC.holidays,
    accent: 'rose',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    desc: 'Post and manage company-wide notices to all staff',
    icon: IC.announce,
    accent: 'violet',
  },
];

/* ── accent color map ── */
const ACCENT = {
  violet:  { icon: 'bg-violet-100  text-violet-600',  cta: 'text-violet-600',  hover: 'hover:border-violet-300',  glow: 'group-hover:bg-violet-50/60'  },
  blue:    { icon: 'bg-blue-100    text-blue-600',    cta: 'text-blue-600',    hover: 'hover:border-blue-300',    glow: 'group-hover:bg-blue-50/60'    },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', cta: 'text-emerald-600', hover: 'hover:border-emerald-300', glow: 'group-hover:bg-emerald-50/60' },
  amber:   { icon: 'bg-amber-100   text-amber-600',   cta: 'text-amber-600',   hover: 'hover:border-amber-300',   glow: 'group-hover:bg-amber-50/60'   },
  indigo:  { icon: 'bg-indigo-100  text-indigo-600',  cta: 'text-indigo-600',  hover: 'hover:border-indigo-300',  glow: 'group-hover:bg-indigo-50/60'  },
  rose:    { icon: 'bg-rose-100    text-rose-500',    cta: 'text-rose-500',    hover: 'hover:border-rose-300',    glow: 'group-hover:bg-rose-50/60'    },
};

/* ── Hub card ── */
// NOTE: index.css applies `justify-content:center` to every <button>, which
// centres this card's contents. `items-start` + `justify-start` override it
// so the layout stays left-aligned like the rest of the app.
const SectionCard = ({ section, onClick, wide = false }) => {
  const ac = ACCENT[section.accent] || ACCENT.violet;
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full h-full text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all duration-200 group flex flex-col !items-start !justify-start relative overflow-hidden ${ac.hover}`}>
      {/* soft tint that blooms on hover */}
      <span className={`absolute inset-0 bg-transparent transition-colors duration-200 pointer-events-none ${ac.glow}`} />

      <div className={`relative z-10 flex w-full ${wide ? 'items-center gap-4' : 'flex-col items-start'}`}>
        {/* icon */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${wide ? '' : 'mb-4'} ${ac.icon}`}>
          <Icon d={section.icon} size={19} />
        </div>

        {/* label + desc */}
        <div className="min-w-0 text-left">
          <p className="font-bold text-gray-900 text-[15px] mb-1 text-left">{section.label}</p>
          <p className="text-xs text-gray-400 leading-relaxed text-left">{section.desc}</p>
        </div>
      </div>

      {/* open cta */}
      <div className={`relative z-10 mt-auto pt-4 flex items-center gap-1 text-xs font-bold ${ac.cta}`}>
        <span>Open</span>
        <Icon d={IC.chevron} size={12} className="transition-transform group-hover:translate-x-1" />
      </div>
    </motion.button>
  );
};

/* ════════════════════════════════════════════════════════════════
   MAIN: AdminEmployeeHub
════════════════════════════════════════════════════════════════ */
const AdminEmployeeHub = () => {
  const [active, setActive] = useState(null); // null = hub grid
  const [stats, setStats] = useState(null);
  const [deptCount, setDeptCount] = useState(null);

  useEffect(() => {
    api.get('/admin/dashboard-stats').then(r => setStats(r.data)).catch(() => { });
    api.get('/admin/departments').then(r => setDeptCount((r.data || []).length)).catch(() => { });
  }, []);

  // Attendance rate for today, guarded against a zero headcount.
  const attendanceRate = stats?.totalEmployees > 0
    ? Math.round((stats.presentToday / stats.totalEmployees) * 100)
    : null;

  const renderSection = () => {
    switch (active) {
      case 'employees':     return <HREmployees />;
      case 'departments':   return <AdminDepartments />;
      case 'attendance':    return <HRAttendance />;
      case 'leaves':        return <HRLeaves />;
      case 'leave-policies':return <AdminPolicies />;
      case 'holidays':      return <HolidaysPage />;
      case 'announcements': return <AnnouncementsPage />;
      default:              return null;
    }
  };

  const currentSection = SECTIONS.find(s => s.key === active);

  /* ───────────────── DETAIL VIEW ───────────────── */
  if (active) {
    const ac = ACCENT[currentSection?.accent] || ACCENT.violet;
    return (
      <div className="space-y-4">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 flex-wrap px-1">
          <button
            onClick={() => setActive(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-violet-600 transition-colors px-2.5 py-1.5 rounded-xl hover:bg-violet-50 -ml-2.5">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Employee Management
          </button>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-200 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-bold text-gray-700">{currentSection?.label}</span>
        </div>

        {/* Section content — actual HR page */}
        <AnimatePresence mode="wait">
          <motion.div key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}>
            {renderSection()}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  /* ───────────────── HUB GRID VIEW ───────────────── */
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-5 animate-fade-in">

      {/* ═══ HERO BANNER ═══ */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-100 via-violet-50 to-indigo-50 border border-violet-200/60 px-4 sm:px-5 py-3.5">
        {/* decorative arcs */}
        <svg className="absolute right-0 top-0 h-full w-1/3 opacity-30 pointer-events-none" viewBox="0 0 400 200" fill="none" preserveAspectRatio="xMaxYMid slice">
          <circle cx="330" cy="60" r="120" stroke="#A78BFA" strokeWidth="1" fill="none" />
          <circle cx="360" cy="140" r="90" stroke="#818CF8" strokeWidth="1" fill="none" />
          <circle cx="300" cy="180" r="140" stroke="#C4B5FD" strokeWidth="1" fill="none" />
        </svg>

        <div className="relative flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
          {/* title block */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-10 h-10 rounded-xl bg-violet-200/70 text-violet-700 flex items-center justify-center flex-shrink-0">
              <Icon d={IC.employees} size={19} sw={1.6} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight leading-tight">Employee Management</h2>
              <p className="text-[11px] sm:text-xs text-violet-900/50 mt-0.5 truncate">Manage your workforce effectively and efficiently</p>
            </div>
          </div>

          {/* live stats */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 flex-shrink-0">
            {[
              {
                label: 'Total Employees', value: stats?.totalEmployees, icon: IC.employees,
                chip: 'bg-violet-100 text-violet-600',
                sub: stats?.totalEmployees != null ? 'Active headcount' : null,
              },
              {
                label: 'Departments', value: deptCount, icon: IC.departments,
                chip: 'bg-blue-100 text-blue-600',
                sub: 'Active departments',
              },
              {
                label: 'Attendance Rate', value: attendanceRate != null ? `${attendanceRate}%` : null, icon: IC.attendance,
                chip: 'bg-emerald-100 text-emerald-600',
                sub: stats?.presentToday != null ? `${stats.presentToday} present today` : null,
              },
            ].map(s => (
              <div key={s.label} title={s.sub || s.label}
                className="bg-white/80 backdrop-blur rounded-xl px-2.5 sm:px-3 py-2 shadow-sm border border-white/60 flex items-center gap-2 min-w-0">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${s.chip}`}>
                  <Icon d={s.icon} size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-extrabold text-gray-900 leading-none tabular-nums">
                    {s.value ?? '—'}
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 font-semibold mt-0.5 leading-tight truncate">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Cards grid — Announcements spans the full width, as in the design */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        {SECTIONS.map((sec, i) => {
          const wide = sec.key === 'announcements';
          return (
            <motion.div key={sec.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
              <SectionCard section={sec} onClick={() => setActive(sec.key)} wide={wide} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminEmployeeHub;
