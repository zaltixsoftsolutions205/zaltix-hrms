import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import EmptyState from '../../components/UI/EmptyState';
import { formatTime12 } from '../../utils/helpers';
import { useAttendance } from '../../hooks/useAttendance';
import LocationCheckModal from '../../components/UI/LocationCheckModal';
import { useAuth } from '../../contexts/AuthContext';
import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const STATUS_STYLE = {
  present:    'bg-green-100 text-green-700 font-semibold',
  absent:     'bg-red-100 text-red-700 font-semibold',
  'half-day': 'bg-amber-100 text-amber-700 font-semibold',
};

const REG_BADGE = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const MonthCalendar = ({ year, month, records }) => {
  const dayMap = {};
  records?.forEach(r => {
    const key = r.date?.split('T')[0];
    if (key) dayMap[key] = { status: r.status, isLate: r.isLate, isEarlyLeave: r.isEarlyLeave };
  });

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
        {[
          { label: 'Present',  cls: 'bg-green-100 text-green-700' },
          { label: 'Absent',   cls: 'bg-red-100 text-red-700' },
          { label: 'Half Day', cls: 'bg-amber-100 text-amber-700' },
        ].map(l => (
          <span key={l.label} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${l.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />{l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-600">
          <span className="w-1.5 h-1.5 rounded-full border-2 border-violet-500" />Today
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-900">
          <span className="w-1.5 h-1.5 rounded-full bg-current" />Late / Early
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-current" />Sunday
        </span>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_DAYS.map(d => (
          <div key={d} className="text-center text-[10px] sm:text-xs font-semibold text-violet-400 py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const info = dayMap[dateStr];
          const status = info?.status;
          const hasIssue = info?.isLate || info?.isEarlyLeave;
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          const dayOfWeek = new Date(year, month - 1, day).getDay();
          const isWeekend = dayOfWeek === 0; // Only Sunday is off; Saturday is a working day

          // Past weekday with no record → treat as absent
          const effectiveStatus = status || (isPast && !isWeekend ? 'absent' : null);

          return (
            <div key={day}
              title={
                isWeekend ? 'Weekend' :
                effectiveStatus ? `${effectiveStatus.replace('-', ' ')}${hasIssue ? ' · Late/Early' : ''}` :
                dateStr
              }
              className="aspect-square flex items-center justify-center relative">
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[11px] sm:text-xs transition-all
                ${isWeekend ? 'text-gray-300' : effectiveStatus ? STATUS_STYLE[effectiveStatus] : 'text-violet-300'}
                ${isToday ? 'ring-2 ring-violet-500 ring-offset-1' : ''}
              `}>
                {day}
              </span>
              {hasIssue && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-gray-200 border border-white" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const getISTClock = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Inline regularization form for a record row
const RegularizeInline = ({ record, onDone }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return toast.error('Please enter a reason');
    setLoading(true);
    try {
      await api.post('/attendance/regularize', { attendanceId: record._id, reason });
      toast.success('Regularization request submitted');
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  if (record.regularizationStatus) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${REG_BADGE[record.regularizationStatus]}`}>
        {record.regularizationStatus === 'pending' && 'Pending HR'}
        {record.regularizationStatus === 'approved' && 'Regularized'}
        {record.regularizationStatus === 'rejected' && 'Rejected'}
      </span>
    );
  }

  return (
    <div>
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="text-xs text-gray-900 font-semibold hover:text-gray-900 underline underline-offset-2">
          Request
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <input
            className="input-field text-xs py-1 px-2"
            placeholder="Reason for late/early…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            autoFocus
          />
          <div className="flex gap-1.5">
            <button onClick={submit} disabled={loading}
              className="btn-primary btn-xs text-xs px-2 py-1 flex-1">
              {loading ? '…' : 'Submit'}
            </button>
            <button onClick={() => setOpen(false)}
              className="btn-secondary btn-xs text-xs px-2 py-1">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const AttendancePage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(getISTClock());
  const [regReason, setRegReason] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [showRegForm, setShowRegForm] = useState(false);
  const now = new Date();
  const [filter, setFilter] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });

  useEffect(() => {
    const timer = setInterval(() => setClock(getISTClock()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/attendance/my?month=${filter.month}&year=${filter.year}`);
      setData(res.data);
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAttendance(); }, [filter.month, filter.year]);

  const {
    loading: actionLoading,
    locationModal, setLocationModal,
    handleCheckIn, handleCheckOut, confirmAction,
  } = useAttendance(fetchAttendance);

  const handleRegularizeToday = async () => {
    if (!regReason.trim()) return toast.error('Please enter a reason');
    setRegLoading(true);
    try {
      await api.post('/attendance/regularize', { attendanceId: today?._id, reason: regReason });
      toast.success('Regularization request submitted — awaiting HR approval');
      setShowRegForm(false);
      setRegReason('');
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally {
      setRegLoading(false);
    }
  };

  const today = data?.todayRecord;
  const todayHasIssue = today?.isLate || today?.isEarlyLeave;

  // Derive attendance intelligence from existing records — no extra API call
  const attendanceAlerts = (() => {
    if (!data?.records?.length) return [];
    const records = data.records;
    const lateDays = records.filter(r => r.isLate).length;
    const earlyDays = records.filter(r => r.isEarlyLeave).length;
    const missingCheckout = records.filter(r => r.checkIn && !r.checkOut && r.status === 'present').length;
    const alerts = [];
    if (lateDays >= 5)
      alerts.push({ level: 'error', message: `You have been late ${lateDays} times this month. This is affecting your attendance score. Please maintain office hours (9:30 AM).` });
    else if (lateDays >= 3)
      alerts.push({ level: 'warning', message: `You have ${lateDays} late check-ins this month. 5 or more will impact your performance score.` });
    if (earlyDays >= 3)
      alerts.push({ level: 'warning', message: `${earlyDays} early leaves recorded this month. Each one reduces your attendance score.` });
    if (missingCheckout > 0)
      alerts.push({ level: 'info', message: `${missingCheckout} day${missingCheckout > 1 ? 's' : ''} missing check-out this month. Regularize to avoid absent marking.`, link: '/attendance' });
    return alerts;
  })();

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      <IntelligenceAlerts alerts={attendanceAlerts} />

      {/* Today's Attendance Card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 sm:p-6">
        <div className="flex items-start justify-between mb-1 gap-3">
          <div>
            <h3 className="font-bold text-violet-900 text-base sm:text-lg">Today's Attendance</h3>
            <p className="text-xs sm:text-sm text-violet-500 mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base sm:text-2xl font-bold text-violet-800 tabular-nums leading-tight">{clock}</p>
            <p className="text-[10px] sm:text-xs text-violet-400">Indian Standard Time</p>
          </div>
        </div>

        {/* Late / Early Leave notice */}
        {todayHasIssue && (
          <div className="mt-3 flex flex-wrap gap-2">
            {today.isLate && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-900">
                <SI d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" size={13} color="text-gray-900" />
                Late Arrival ({formatTime12(today.checkIn)})
              </span>
            )}
            {today.isEarlyLeave && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-900">
                <SI d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" size={13} color="text-gray-900" />
                Early Leave ({formatTime12(today.checkOut)})
              </span>
            )}
            {/* Regularization status / action */}
            {today.regularizationStatus ? (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${REG_BADGE[today.regularizationStatus]}`}>
                {today.regularizationStatus === 'pending' && 'Regularization Pending HR'}
                {today.regularizationStatus === 'approved' && 'Regularization Approved'}
                {today.regularizationStatus === 'rejected' && `Regularization Rejected${today.regularizationComment ? ` — ${today.regularizationComment}` : ''}`}
              </span>
            ) : (
              <button onClick={() => setShowRegForm(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors">
                <SI d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" size={12} />
                Request Regularization
              </button>
            )}
          </div>
        )}

        {/* Regularization form */}
        {showRegForm && !today?.regularizationStatus && todayHasIssue && (
          <div className="mt-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
            <p className="text-xs font-semibold text-violet-700 mb-2">Reason for {today?.isLate && today?.isEarlyLeave ? 'late arrival & early leave' : today?.isLate ? 'late arrival' : 'early leave'}:</p>
            <textarea
              className="input-field w-full text-sm resize-none"
              rows={2}
              placeholder="e.g. Traffic / Doctor appointment / Emergency…"
              value={regReason}
              onChange={e => setRegReason(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleRegularizeToday} disabled={regLoading}
                className="btn-primary btn-sm flex-1">
                {regLoading ? 'Submitting…' : 'Submit for HR Approval'}
              </button>
              <button onClick={() => { setShowRegForm(false); setRegReason(''); }}
                className="btn-secondary btn-sm">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mt-4">
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <div className="text-center">
              <p className="text-xs text-violet-500 mb-1">Check In</p>
              <p className="text-lg sm:text-xl font-bold text-violet-900">{formatTime12(today?.checkIn)}</p>
            </div>
            <div className="w-6 sm:w-8 h-px bg-violet-200" />
            <div className="text-center">
              <p className="text-xs text-violet-500 mb-1">Check Out</p>
              <p className="text-lg sm:text-xl font-bold text-violet-900">{formatTime12(today?.checkOut)}</p>
            </div>
            {today?.workHours > 0 && (
              <>
                <div className="w-6 sm:w-8 h-px bg-violet-200" />
                <div className="text-center">
                  <p className="text-xs text-violet-500 mb-1">Hours</p>
                  <p className="text-lg sm:text-xl font-bold text-golden-600">{today.workHours}h</p>
                </div>
              </>
            )}
          </div>

          {!isAdmin && (
            <div className="flex gap-3 sm:ml-auto">
              {!today?.checkIn && (
                <button onClick={handleCheckIn} disabled={actionLoading} className="btn-sm flex-1 sm:flex-none bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2 transition-colors">
                  {actionLoading ? '...' : (
                    <span className="flex items-center justify-center gap-1.5">
                      <SI d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={15} color="text-white" /> Check In
                    </span>
                  )}
                </button>
              )}
              {today?.checkIn && !today?.checkOut && (
                <button onClick={handleCheckOut} disabled={actionLoading} className="btn-sm flex-1 sm:flex-none bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2 transition-colors">
                  <span className="flex items-center justify-center gap-1.5">
                    <SI d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" size={15} color="text-white" /> Check Out
                  </span>
                </button>
              )}
              {today?.checkIn && today?.checkOut && (
                <span className="badge-green px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                  Day Complete <SI d="M5 13l4 4L19 7" size={14} color="text-violet-600" />
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Monthly KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Present"     value={data?.summary?.present ?? '—'}     icon={<SI d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-violet-600" />} color="green" />
        <KpiCard label="Absent"      value={data?.summary?.absent ?? '—'}      icon={<SI d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-gray-900" />} color="red" />
        <KpiCard label="Half Day"    value={data?.summary?.halfDay ?? '—'}     icon={<SI d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" size={14} color="text-violet-500" />} color="golden" />
        <KpiCard label="Total Hours" value={data?.summary?.totalWorkHours ? `${data.summary.totalWorkHours}h` : '—'} icon={<SI d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-amber-500" />} color="violet" />
      </div>

      {/* Calendar + History in one card */}
      <Card>
        {/* Month / Year filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <h3 className="font-bold text-violet-900 text-base">
            {MONTH_NAMES[filter.month - 1]} {filter.year}
          </h3>
          <div className="flex flex-wrap gap-2">
            <select className="input-field flex-1 sm:flex-none sm:w-auto" value={filter.month}
              onChange={e => setFilter(f => ({ ...f, month: parseInt(e.target.value) }))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
              ))}
            </select>
            <select className="input-field w-24 sm:w-auto" value={filter.year}
              onChange={e => setFilter(f => ({ ...f, year: parseInt(e.target.value) }))}>
              {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-violet-400 text-sm">Loading...</div>
        ) : (
          <>
            <div className="lg:flex lg:gap-6">
              {/* ── Calendar (compact on desktop) ── */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lg:w-64 lg:flex-shrink-0">
                <MonthCalendar year={filter.year} month={filter.month} records={data?.records} />
              </motion.div>

              {/* Divider */}
              <div className="border-t border-violet-100 my-5 lg:hidden" />
              <div className="hidden lg:block w-px bg-violet-100 flex-shrink-0" />

              {/* ── History Table ── */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-violet-800 mb-3">Detailed Records</h4>
                {data?.records?.length === 0 ? (
                  <EmptyState
                    icon={<SI d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={40} color="text-violet-400" />}
                    title="No attendance records"
                    message="No records found for the selected period."
                  />
                ) : (
                  <div className="overflow-x-auto -mx-5 px-5 lg:mx-0 lg:px-0">
                    <table className="data-table min-w-[560px]">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Check In</th>
                          <th>Check Out</th>
                          <th>Work Hours</th>
                          <th>Status</th>
                          <th>Regularization</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.records?.map(record => (
                          <tr key={record._id}>
                            <td className="font-medium whitespace-nowrap">
                              {new Date(record.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })}
                            </td>
                            <td className="whitespace-nowrap">
                              <span className={record.isLate ? 'text-gray-900 font-semibold' : ''}>{formatTime12(record.checkIn)}</span>
                              {record.isLate && <span className="ml-1 text-[10px] text-gray-900 font-bold">LATE</span>}
                            </td>
                            <td className="whitespace-nowrap">
                              <span className={record.isEarlyLeave ? 'text-gray-900 font-semibold' : ''}>{formatTime12(record.checkOut)}</span>
                              {record.isEarlyLeave && <span className="ml-1 text-[10px] text-gray-900 font-bold">EARLY</span>}
                            </td>
                            <td>{record.workHours ? `${record.workHours}h` : '—'}</td>
                            <td><Badge status={record.status} /></td>
                            <td>
                              {(record.isLate || record.isEarlyLeave) ? (
                                <RegularizeInline record={record} onDone={fetchAttendance} />
                              ) : (
                                <span className="text-violet-300 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
      {!isAdmin && (
        <LocationCheckModal
          modal={locationModal}
          onConfirm={confirmAction}
          onCancel={() => setLocationModal(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default AttendancePage;
