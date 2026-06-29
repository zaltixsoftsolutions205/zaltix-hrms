/**
 * AdminEmployeeHub.jsx
 * CEO Employee Management hub — embeds actual HR/Admin pages.
 * Hub grid → click card → full HR page rendered inline.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  violet:  { icon: 'bg-violet-50  text-violet-600  border-violet-100'  },
  blue:    { icon: 'bg-blue-50    text-blue-600    border-blue-100'    },
  emerald: { icon: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  amber:   { icon: 'bg-amber-50   text-amber-600   border-amber-100'   },
  indigo:  { icon: 'bg-indigo-50  text-indigo-600  border-indigo-100'  },
  rose:    { icon: 'bg-rose-50    text-rose-600    border-rose-100'    },
};

/* ── Hub card ── */
const SectionCard = ({ section, onClick }) => {
  const ac = ACCENT[section.accent] || ACCENT.violet;
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="w-full text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 group flex flex-col">
      {/* icon */}
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 mb-4 ${ac.icon}`}>
        <Icon d={section.icon} size={18} />
      </div>

      {/* label + desc */}
      <p className="font-bold text-gray-900 text-sm mb-1">{section.label}</p>
      <p className="text-xs text-gray-400 leading-relaxed flex-1">{section.desc}</p>

      {/* open cta */}
      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-1 text-xs font-semibold text-violet-500 group-hover:text-violet-700 transition-colors">
        <span>Open</span>
        <Icon d={IC.chevron} size={12} className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </motion.button>
  );
};

/* ════════════════════════════════════════════════════════════════
   MAIN: AdminEmployeeHub
════════════════════════════════════════════════════════════════ */
const AdminEmployeeHub = () => {
  const [active, setActive] = useState(null); // null = hub grid

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
    <div className="max-w-6xl mx-auto px-4 space-y-6">

      {/* Page header */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Employee Management</h2>
        <p className="text-sm text-gray-400 mt-0.5">Select a section to manage</p>
      </div>

      {/* Cards grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((sec, i) => (
          <motion.div key={sec.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}>
            <SectionCard section={sec} onClick={() => setActive(sec.key)} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default AdminEmployeeHub;
