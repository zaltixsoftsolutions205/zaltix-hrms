import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import EmptyState from '../../components/UI/EmptyState';
import { formatTime12 } from '../../utils/helpers';
import { useAttendance } from '../../hooks/useAttendance';
import LocationCheckModal from '../../components/UI/LocationCheckModal';
import { useAuth } from '../../contexts/AuthContext';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const getISTClock = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

const REG_BADGE = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// ── Regularization review panel ─────────────────────────────────────────────
const RegularizationsPanel = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviewing, setReviewing] = useState({}); // { [id]: { comment, loading } }

  const fetchRegs = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/attendance/regularizations${statusFilter ? `?status=${statusFilter}` : ''}`);
      setRecords(res.data);
    } catch { toast.error('Failed to load regularizations'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRegs(); }, [statusFilter]);

  const initReview = (id) => {
    setReviewing(prev => ({ ...prev, [id]: { comment: '', loading: false } }));
  };

  const setComment = (id, val) => {
    setReviewing(prev => ({ ...prev, [id]: { ...prev[id], comment: val } }));
  };

  const submit = async (id, status) => {
    setReviewing(prev => ({ ...prev, [id]: { ...prev[id], loading: true } }));
    try {
      await api.patch(`/attendance/regularizations/${id}`, {
        status,
        comment: reviewing[id]?.comment || '',
      });
      toast.success(`Request ${status}`);
      setReviewing(prev => { const c = { ...prev }; delete c[id]; return c; });
      fetchRegs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
      setReviewing(prev => ({ ...prev, [id]: { ...prev[id], loading: false } }));
    }
  };

  return (
    <Card>
      {/* Sub-filter */}
      <div className="filter-bar mb-5">
        {['pending', 'approved', 'rejected', ''].map((s, i) => (
          <button key={i}
            className={statusFilter === s ? 'filter-pill-active' : 'filter-pill-inactive'}
            onClick={() => setStatusFilter(s)}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-violet-400">{records.length} request{records.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="py-10 text-center text-violet-400 text-sm">Loading...</div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<SI d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={40} color="text-violet-400" />}
          title="No regularization requests"
          message={statusFilter === 'pending' ? 'No pending requests at the moment.' : 'No requests found.'}
        />
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const isReviewing = !!reviewing[r._id];
            const rv = reviewing[r._id] || {};
            return (
              <div key={r._id} className="border border-violet-100 rounded-xl p-4 bg-white hover:bg-violet-50/30 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left: employee + details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-semibold text-violet-900">{r.employee?.name}</p>
                      <span className="text-xs text-violet-400">{r.employee?.employeeId}</span>
                      <span className="text-xs font-medium text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">{r.date}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {r.isLate && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-900">
                          Late Arrival · {formatTime12(r.checkIn)}
                        </span>
                      )}
                      {r.isEarlyLeave && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-900">
                          Early Leave · {formatTime12(r.checkOut)}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${REG_BADGE[r.regularizationStatus]}`}>
                        {r.regularizationStatus}
                      </span>
                    </div>
                    <p className="text-sm text-violet-700">
                      <span className="font-medium text-violet-500">Reason: </span>{r.regularizationReason}
                    </p>
                    {r.regularizationComment && (
                      <p className="text-xs text-violet-500 mt-1">
                        <span className="font-medium">HR Note: </span>{r.regularizationComment}
                      </p>
                    )}
                  </div>

                  {/* Right: action buttons (only for pending) */}
                  {r.regularizationStatus === 'pending' && (
                    <div className="flex-shrink-0">
                      {!isReviewing ? (
                        <button onClick={() => initReview(r._id)}
                          className="btn-secondary btn-sm text-xs">
                          Review
                        </button>
                      ) : (
                        <div className="flex flex-col gap-1.5 w-52">
                          <input
                            className="input-field text-xs py-1 px-2"
                            placeholder="Comment (optional)…"
                            value={rv.comment}
                            onChange={e => setComment(r._id, e.target.value)}
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => submit(r._id, 'approved')}
                              disabled={rv.loading}
                              className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
                              {rv.loading ? '…' : 'Approve'}
                            </button>
                            <button
                              onClick={() => submit(r._id, 'rejected')}
                              disabled={rv.loading}
                              className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-gray-200 text-white hover:bg-gray-200 disabled:opacity-50 transition-colors">
                              {rv.loading ? '…' : 'Reject'}
                            </button>
                            <button
                              onClick={() => setReviewing(prev => { const c = { ...prev }; delete c[r._id]; return c; })}
                              className="text-xs px-2 py-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100">
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

// ── Main HR Attendance page ──────────────────────────────────────────────────
const HRAttendance = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('records'); // 'records' | 'regularizations'
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pendingRegCount, setPendingRegCount] = useState(0);
  const now = new Date();
  const todayIST = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [filter, setFilter] = useState({ viewMode: 'range', fromDate: todayIST, toDate: todayIST, month: now.getMonth() + 1, year: now.getFullYear(), employeeId: '', departmentId: '' });

  // Personal check-in/out state
  const [todayRecord, setTodayRecord] = useState(null);
  const [clock, setClock] = useState(getISTClock());

  useEffect(() => {
    const timer = setInterval(() => setClock(getISTClock()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTodayRecord = () => {
    const m = now.getMonth() + 1, y = now.getFullYear();
    api.get(`/attendance/my?month=${m}&year=${y}`)
      .then(r => setTodayRecord(r.data.todayRecord))
      .catch(() => {});
  };

  const {
    loading: actionLoading,
    locationModal, setLocationModal,
    handleCheckIn, handleCheckOut, confirmAction,
  } = useAttendance(fetchTodayRecord);

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data)).catch(() => {});
    api.get('/admin/departments').then(r => setDepartments(r.data)).catch(() => {});
    api.get('/attendance/regularizations?status=pending')
      .then(r => setPendingRegCount(r.data.length))
      .catch(() => {});
    fetchTodayRecord();
  }, []);

  const fetch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.viewMode === 'range' && filter.fromDate && filter.toDate) {
        params.append('fromDate', filter.fromDate);
        params.append('toDate', filter.toDate);
      } else {
        params.append('month', filter.month);
        params.append('year', filter.year);
      }
      if (filter.employeeId) params.append('employeeId', filter.employeeId);
      if (filter.departmentId) params.append('departmentId', filter.departmentId);
      const res = await api.get(`/attendance?${params}`);
      setRecords(res.data);
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [filter.viewMode, filter.fromDate, filter.toDate, filter.month, filter.year, filter.employeeId, filter.departmentId]);

  const exportCSV = () => {
    const header = 'Employee,Employee ID,Date,Check In,Check Out,Work Hours,Status,Late,Early Leave\n';
    const rows = records.map(r =>
      `${r.employee?.name},${r.employee?.employeeId},${r.date},${r.checkIn || ''},${r.checkOut || ''},${r.workHours || 0},${r.status},${r.isLate ? 'Yes' : 'No'},${r.isEarlyLeave ? 'Yes' : 'No'}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `attendance_${filter.month}_${filter.year}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported!');
  };

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Page header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Attendance Management</h2>
          <p className="page-subtitle">{tab === 'records' ? `${records.length} records found` : 'Regularization requests'}</p>
        </div>
        {tab === 'records' && (
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 self-start sm:self-auto">
            <SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={15} color="text-violet-600" /> Export CSV
          </button>
        )}
      </div>

      {/* Today's Attendance (personal) — hidden for admin */}
      {!isAdmin && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div>
              <h3 className="font-bold text-violet-900 text-base">My Attendance Today</h3>
              <p className="text-xs text-violet-500 mt-0.5">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-base sm:text-xl font-bold text-violet-800 tabular-nums leading-tight">{clock}</p>
              <p className="text-[10px] text-violet-400">IST</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              <div className="text-center">
                <p className="text-xs text-violet-500 mb-1">Check In</p>
                <p className="text-lg sm:text-xl font-bold text-violet-900">{formatTime12(todayRecord?.checkIn)}</p>
              </div>
              <div className="w-6 sm:w-8 h-px bg-violet-200" />
              <div className="text-center">
                <p className="text-xs text-violet-500 mb-1">Check Out</p>
                <p className="text-lg sm:text-xl font-bold text-violet-900">{formatTime12(todayRecord?.checkOut)}</p>
              </div>
              {todayRecord?.workHours > 0 && (
                <>
                  <div className="w-6 sm:w-8 h-px bg-violet-200" />
                  <div className="text-center">
                    <p className="text-xs text-violet-500 mb-1">Hours</p>
                    <p className="text-lg sm:text-xl font-bold text-golden-600">{todayRecord.workHours}h</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 sm:ml-auto">
              {!todayRecord?.checkIn && (
                <button onClick={handleCheckIn} disabled={actionLoading} className="btn-primary btn-sm flex-1 sm:flex-none">
                  {actionLoading ? '...' : (
                    <span className="flex items-center justify-center gap-1.5">
                      <SI d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={15} color="text-violet-100" /> Check In
                    </span>
                  )}
                </button>
              )}
              {todayRecord?.checkIn && !todayRecord?.checkOut && (
                <button onClick={handleCheckOut} disabled={actionLoading} className="btn-danger btn-sm flex-1 sm:flex-none">
                  <span className="flex items-center justify-center gap-1.5">
                    <SI d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={15} color="text-gray-900" /> Check Out
                  </span>
                </button>
              )}
              {todayRecord?.checkIn && todayRecord?.checkOut && (
                <span className="badge-green px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                  Day Complete <SI d="M5 13l4 4L19 7" size={14} color="text-violet-600" />
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-violet-50 p-1 rounded-xl w-fit">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'records' ? 'bg-white text-violet-800 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}
          onClick={() => setTab('records')}>
          Records
        </button>
        <button
          className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'regularizations' ? 'bg-white text-violet-800 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}
          onClick={() => { setTab('regularizations'); setPendingRegCount(0); }}>
          Regularizations
          {pendingRegCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-gray-200 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingRegCount > 9 ? '9+' : pendingRegCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'regularizations' ? (
        <RegularizationsPanel />
      ) : (
        <Card>
          {/* Filters */}
          <div className="flex flex-col gap-3 mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg overflow-hidden border border-violet-200 flex-shrink-0">
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${filter.viewMode === 'range' ? 'bg-violet-700 text-white' : 'bg-white text-violet-600 hover:bg-violet-50'}`}
                  onClick={() => setFilter(f => ({ ...f, viewMode: 'range' }))}>Date Range</button>
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${filter.viewMode === 'monthly' ? 'bg-violet-700 text-white' : 'bg-white text-violet-600 hover:bg-violet-50'}`}
                  onClick={() => setFilter(f => ({ ...f, viewMode: 'monthly' }))}>Monthly</button>
              </div>

              {filter.viewMode === 'range' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" className="input-field flex-1 sm:flex-none sm:w-auto min-w-[140px]"
                    value={filter.fromDate} onChange={e => setFilter(f => ({ ...f, fromDate: e.target.value, toDate: e.target.value > f.toDate ? e.target.value : f.toDate }))} />
                  <span className="text-xs text-violet-400 font-medium flex-shrink-0">to</span>
                  <input type="date" className="input-field flex-1 sm:flex-none sm:w-auto min-w-[140px]"
                    value={filter.toDate} min={filter.fromDate} onChange={e => setFilter(f => ({ ...f, toDate: e.target.value }))} />
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <select className="input-field flex-1 sm:flex-none sm:w-auto min-w-[140px]" value={filter.departmentId}
                onChange={e => setFilter(f => ({ ...f, departmentId: e.target.value, employeeId: '' }))}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
              <select className="input-field flex-1 sm:flex-none sm:w-auto min-w-[140px]" value={filter.employeeId}
                onChange={e => setFilter(f => ({ ...f, employeeId: e.target.value }))}>
                <option value="">All Employees</option>
                {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-violet-400 text-sm">Loading...</div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={<SI d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={40} color="text-violet-400" />}
              title="No attendance records"
              message="No records found for the selected filters."
            />
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden space-y-2">
                {records.map(r => (
                  <div key={r._id} className="p-3 border border-violet-100 rounded-xl">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-violet-900 text-sm truncate">{r.employee?.name}</p>
                        <p className="text-[10px] text-violet-400">{r.employee?.employeeId} · {r.date}</p>
                      </div>
                      <Badge status={r.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
                      <span className={r.isLate ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                        In: {formatTime12(r.checkIn)}{r.isLate && <span className="ml-1 text-[10px] font-bold text-red-500">LATE</span>}
                      </span>
                      <span className={r.isEarlyLeave ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                        Out: {formatTime12(r.checkOut)}{r.isEarlyLeave && <span className="ml-1 text-[10px] font-bold text-amber-600">EARLY</span>}
                      </span>
                      {r.workHours > 0 && <span className="text-violet-600 font-medium">{r.workHours}h</span>}
                      {r.regularizationStatus && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${REG_BADGE[r.regularizationStatus]}`}>
                          {r.regularizationStatus}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
                <table className="data-table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Hours</th>
                      <th>Status</th>
                      <th>Regularization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r._id}>
                        <td>
                          <p className="font-medium text-violet-900 whitespace-nowrap">{r.employee?.name}</p>
                          <p className="text-xs text-violet-400">{r.employee?.employeeId}</p>
                        </td>
                        <td className="whitespace-nowrap">{r.date}</td>
                        <td className="whitespace-nowrap">
                          <span className={r.isLate ? 'text-gray-900 font-semibold' : ''}>{formatTime12(r.checkIn)}</span>
                          {r.isLate && <span className="ml-1 text-[10px] text-gray-900 font-bold">LATE</span>}
                        </td>
                        <td className="whitespace-nowrap">
                          <span className={r.isEarlyLeave ? 'text-gray-900 font-semibold' : ''}>{formatTime12(r.checkOut)}</span>
                          {r.isEarlyLeave && <span className="ml-1 text-[10px] text-gray-900 font-bold">EARLY</span>}
                        </td>
                        <td>{r.workHours ? `${r.workHours}h` : '—'}</td>
                        <td><Badge status={r.status} /></td>
                        <td>
                          {r.regularizationStatus ? (
                            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${REG_BADGE[r.regularizationStatus]}`}>
                              {r.regularizationStatus}
                            </span>
                          ) : (r.isLate || r.isEarlyLeave) ? (
                            <span className="text-xs text-gray-900 font-medium">Not submitted</span>
                          ) : (
                            <span className="text-violet-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

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

export default HRAttendance;
