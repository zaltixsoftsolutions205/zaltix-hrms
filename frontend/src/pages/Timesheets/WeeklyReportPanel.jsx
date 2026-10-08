import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';

// Self-service weekly report: a plain-language intelligence summary plus
// Excel/PDF export of the week's logged tasks.
const WeeklyReportPanel = () => {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get('/timesheets/weekly-summary').then(res => setSummary(res.data)).catch(() => {});
  }, []);

  const exportExcel = () => {
    if (!summary || summary.rows.length === 0) return toast.error('No data to export');
    const ws = XLSX.utils.json_to_sheet(summary.rows);
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: 'Week', Value: `${summary.weekStart} to ${summary.weekEnd}` },
      { Metric: 'Total Hours', Value: summary.totalHours },
      { Metric: 'Tasks Completed', Value: `${summary.tasksCompleted}/${summary.tasksTotal}` },
      { Metric: 'Completion %', Value: summary.completionPct },
      { Metric: 'Days Updated', Value: `${summary.daysUpdated}/${summary.workingDaysInWeek}` },
      { Metric: 'Summary', Value: summary.summary },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, `Weekly_Report_${summary.weekStart}.xlsx`);
  };

  const exportPDF = async () => {
    try {
      const res = await api.get('/timesheets/weekly-summary/pdf', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Weekly_Report_${summary?.weekStart || ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export PDF');
    }
  };

  if (!summary) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-bold text-violet-900 text-sm">Weekly Report — {summary.weekStart} to {summary.weekEnd}</h3>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={exportExcel}>Export Excel</button>
          <button className="btn-primary btn-sm" onClick={exportPDF}>Export PDF</button>
        </div>
      </div>
      <p className="text-sm text-gray-700">{summary.summary}</p>
    </Card>
  );
};

export default WeeklyReportPanel;
