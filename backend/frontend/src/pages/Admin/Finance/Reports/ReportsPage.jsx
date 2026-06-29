import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import Card from '../../../../components/UI/Card';
import { formatCurrency } from '../../../../utils/helpers';

const SI = ({ d, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />
  </svg>
);

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const ReportsPage = ({ month, year }) => {
  const [yearlyData, setYearlyData]   = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [serviceData, setServiceData]  = useState([]);
  const [monthSummary, setMonthSummary] = useState(null);
  const [loading, setLoading]          = useState(false);
  const [downloading, setDownloading]  = useState(false);

  useEffect(() => {
    fetchReports();
  }, [month, year]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [yearly, category, service, dashboard] = await Promise.all([
        api.get(`/finance/reports/yearly?year=${year}`),
        api.get(`/finance/reports/by-category?month=${month}&year=${year}`),
        api.get(`/finance/reports/by-service?month=${month}&year=${year}`),
        api.get(`/finance/dashboard?month=${month}&year=${year}`),
      ]);
      setYearlyData(yearly.data);
      setCategoryData(category.data.data);
      setServiceData(service.data);
      setMonthSummary(dashboard.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = async () => {
    setDownloading(true);
    try {
      const [incomeRes, expenseRes] = await Promise.all([
        api.get(`/finance/income?month=${month}&year=${year}&limit=500`),
        api.get(`/finance/expenses?month=${month}&year=${year}&limit=500`),
      ]);

      const incomeList  = incomeRes.data.income  || [];
      const expenseList = expenseRes.data.expenses || [];

      const rows = [];
      const selectedMonthName = MONTH_NAMES[month - 1];

      // Header
      rows.push([`Finance Report — ${selectedMonthName} ${year}`]);
      rows.push([]);

      // Summary
      rows.push(['SUMMARY']);
      rows.push(['Total Income', fmt(monthSummary?.totalIncome)]);
      rows.push(['Total Expenses', fmt(monthSummary?.totalExpense)]);
      rows.push(['Net Profit', fmt(monthSummary?.profit)]);
      rows.push(['Profit Margin', `${monthSummary?.profitMargin ?? 0}%`]);
      rows.push([]);

      // Income entries
      rows.push(['INCOME ENTRIES']);
      rows.push(['Date', 'Category', 'Description', 'Amount', 'Service Type']);
      for (const item of incomeList) {
        const cat = item.type === 'deal' ? 'Deal' : (item.category || 'General');
        rows.push([
          new Date(item.date).toLocaleDateString('en-IN'),
          cat,
          item.description || '',
          item.amount,
          item.serviceType || '',
        ]);
      }
      rows.push([]);

      // Expense entries
      rows.push(['EXPENSE ENTRIES']);
      rows.push(['Date', 'Category', 'Description', 'Amount', 'Status']);
      for (const item of expenseList) {
        rows.push([
          new Date(item.date).toLocaleDateString('en-IN'),
          item.category || '',
          item.description || '',
          item.amount,
          item.status || '',
        ]);
      }
      rows.push([]);

      // Expense by category
      rows.push(['EXPENSE BREAKDOWN BY CATEGORY']);
      rows.push(['Category', 'Amount', 'Percentage']);
      for (const cat of categoryData) {
        rows.push([cat._id, cat.total, `${cat.percentage}%`]);
      }
      rows.push([]);

      // Revenue by service
      rows.push(['REVENUE BY SERVICE TYPE']);
      rows.push(['Service Type', 'Revenue', 'Entries']);
      for (const svc of serviceData) {
        rows.push([svc._id || 'Unknown', svc.revenue, svc.count]);
      }

      // Build CSV string
      const csv = rows
        .map((r) =>
          r.map((cell) => {
            const s = String(cell ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          }).join(',')
        )
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `finance_report_${selectedMonthName}_${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${selectedMonthName} ${year} report`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  const selectedMonthName = MONTH_NAMES[month - 1];

  return (
    <div className="space-y-4">
      {/* Month Summary KPIs + Download */}
      {monthSummary && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-gray-900">
              {selectedMonthName} {year} — Overview
            </h3>
            <button
              onClick={handleDownloadCSV}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={15} color="text-white" />
              {downloading ? 'Downloading...' : `Download ${selectedMonthName} Report`}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Income',   value: fmt(monthSummary.totalIncome),  bg: 'bg-violet-50',  text: 'text-violet-700' },
              { label: 'Total Expenses', value: fmt(monthSummary.totalExpense), bg: 'bg-gray-100',    text: 'text-gray-900'   },
              { label: 'Net Profit',     value: fmt(monthSummary.profit),       bg: 'bg-violet-50',   text: 'text-violet-700'  },
              { label: 'Profit Margin',  value: `${monthSummary.profitMargin}%`, bg: 'bg-amber-50', text: 'text-amber-700' },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-base font-bold ${s.text}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Yearly Report */}
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">Yearly Summary — {year}</h3>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="data-table min-w-[600px]">
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {yearlyData.map((row) => (
                <tr
                  key={row.month}
                  className={row.month === month ? 'bg-violet-50' : ''}
                >
                  <td className="font-semibold">
                    <span className="flex items-center gap-1.5">
                      {row.monthName}
                      {row.month === month && (
                        <span className="text-[10px] bg-violet-600 text-white px-1.5 py-0.5 rounded font-bold">Selected</span>
                      )}
                    </span>
                  </td>
                  <td className="text-violet-600 font-semibold">{formatCurrency(row.income)}</td>
                  <td className="text-gray-900 font-semibold">{formatCurrency(row.expense)}</td>
                  <td className={`font-semibold ${row.profit >= 0 ? 'text-violet-600' : 'text-gray-900'}`}>
                    {formatCurrency(row.profit)}
                  </td>
                  <td className="text-sm">{row.margin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">
          Expense Breakdown by Category — {selectedMonthName} {year}
        </h3>
        {loading ? (
          <p className="text-gray-400 text-center py-4 text-sm">Loading...</p>
        ) : categoryData.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No expenses for {selectedMonthName} {year}</p>
        ) : (
          <div className="space-y-3">
            {categoryData.map((cat) => (
              <div key={cat._id} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 capitalize">{cat._id}</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div className="bg-violet-600 h-2 rounded-full" style={{ width: `${cat.percentage}%` }} />
                  </div>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(cat.total)}</p>
                  <p className="text-xs text-gray-500">{cat.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Revenue by Service */}
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">
          Revenue by Service Type — {selectedMonthName} {year}
        </h3>
        {loading ? (
          <p className="text-gray-400 text-center py-4 text-sm">Loading...</p>
        ) : serviceData.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No revenue data for {selectedMonthName} {year}</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="data-table min-w-[500px]">
              <thead>
                <tr>
                  <th>Service Type</th>
                  <th>Revenue</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {serviceData.map((svc) => (
                  <tr key={svc._id}>
                    <td className="font-semibold capitalize">{svc._id || 'Unknown'}</td>
                    <td className="text-violet-600 font-semibold">{formatCurrency(svc.revenue)}</td>
                    <td className="text-gray-600">{svc.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ReportsPage;
