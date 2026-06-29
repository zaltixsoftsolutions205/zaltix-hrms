import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import EmptyState from '../../components/UI/EmptyState';
import Badge from '../../components/UI/Badge';
import { formatCurrency, formatDate, sumMoney } from '../../utils/helpers';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const AdminReports = () => {
  const [activeTab, setActiveTab] = useState('attendance');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const now = new Date();
  const [filter, setFilter] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });

  const fetchReport = async () => {
    setLoading(true);
    setData(null);
    try {
      let res;
      if (activeTab === 'attendance') {
        res = await api.get(`/admin/reports/attendance?month=${filter.month}&year=${filter.year}`);
      } else if (activeTab === 'leave') {
        res = await api.get(`/admin/reports/leave?year=${filter.year}`);
      } else if (activeTab === 'payroll') {
        res = await api.get(`/admin/reports/payroll?month=${filter.month}&year=${filter.year}`);
      }
      setData(res.data);
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const exportCSV = () => {
    if (!data) return;
    let csv = '';
    if (activeTab === 'attendance' && Array.isArray(data)) {
      csv = 'Employee,ID,Present,Absent,Half Day,Total Hours\n' + data.map(r =>
        `${r.employee?.name},${r.employee?.employeeId},${r.present},${r.absent},${r.halfDay},${r.totalHours}`
      ).join('\n');
    } else if (activeTab === 'payroll' && data.payslips) {
      csv = 'Employee,ID,Basic,Gross,Net Pay\n' + data.payslips.map(p =>
        `${p.employee?.name},${p.employee?.employeeId},${p.basicSalary},${p.grossSalary},${p.netSalary}`
      ).join('\n');
    }
    if (!csv) return toast.error('Export not available for this report');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `report_${activeTab}_${filter.year}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success('Exported!');
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 space-y-5 animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Reports</h2><p className="page-subtitle">Generate dynamic reports from live data</p></div>
        {data && <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5"><SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={15} color="text-violet-600" /> Export CSV</button>}
      </div>

      {/* Tabs */}
      <div className="filter-bar">
        {['attendance', 'leave', 'payroll'].map(t => (
          <button key={t} onClick={() => { setActiveTab(t); setData(null); }}
            className={activeTab === t ? 'filter-pill-active' : 'filter-pill-inactive'}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {(activeTab === 'attendance' || activeTab === 'payroll') && (
            <select className="input-field w-auto" value={filter.month} onChange={e => setFilter(f => ({ ...f, month: parseInt(e.target.value) }))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}
            </select>
          )}
          <select className="input-field w-auto" value={filter.year} onChange={e => setFilter(f => ({ ...f, year: parseInt(e.target.value) }))}>
            {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={fetchReport} disabled={loading} className="btn-primary">
            {loading ? 'Generating...' : <span className="flex items-center gap-1.5"><SI d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={15} /> Generate Report</span>}
          </button>
        </div>

        {!data && !loading && (
          <EmptyState icon={<SI d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={40} color="text-violet-400" />} title="No report generated" message="Set filters and click Generate Report." />
        )}

        {loading && <div className="py-10 text-center text-violet-400 text-sm animate-pulse">Generating report...</div>}

        {/* Attendance Report */}
        {data && activeTab === 'attendance' && Array.isArray(data) && (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {data.map((r, i) => (
                <div key={i} className="p-3 border border-violet-100 rounded-xl space-y-2">
                  <div>
                    <p className="font-semibold text-violet-900 text-sm">{r.employee?.name}</p>
                    <p className="text-[10px] text-violet-400">{r.employee?.employeeId}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div className="bg-violet-50 rounded-lg py-1.5">
                      <p className="text-xs font-bold text-violet-600">{r.present}</p>
                      <p className="text-[9px] text-violet-400">Present</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-1.5">
                      <p className="text-xs font-bold text-gray-700">{r.absent}</p>
                      <p className="text-[9px] text-gray-400">Absent</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg py-1.5">
                      <p className="text-xs font-bold text-amber-600">{r.halfDay}</p>
                      <p className="text-[9px] text-amber-400">Half Day</p>
                    </div>
                    <div className="bg-violet-50 rounded-lg py-1.5">
                      <p className="text-xs font-bold text-violet-700">{r.totalHours}h</p>
                      <p className="text-[9px] text-violet-400">Hours</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
              <table className="data-table min-w-[480px]">
                <thead><tr><th>Employee</th><th>Present</th><th>Absent</th><th>Half Day</th><th>Total Hours</th></tr></thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={i}>
                      <td><p className="font-medium">{r.employee?.name}</p><p className="text-xs text-violet-400">{r.employee?.employeeId}</p></td>
                      <td className="text-violet-600 font-semibold">{r.present}</td>
                      <td className="text-gray-900 font-semibold">{r.absent}</td>
                      <td className="text-golden-600 font-semibold">{r.halfDay}</td>
                      <td>{r.totalHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Leave Report */}
        {data && activeTab === 'leave' && data.leaves && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total Requests', value: data.stats.total, color: 'violet' },
                { label: 'Approved', value: data.stats.approved, color: 'green' },
                { label: 'Rejected', value: data.stats.rejected, color: 'red' },
                { label: 'Pending', value: data.stats.pending, color: 'golden' },
              ].map(s => (
                <div key={s.label} className="glass-card p-3 text-center">
                  <p className="text-xs text-violet-500 mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-violet-900">{s.value}</p>
                </div>
              ))}
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {data.leaves.map(l => (
                <div key={l._id} className="p-3 border border-violet-100 rounded-xl space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-violet-900 text-sm truncate">{l.employee?.name}</p>
                      <p className="text-[10px] text-violet-400">{l.employee?.employeeId}</p>
                    </div>
                    <Badge status={l.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                    <span className="capitalize"><span className="text-violet-400">Type: </span>{l.type}</span>
                    <span><span className="text-violet-400">Days: </span><strong>{l.totalDays}</strong></span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span><span className="text-violet-400">From: </span>{formatDate(l.fromDate)}</span>
                    <span><span className="text-violet-400">To: </span>{formatDate(l.toDate)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
              <table className="data-table min-w-[500px]">
                <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th></tr></thead>
                <tbody>
                  {data.leaves.map(l => (
                    <tr key={l._id}>
                      <td><p className="font-medium">{l.employee?.name}</p><p className="text-xs text-violet-400">{l.employee?.employeeId}</p></td>
                      <td className="capitalize">{l.type}</td>
                      <td>{formatDate(l.fromDate)}</td>
                      <td>{formatDate(l.toDate)}</td>
                      <td>{l.totalDays}</td>
                      <td><Badge status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Payroll Report */}
        {data && activeTab === 'payroll' && data.payslips && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Employees', value: data.summary.totalEmployees },
                { label: 'Total Gross', value: formatCurrency(data.summary.totalGross) },
                { label: 'Total Net', value: formatCurrency(data.summary.totalNet) },
              ].map(s => (
                <div key={s.label} className="glass-card p-3 text-center">
                  <p className="text-xs text-violet-500 mb-1">{s.label}</p>
                  <p className="text-lg font-bold text-violet-900">{s.value}</p>
                </div>
              ))}
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {data.payslips.map(p => (
                <div key={p._id} className="p-3 border border-violet-100 rounded-xl space-y-2">
                  <div>
                    <p className="font-semibold text-violet-900 text-sm">{p.employee?.name}</p>
                    <p className="text-[10px] text-violet-400">{p.employee?.employeeId}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-violet-400">Basic: </span>{formatCurrency(p.basicSalary)}</div>
                    <div><span className="text-violet-400">Gross: </span>{formatCurrency(p.grossSalary)}</div>
                    <div><span className="text-violet-400">Deductions: </span><span className="text-gray-700">{formatCurrency(sumMoney(p.deductions))}</span></div>
                    <div><span className="text-violet-400">Net: </span><strong className="text-amber-600">{formatCurrency(p.netSalary)}</strong></div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
              <table className="data-table min-w-[480px]">
                <thead><tr><th>Employee</th><th>Basic</th><th>Gross</th><th>Deductions</th><th>Net Pay</th></tr></thead>
                <tbody>
                  {data.payslips.map(p => (
                    <tr key={p._id}>
                      <td><p className="font-medium">{p.employee?.name}</p><p className="text-xs text-violet-400">{p.employee?.employeeId}</p></td>
                      <td>{formatCurrency(p.basicSalary)}</td>
                      <td>{formatCurrency(p.grossSalary)}</td>
                      <td className="text-gray-900">{formatCurrency(sumMoney(p.deductions))}</td>
                      <td className="font-bold text-golden-600">{formatCurrency(p.netSalary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default AdminReports;
