import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';

const WORK_CATEGORIES = ['Development', 'Testing', 'Meeting', 'Client Work', 'Support', 'Documentation', 'Research', 'Training', 'Administrative', 'Other'];
const STATUSES = ['Not Started', 'In Progress', 'Completed', 'Blocked'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Reports tab — Daily/Weekly/Monthly/Employee/Project reports, exportable to
// Excel (client-side xlsx) and PDF (backend pdfkit stream). CSV is intentionally
// not offered — the Excel export already covers that need.
const TimesheetReports = () => {
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({
    departmentId: '', status: '', workCategory: '',
    month: new Date().getMonth() + 1, year: new Date().getFullYear(),
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/admin/departments').then(res => setDepartments(res.data)).catch(() => {});
  }, []);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get('/timesheets/reports', { params });
      setRows(res.data);
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchRows(); }, []);

  const exportExcel = () => {
    if (rows.length === 0) return toast.error('No data to export');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet Report');
    XLSX.writeFile(wb, `Timesheet_Report_${filters.year}_${filters.month}.xlsx`);
  };

  const exportPDF = async () => {
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get('/timesheets/reports/pdf', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Timesheet_Report_${filters.year}_${filters.month}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export PDF');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-3 flex-wrap items-end">
          <select className="input-field w-auto" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input className="input-field w-24" type="number" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} />
          <select className="input-field w-auto" value={filters.departmentId} onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value }))}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select className="input-field w-auto" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input-field w-auto" value={filters.workCategory} onChange={e => setFilters(f => ({ ...f, workCategory: e.target.value }))}>
            <option value="">All Categories</option>
            {WORK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn-secondary btn-sm" onClick={fetchRows}>Apply</button>
          <div className="flex-1" />
          <button className="btn-secondary btn-sm" onClick={exportExcel}>Export Excel</button>
          <button className="btn-primary btn-sm" onClick={exportPDF}>Export PDF</button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-violet-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-violet-400">No data for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-violet-400 text-left">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-violet-50">
                    <td className="py-1.5 pr-3">{r.date}</td>
                    <td className="py-1.5 pr-3 font-medium text-violet-900">{r.employee}</td>
                    <td className="py-1.5 pr-3">{r.department}</td>
                    <td className="py-1.5 pr-3">{r.project}</td>
                    <td className="py-1.5 pr-3">{r.task}</td>
                    <td className="py-1.5 pr-3">{r.workCategory}</td>
                    <td className="py-1.5 pr-3">{r.status}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <p className="text-xs text-violet-400 mt-2">Showing first 200 of {rows.length} rows — export for the full set.</p>}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TimesheetReports;
