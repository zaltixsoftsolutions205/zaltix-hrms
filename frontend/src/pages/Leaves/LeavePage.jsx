import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import Badge from '../../components/UI/Badge';
import EmptyState from '../../components/UI/EmptyState';
import { formatDate, capitalize } from '../../utils/helpers';
import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const TYPE_STYLE = {
  casual: 'bg-violet-100 text-violet-700 font-semibold',
  sick:   'bg-gray-100 text-gray-900 font-semibold',
  other:  'bg-amber-100 text-amber-700 font-semibold',
  lop:    'bg-gray-200 text-gray-700 font-semibold',
};

const TYPE_LABEL = {
  casual: 'Casual',
  sick:   'Sick',
  other:  'Other',
  lop:    'Loss of Pay',
};

const SESSION_LABEL = { morning: 'Morning', afternoon: 'Afternoon' };

const STATUS_OPACITY = {
  approved: '',
  pending:  'opacity-60',
  rejected: 'opacity-30 line-through',
};

const LeaveCalendar = ({ leaves, calMonth, calYear, onPrev, onNext }) => {
  // Expand each leave into individual days for the calendar
  const dayMap = {};
  leaves.forEach(leave => {
    let d = new Date(leave.fromDate);
    const end = new Date(leave.toDate);
    d.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    while (d <= end) {
      const key = d.toISOString().split('T')[0];
      if (!dayMap[key] || dayMap[key].status === 'pending') {
        dayMap[key] = { status: leave.status, type: leave.type };
      }
      d.setDate(d.getDate() + 1);
    }
  });

  const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div>
      {/* Navigation header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrev}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-600 transition-colors">
          <SI d="M15 19l-7-7 7-7" size={16} />
        </button>
        <h4 className="font-bold text-violet-900 text-sm sm:text-base">
          {MONTH_NAMES[calMonth - 1]} {calYear}
        </h4>
        <button onClick={onNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-600 transition-colors">
          <SI d="M9 5l7 7-7 7" size={16} />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
        {[
          { label: 'Casual',       cls: 'bg-violet-100 text-violet-700' },
          { label: 'Sick',         cls: 'bg-gray-100 text-gray-900' },
          { label: 'Other',        cls: 'bg-amber-100 text-amber-700' },
          { label: 'Loss of Pay',  cls: 'bg-gray-200 text-gray-700' },
        ].map(l => (
          <span key={l.label} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${l.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />{l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-30" />Pending/Rejected = faded
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
          const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const info = dayMap[dateStr];
          const isToday = dateStr === todayStr;
          return (
            <div key={day} title={info ? `${info.type} leave (${info.status})` : dateStr}
              className="aspect-square flex items-center justify-center">
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[11px] sm:text-xs transition-all
                ${info ? TYPE_STYLE[info.type] || TYPE_STYLE.other : 'text-violet-300'}
                ${info ? STATUS_OPACITY[info.status] : ''}
                ${isToday ? 'ring-2 ring-violet-500 ring-offset-1' : ''}
              `}>
                {day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LeavePage = () => {
  const [data, setData] = useState({ leaves: [], balance: {} });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: 'casual', fromDate: '', toDate: '', reason: '', halfDay: false, session: 'morning' });
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calYear, setCalYear]   = useState(now.getFullYear());

  const prevMonth = () => {
    if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const fetch = async () => {
    try {
      const res = await api.get('/leaves/my');
      setData(res.data);
    } catch {}
  };
  useEffect(() => { fetch(); }, []);

  const handleApply = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/leaves', form);
      toast.success('Leave request submitted!');
      setShowModal(false);
      setForm({ type: 'casual', fromDate: '', toDate: '', reason: '', halfDay: false, session: 'morning' });
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to submit'); }
    finally { setLoading(false); }
  };

  // Derive leave intelligence from existing balance data
  const leaveAlerts = (() => {
    if (!data.balance || !Object.keys(data.balance).length) return [];
    const alerts = [];
    const casual = data.balance.casual;
    const sick   = data.balance.sick;
    if (casual && casual.remaining === 0)
      alerts.push({ level: 'error', message: `You have no casual leaves remaining. Any further absence will be Loss of Pay (LOP).` });
    else if (casual && casual.remaining <= 1)
      alerts.push({ level: 'warning', message: `Only ${casual.remaining} casual leave remaining for this year. Use it wisely.` });
    if (sick && sick.remaining === 0)
      alerts.push({ level: 'warning', message: `No sick leaves remaining. Future sick leave will be deducted from casual balance.` });
    const pending = data.leaves?.filter(l => l.status === 'pending').length ?? 0;
    if (pending > 0)
      alerts.push({ level: 'info', message: `${pending} leave request${pending > 1 ? 's are' : ' is'} pending approval.` });
    return alerts;
  })();

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      <IntelligenceAlerts alerts={leaveAlerts} />
      {/* Leave Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(data.balance).map(([type, bal]) => {
          const isLOP = type === 'lop';
          return (
            <motion.div key={type} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className={`glass-card p-4 ${isLOP ? 'border-l-4 border-l-gray-400' : ''}`}>
              <p className="kpi-label">{TYPE_LABEL[type] || type} Leave</p>
              <div className="flex items-end justify-between mt-1">
                <p className={`text-xl sm:text-2xl font-bold ${isLOP ? 'text-gray-700' : 'text-violet-900'}`}>
                  {isLOP ? bal.used : bal.remaining}
                </p>
                <p className="text-xs text-violet-500">
                  {isLOP ? `${bal.used} day(s) taken` : `${bal.used}/${bal.total} used`}
                </p>
              </div>
              {!isLOP && (
                <div className="h-1.5 bg-violet-200 rounded-full mt-3 overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${bal.total > 0 ? (bal.used / bal.total) * 100 : 0}%` }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="h-full bg-violet-600 rounded-full" />
                </div>
              )}
              <p className={`text-xs font-medium mt-1 ${isLOP ? 'text-gray-500' : 'text-violet-600'}`}>
                {isLOP ? 'Salary deducted' : `${bal.remaining} remaining`}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Calendar + Leave List */}
      <Card>
        <div className="lg:flex lg:gap-6">
          {/* Calendar — compact on desktop */}
          <div className="lg:w-64 lg:flex-shrink-0">
            <LeaveCalendar
              leaves={data.leaves}
              calMonth={calMonth}
              calYear={calYear}
              onPrev={prevMonth}
              onNext={nextMonth}
            />
          </div>

          {/* Divider */}
          <div className="border-t border-violet-100 my-5 lg:hidden" />
          <div className="hidden lg:block w-px bg-violet-100 flex-shrink-0" />

          {/* Leave List */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-violet-900 text-sm sm:text-base">My Leave Requests</h3>
                <p className="text-xs text-violet-500 mt-0.5">{data.leaves.length} request{data.leaves.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowModal(true)} className="btn-primary btn-sm">
                + Apply Leave
              </button>
            </div>

            {data.leaves.length === 0 ? (
              <EmptyState icon={<SI d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={40} color="text-violet-400" />} title="No leave requests" message="You haven't applied for any leaves yet."
                action={{ label: 'Apply Leave', onClick: () => setShowModal(true) }} />
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {data.leaves.map(leave => (
                  <motion.div key={leave._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="p-3 sm:p-4 border border-violet-100 rounded-xl hover:bg-violet-50/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-violet-900 text-sm">{TYPE_LABEL[leave.type] || leave.type} Leave</span>
                          {leave.halfDay && <span className="badge badge-yellow">½ Day · {SESSION_LABEL[leave.session] || leave.session}</span>}
                          <Badge status={leave.status} />
                        </div>
                        <p className="text-xs sm:text-sm text-violet-600">{formatDate(leave.fromDate)} → {formatDate(leave.toDate)}
                          <span className="ml-2 text-xs text-violet-400">({leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''})</span>
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">{leave.reason}</p>
                        {leave.approverComments && (
                          <p className="text-xs text-violet-500 mt-1 italic">Note: {leave.approverComments}</p>
                        )}
                      </div>
                      <p className="text-xs text-violet-400 whitespace-nowrap flex-shrink-0">{formatDate(leave.createdAt)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Apply Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Apply for Leave">
        <form onSubmit={handleApply} className="space-y-4">
          <div>
            <label className="input-label">Leave Type</label>
            <select className="input-field" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="casual">Casual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="other">Other Leave</option>
              <option value="lop">Loss of Pay</option>
            </select>
            {form.type === 'lop' && (
              <p className="mt-1 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                Loss of Pay leaves will result in salary deduction and are subject to HR approval.
              </p>
            )}
          </div>
          {/* Half Day toggle */}
          <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-lg border border-violet-100">
            <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
              <input type="checkbox" className="w-4 h-4 rounded accent-violet-600" checked={form.halfDay}
                onChange={e => setForm(f => ({ ...f, halfDay: e.target.checked, toDate: e.target.checked ? f.fromDate : f.toDate }))} />
              <span className="text-sm font-semibold text-violet-800">Half Day</span>
            </label>
            {form.halfDay && (
              <select className="input-field w-auto text-xs py-1" value={form.session}
                onChange={e => setForm(f => ({ ...f, session: e.target.value }))}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
              </select>
            )}
          </div>
          <div className={form.halfDay ? '' : 'grid grid-cols-2 gap-3'}>
            <div>
              <label className="input-label">{form.halfDay ? 'Date' : 'From Date'}</label>
              <input type="date" className="input-field" required value={form.fromDate}
                onChange={e => setForm(f => ({ ...f, fromDate: e.target.value, toDate: f.halfDay ? e.target.value : f.toDate }))} min={new Date().toISOString().split('T')[0]} />
            </div>
            {!form.halfDay && (
              <div>
                <label className="input-label">To Date</label>
                <input type="date" className="input-field" required value={form.toDate}
                  onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))} min={form.fromDate || new Date().toISOString().split('T')[0]} />
              </div>
            )}
          </div>
          <div>
            <label className="input-label">Reason</label>
            <textarea className="input-field" rows={3} required value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Explain the reason for your leave..." />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default LeavePage;
