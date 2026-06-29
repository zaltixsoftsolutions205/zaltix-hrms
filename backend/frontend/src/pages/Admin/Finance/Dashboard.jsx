import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import api from '../../../utils/api';
import { formatCurrency } from '../../../utils/helpers';

/* ── Icon helper ── */
const Icon = ({ d, size = 16, className = '', strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const IC = {
  income:  "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  expense: "M13 10V3L4 14h7v7l9-11h-7z",
  profit:  "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  margin:  "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  upload:  "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  check:   "M5 13l4 4L19 7",
  info:    "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  tag:     "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  x:       "M6 18L18 6M6 6l12 12",
};

/* ── Revenue / Expense keyword rules ── */
const REVENUE_KEYWORDS = ['received', 'credit', 'inward', 'refund', 'payment in', 'transfer in', 'deposit', 'salary credit', 'cr', 'credited'];
const EXPENSE_KEYWORDS = ['paid', 'debit', 'withdrawal', 'charge', 'fee', 'purchase', 'dr', 'debited', 'transfer out', 'outward', 'payment out'];

const categorize = (desc) => {
  const lower = (desc || '').toLowerCase();
  if (REVENUE_KEYWORDS.some(k => lower.includes(k))) return 'revenue';
  if (EXPENSE_KEYWORDS.some(k => lower.includes(k))) return 'expense';
  return 'uncategorized';
};

const parseCSV = (text) => {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.replace(/"/g, '').trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    /* Try to find description, amount, date columns */
    const desc   = row.description || row.narration || row.particulars || row.details || Object.values(row)[1] || '';
    const amount = parseFloat((row.amount || row.credit || row.debit || row.value || '0').replace(/[^0-9.-]/g, '')) || 0;
    const date   = row.date || row['transaction date'] || row['txn date'] || '';
    return { desc, amount: Math.abs(amount), date, raw: row, category: categorize(desc) };
  }).filter(r => r.amount > 0);
};

/* ── KPI card ── */
const KPICard = ({ label, value, icon, color, trend }) => {
  const c = {
    green:  { wrap: 'border-emerald-100', icon: 'bg-emerald-50 text-emerald-600', val: 'text-gray-900' },
    red:    { wrap: 'border-red-100',     icon: 'bg-red-50    text-red-500',      val: 'text-gray-900' },
    violet: { wrap: 'border-violet-100',  icon: 'bg-violet-50 text-violet-600',   val: 'text-gray-900' },
    amber:  { wrap: 'border-amber-100',   icon: 'bg-amber-50  text-amber-600',    val: 'text-gray-900' },
  }[color] || { wrap: 'border-gray-100', icon: 'bg-gray-50 text-gray-500', val: 'text-gray-900' };

  return (
    <div className={`bg-white border rounded-2xl p-5 shadow-sm flex flex-col gap-3 ${c.wrap}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.icon}`}>
        {icon}
      </div>
      <div>
        <p className={`text-2xl font-extrabold leading-none ${c.val}`}>{value}</p>
        <p className="text-xs text-gray-400 font-medium mt-1">{label}</p>
        {trend != null && (
          <div className={`inline-flex items-center gap-0.5 text-[10px] font-bold mt-1 ${trend >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
            <span>{trend >= 0 ? '▲' : '▼'}</span>
            <span>{Math.abs(trend).toFixed(1)}% vs prior</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════ COMPONENT ══════════════════════ */
const FinanceDashboard = ({ month, year, refresh }) => {
  const [stats, setStats]       = useState({ totalIncome: 0, totalExpense: 0, profit: 0, profitMargin: 0 });
  const [loading, setLoading]   = useState(false);

  /* bank statement state */
  const [showUpload, setShowUpload]         = useState(false);
  const [fileName, setFileName]             = useState('');
  const [parsedRows, setParsedRows]         = useState([]);
  const [statementFilter, setStatementFilter] = useState('all'); // all | revenue | expense | uncategorized
  const fileRef = useRef(null);

  useEffect(() => { fetchDashboard(); }, [month, year, refresh]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/finance/dashboard?month=${month}&year=${year}`);
      setStats(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const profitPositive = stats.profit >= 0;

  /* ── handle file upload ── */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      setParsedRows(rows);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) { setFileName(file.name); const reader = new FileReader(); reader.onload = ev => setParsedRows(parseCSV(ev.target.result)); reader.readAsText(file); }
  };

  /* derived statement totals */
  const stmtRevenue  = parsedRows.filter(r => r.category === 'revenue').reduce((s, r) => s + r.amount, 0);
  const stmtExpense  = parsedRows.filter(r => r.category === 'expense').reduce((s, r) => s + r.amount, 0);
  const stmtUncat    = parsedRows.filter(r => r.category === 'uncategorized').length;

  const filteredRows = statementFilter === 'all' ? parsedRows
    : parsedRows.filter(r => r.category === statementFilter);

  /* ── simple sparkline data (7 months) ── */
  const sparkData = [0.6, 0.8, 0.55, 0.9, 0.7, 1, stats.profitMargin / 100].map((v, i) => ({
    month: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'][i],
    value: Math.max(0, v * Math.max(stats.totalIncome, 100)),
  }));

  return (
    <div className="space-y-6">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Income"    value={formatCurrency(stats.totalIncome)}  icon={<Icon d={IC.income}  size={18} />} color="green" />
        <KPICard label="Total Expenses"  value={formatCurrency(stats.totalExpense)} icon={<Icon d={IC.expense} size={18} />} color="red"   />
        <KPICard label="Net Profit/Loss" value={formatCurrency(stats.profit)}       icon={<Icon d={IC.profit}  size={18} />} color={profitPositive ? 'violet' : 'red'} />
        <KPICard label="Profit Margin"   value={`${stats.profitMargin}%`}           icon={<Icon d={IC.margin}  size={18} />} color="amber" />
      </div>

      {/* ── Summary visual row ── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Trend sparkline */}
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-bold text-gray-900 text-sm">Revenue Trend</p>
              <p className="text-[11px] text-gray-400">7-month income overview</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${profitPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
              {profitPositive ? 'Profitable' : 'Loss Period'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={v => [formatCurrency(v), 'Revenue']}
                contentStyle={{ borderRadius: 10, border: '1px solid #F3F4F6', fontSize: 11, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="value" stroke="#7C3AED" strokeWidth={2}
                fill="url(#incomeGrad)" dot={false} activeDot={{ r: 4, fill: '#7C3AED' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Income vs Expense donut */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col">
          <p className="font-bold text-gray-900 text-sm mb-3">Breakdown</p>
          {stats.totalIncome + stats.totalExpense > 0 ? (
            <>
              <div className="flex-1 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={[
                      { name: 'Income',  value: stats.totalIncome  },
                      { name: 'Expense', value: stats.totalExpense },
                    ]} cx="50%" cy="50%" innerRadius={35} outerRadius={55}
                      dataKey="value" paddingAngle={3} strokeWidth={0}>
                      <Cell fill="#7C3AED" />
                      <Cell fill="#EF4444" />
                    </Pie>
                    <Tooltip formatter={v => formatCurrency(v)}
                      contentStyle={{ borderRadius: 10, border: '1px solid #F3F4F6', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 justify-center mt-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-violet-600 flex-shrink-0" />
                  <span className="text-gray-500">Income</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-gray-500">Expense</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-300">No data this period</div>
          )}
        </div>
      </div>

      {/* ── Summary numbers ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-gray-100 gap-4 sm:gap-6">
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium mb-1">Total Income</p>
            <p className="text-2xl font-extrabold text-emerald-600">{formatCurrency(stats.totalIncome)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium mb-1">Total Expenses</p>
            <p className="text-2xl font-extrabold text-red-500">{formatCurrency(stats.totalExpense)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium mb-1">Net Result</p>
            <p className={`text-2xl font-extrabold ${profitPositive ? 'text-violet-700' : 'text-red-500'}`}>
              {formatCurrency(stats.profit)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bank Statement Upload ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <Icon d={IC.upload} size={16} className="text-violet-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Bank Statement Analyzer</p>
              <p className="text-[11px] text-gray-400">Upload a CSV to auto-categorize transactions</p>
            </div>
          </div>
          <button onClick={() => setShowUpload(v => !v)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors ${
              showUpload ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}>
            {showUpload ? 'Close' : 'Open Analyzer'}
          </button>
        </div>

        <AnimatePresence>
          {showUpload && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="p-5 space-y-4">

                {/* Drop zone */}
                <div
                  onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/40 transition-all group">
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                  <div className="w-12 h-12 bg-gray-50 group-hover:bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors">
                    <Icon d={IC.upload} size={22} className="text-gray-300 group-hover:text-violet-500 transition-colors" />
                  </div>
                  {fileName ? (
                    <div>
                      <p className="font-semibold text-violet-700 text-sm">{fileName}</p>
                      <p className="text-xs text-violet-500 mt-0.5">{parsedRows.length} transactions found</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-gray-500 text-sm">Drop your CSV here or click to browse</p>
                      <p className="text-xs text-gray-400 mt-0.5">Supports standard bank statement CSV exports</p>
                    </div>
                  )}
                </div>

                {/* Info note */}
                <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                  <Icon d={IC.info} size={14} className="flex-shrink-0 mt-0.5" />
                  <p>Auto-detects columns (description, amount, date). Categorizes by keywords like "received", "payment", "debit", "credit", etc. Works best with bank-exported CSV files.</p>
                </div>

                {/* Results */}
                {parsedRows.length > 0 && (
                  <div className="space-y-4">

                    {/* Summary chips */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Revenue',       value: formatCurrency(stmtRevenue),  count: parsedRows.filter(r => r.category === 'revenue').length,       bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' },
                        { label: 'Expenses',      value: formatCurrency(stmtExpense),  count: parsedRows.filter(r => r.category === 'expense').length,       bg: 'bg-red-50     border-red-100',     text: 'text-red-600'     },
                        { label: 'Uncategorized', value: `${stmtUncat} txns`,          count: stmtUncat,                                                      bg: 'bg-gray-50    border-gray-100',    text: 'text-gray-500'    },
                      ].map(s => (
                        <div key={s.label} className={`border rounded-xl px-4 py-3 ${s.bg}`}>
                          <p className={`text-lg font-extrabold leading-none ${s.text}`}>{s.value}</p>
                          <p className={`text-[10px] font-semibold mt-1 ${s.text} opacity-70`}>{s.label} · {s.count} txns</p>
                        </div>
                      ))}
                    </div>

                    {/* Filter tabs */}
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                      {[
                        { key: 'all',           label: 'All' },
                        { key: 'revenue',       label: 'Revenue' },
                        { key: 'expense',       label: 'Expense' },
                        { key: 'uncategorized', label: 'Uncategorized' },
                      ].map(f => (
                        <button key={f.key} onClick={() => setStatementFilter(f.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            statementFilter === f.key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}>
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Transaction table */}
                    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                      <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-gray-100 bg-white">
                        <p className="col-span-5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Description</p>
                        <p className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date</p>
                        <p className="col-span-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide text-right">Amount</p>
                        <p className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Category</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                        {filteredRows.slice(0, 50).map((row, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2.5 hover:bg-white transition-colors items-center">
                            <p className="col-span-5 text-xs text-gray-700 truncate">{row.desc || '—'}</p>
                            <p className="col-span-2 text-[10px] text-gray-400">{row.date || '—'}</p>
                            <p className="col-span-3 text-xs font-semibold text-right text-gray-900">{formatCurrency(row.amount)}</p>
                            <div className="col-span-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                row.category === 'revenue' ? 'bg-emerald-100 text-emerald-700'
                                : row.category === 'expense' ? 'bg-red-100 text-red-600'
                                : 'bg-gray-200 text-gray-500'
                              }`}>
                                {row.category === 'revenue' ? 'Revenue' : row.category === 'expense' ? 'Expense' : '?'}
                              </span>
                            </div>
                          </div>
                        ))}
                        {filteredRows.length === 0 && (
                          <div className="py-8 text-center text-gray-400 text-xs">No transactions in this category</div>
                        )}
                        {filteredRows.length > 50 && (
                          <div className="py-2 text-center text-xs text-gray-400">Showing 50 of {filteredRows.length} transactions</div>
                        )}
                      </div>
                    </div>

                    {/* Clear button */}
                    <button onClick={() => { setParsedRows([]); setFileName(''); }}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors font-medium">
                      <Icon d={IC.x} size={13} />Clear statement
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Info panel ── */}
      <div className="flex items-start gap-3 px-5 py-4 bg-violet-50 border border-violet-100 rounded-2xl">
        <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon d={IC.info} size={15} className="text-violet-600" />
        </div>
        <div>
          <p className="font-semibold text-violet-900 text-sm">Finance Overview</p>
          <p className="text-xs text-violet-600 mt-0.5">
            Income is auto-synced from won deals in CRM. Track all expenses and view detailed reports
            by category and service. Use the Bank Statement Analyzer to review your bank CSV exports.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FinanceDashboard;
