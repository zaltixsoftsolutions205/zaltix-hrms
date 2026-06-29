import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/helpers';

/* ── Icon helper ── */
const Icon = ({ d, size = 16, className = '', strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const IC = {
  lead:    "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  trend:   "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  spark:   "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  users:   "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  bag:     "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  box:     "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
};

/* ── get week start ── */
const getWeekStart = () => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
};

/* ── get month start ── */
const getMonthStart = () => {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d;
};

/* ── KPI card ── */
const KPI = ({ label, value, sub, icon, color = 'violet', trend }) => {
  const c = {
    violet: { wrap: 'bg-violet-50 border-violet-100', icon: 'text-violet-600', val: 'text-violet-700', sub: 'text-violet-400' },
    amber:  { wrap: 'bg-amber-50  border-amber-100',  icon: 'text-amber-600',  val: 'text-amber-700',  sub: 'text-amber-400'  },
    green:  { wrap: 'bg-emerald-50 border-emerald-100',icon: 'text-emerald-600',val: 'text-emerald-700',sub: 'text-emerald-400'},
    blue:   { wrap: 'bg-blue-50   border-blue-100',   icon: 'text-blue-600',   val: 'text-blue-700',   sub: 'text-blue-400'   },
  }[color] || { wrap: 'bg-violet-50 border-violet-100', icon: 'text-violet-600', val: 'text-violet-700', sub: 'text-violet-400' };

  return (
    <div className={`bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3`}>
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${c.wrap} ${c.icon}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-gray-900 leading-none">{value ?? '—'}</p>
        <p className="text-xs text-gray-400 font-medium mt-1">{label}</p>
        {sub && <p className={`text-[10px] mt-0.5 font-semibold ${c.sub}`}>{sub}</p>}
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

/* ═══════════════════ COMPONENT ═══════════════════ */
const AdminCRM = () => {
  const navigate = useNavigate();
  const [report, setReport]   = useState(null);
  const [products, setProducts] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [deals, setDeals]     = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod]   = useState('monthly'); // weekly | monthly | yearly

  useEffect(() => {
    Promise.all([
      api.get('/admin/reports/crm').then(r => setReport(r.data)).catch(() => {}),
      api.get('/products').then(r => setProducts(r.data)).catch(() => {}),
      api.get('/leads').then(r => setAllLeads(r.data?.leads || r.data || [])).catch(() => {}),
      api.get('/deals').then(r => setDeals(r.data?.deals || r.data || [])).catch(() => {}),
      api.get('/clients').then(r => setClients(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  /* ── Period-filtered metrics ── */
  const weekStart  = getWeekStart();
  const monthStart = getMonthStart();
  const yearStart  = new Date(new Date().getFullYear(), 0, 1);

  const cutoff = period === 'weekly' ? weekStart : period === 'monthly' ? monthStart : yearStart;

  const periodLeads    = allLeads.filter(l => new Date(l.createdAt) >= cutoff);
  const periodActs     = allLeads.flatMap(l => (l.activities || []).filter(a => new Date(a.date || a.createdAt) >= cutoff));
  const periodCalls    = periodActs.filter(a => a.type === 'call').length;
  const periodMeetings = periodActs.filter(a => a.type === 'meeting').length;
  const periodDeals    = deals.filter(d => d.status === 'won' && new Date(d.updatedAt || d.createdAt) >= cutoff).length;
  const periodRevenue  = deals.filter(d => d.status === 'won' && new Date(d.updatedAt || d.createdAt) >= cutoff)
    .reduce((s, d) => s + (d.value || d.dealValue || 0), 0);
  const periodConverted = periodLeads.filter(l => l.status === 'converted').length;
  const convRate       = periodLeads.length > 0 ? ((periodConverted / periodLeads.length) * 100).toFixed(1) : '0.0';
  const activeClients  = clients.filter(c => c.status === 'active').length || clients.length;

  /* ── Monthly trend data ── */
  const monthlyTrend = (() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = d.toLocaleDateString('en-IN', { month: 'short' });
      months.push({
        month: label,
        leads: allLeads.filter(l => new Date(l.createdAt) >= d && new Date(l.createdAt) < end).length,
        converted: allLeads.filter(l => new Date(l.createdAt) >= d && new Date(l.createdAt) < end && l.status === 'converted').length,
        deals: deals.filter(d2 => d2.status === 'won' && new Date(d2.updatedAt || d2.createdAt) >= d && new Date(d2.updatedAt || d2.createdAt) < end).length,
      });
    }
    return months;
  })();

  /* ── Employee performance bars ── */
  const empBarData = (report?.report || []).map(r => ({
    name: r.employee.name.split(' ')[0],
    total: r.total,
    converted: r.converted,
    rate: r.conversionRate,
  }));

  const TABS = [
    { key: 'overview',  label: 'Overview' },
    { key: 'team',      label: 'Team Performance' },
    { key: 'products',  label: `Products (${products.length})` },
  ];

  const PERIODS = [
    { key: 'weekly',  label: 'This Week' },
    { key: 'monthly', label: 'This Month' },
    { key: 'yearly',  label: 'This Year' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">CRM Analytics</h2>
          <p className="text-sm text-gray-400 mt-0.5">Sales pipeline, lead conversion and team performance</p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === p.key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Leads Generated"  value={periodLeads.length}    icon={<Icon d={IC.lead}  size={16} />} color="violet" />
        <KPI label="Calls Made"       value={periodCalls}           icon={<Icon d={IC.users} size={16} />} color="blue" />
        <KPI label="Meetings Booked"  value={periodMeetings}        icon={<Icon d={IC.spark} size={16} />} color="amber" />
        <KPI label="Deals Closed"     value={periodDeals}           icon={<Icon d={IC.bag}   size={16} />} color="green" />
        <KPI label="Conv. Rate"       value={`${convRate}%`}        icon={<Icon d={IC.trend} size={16} />} color="violet" sub={`${periodConverted} of ${periodLeads.length} converted`} />
        <KPI label="Active Clients"   value={activeClients}         icon={<Icon d={IC.box}   size={16} />} color="green" />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-100 pb-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 font-semibold text-xs border-b-2 -mb-px transition-colors ${
              activeTab === t.key ? 'text-violet-700 border-violet-600' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">

            {/* 6-month trend */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold text-gray-900 text-sm">Lead & Deal Trend</p>
                  <p className="text-[11px] text-gray-400">Last 6 months</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-200 inline-block" />Leads</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-600 inline-block" />Converted</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Deals Won</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend} barGap={3} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#D1D5DB' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #F3F4F6', fontSize: 11, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} cursor={{ fill: '#F5F3FF' }} />
                  <Bar dataKey="leads"     name="Leads"     fill="#DDD6FE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="converted" name="Converted" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="deals"     name="Deals Won" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sales summary cards */}
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: 'Weekly Sales', value: deals.filter(d => d.status === 'won' && new Date(d.updatedAt || d.createdAt) >= getWeekStart()).reduce((s, d) => s + (d.value || d.dealValue || 0), 0), sub: 'Revenue this week' },
                { label: 'Monthly Sales', value: deals.filter(d => d.status === 'won' && new Date(d.updatedAt || d.createdAt) >= getMonthStart()).reduce((s, d) => s + (d.value || d.dealValue || 0), 0), sub: 'Revenue this month' },
                { label: 'Yearly Sales', value: deals.filter(d => d.status === 'won' && new Date(d.updatedAt || d.createdAt) >= yearStart).reduce((s, d) => s + (d.value || d.dealValue || 0), 0), sub: 'Revenue this year' },
              ].map((s, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <p className="text-xs text-gray-400 font-medium mb-1">{s.label}</p>
                  <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(s.value)}</p>
                  <p className="text-[10px] text-gray-300 mt-1">{s.sub}</p>
                  <div className="mt-3 h-1 bg-gray-100 rounded-full">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, s.value > 0 ? 65 : 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Pipeline status breakdown */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <p className="font-bold text-gray-900 text-sm mb-4">Lead Pipeline Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'New',           value: allLeads.filter(l => l.status === 'new').length,           bg: 'bg-blue-50 border-blue-100',     text: 'text-blue-700' },
                  { label: 'Interested',    value: allLeads.filter(l => l.status === 'interested').length,    bg: 'bg-amber-50 border-amber-100',   text: 'text-amber-700' },
                  { label: 'Converted',     value: allLeads.filter(l => l.status === 'converted').length,     bg: 'bg-violet-50 border-violet-100', text: 'text-violet-700' },
                  { label: 'Not Interested',value: allLeads.filter(l => l.status === 'not-interested').length, bg: 'bg-gray-50 border-gray-100',    text: 'text-gray-500' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
                    <p className={`text-2xl font-extrabold leading-none ${s.text}`}>{s.value}</p>
                    <p className={`text-[11px] font-semibold mt-1 ${s.text} opacity-70`}>{s.label}</p>
                    <div className="mt-2 h-0.5 bg-white/60 rounded-full">
                      <div className={`h-full rounded-full ${s.text.replace('text', 'bg')}`}
                        style={{ width: `${allLeads.length > 0 ? (s.value / allLeads.length * 100) : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Team Performance Tab ── */}
        {activeTab === 'team' && (
          <motion.div key="team" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">
            {loading ? (
              <div className="py-16 text-center text-gray-300 text-sm">Loading…</div>
            ) : !report || report.report?.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center shadow-sm">
                <Icon d={IC.users} size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 font-semibold">No team data yet</p>
                <p className="text-sm text-gray-300 mt-1">Sales employees will appear here once added.</p>
              </div>
            ) : (
              <>
                {/* Summary bar chart */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <p className="font-bold text-gray-900 text-sm mb-4">Leads by Sales Employee</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={empBarData} barSize={18} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#D1D5DB' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #F3F4F6', fontSize: 11, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} cursor={{ fill: '#F5F3FF' }} />
                      <Bar dataKey="total"     name="Total Leads" fill="#DDD6FE" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="converted" name="Converted"   fill="#7C3AED" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Employee cards */}
                <div className="space-y-3">
                  {report.report.map((item, idx) => (
                    <motion.div key={item.employee._id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                      className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-700">
                            {item.employee.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{item.employee.name}</p>
                            <p className="text-xs text-gray-400">{item.employee.employeeId}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-extrabold text-violet-700">{item.conversionRate}%</p>
                          <p className="text-[10px] text-gray-400">conversion</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-violet-500 rounded-full transition-all duration-700"
                          style={{ width: `${item.conversionRate}%` }} />
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-gray-500">Total: <strong className="text-gray-900">{item.total}</strong></span>
                        <span className="text-violet-600">Converted: <strong>{item.converted}</strong></span>
                        <span className="text-gray-400">Lost: <strong>{item.notInterested}</strong></span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── Products Tab ── */}
        {activeTab === 'products' && (
          <motion.div key="products" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {products.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center shadow-sm">
                <Icon d={IC.box} size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 font-semibold">No products yet</p>
                <p className="text-sm text-gray-300 mt-1">Products created by sales will appear here.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(p => (
                  <motion.div key={p._id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    onClick={() => navigate(`/crm/products/${p._id}`)}
                    className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-gray-900 group-hover:text-violet-700 transition-colors truncate">{p.name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.status === 'active' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'
                      }`}>{p.status}</span>
                    </div>
                    {p.category && <p className="text-xs text-gray-400 mb-1">{p.category}</p>}
                    {p.price > 0 && <p className="text-sm font-bold text-amber-600 mb-3">{formatCurrency(p.price)}{p.unit ? ` / ${p.unit}` : ''}</p>}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-50">
                      <div className="text-center">
                        <p className="text-lg font-extrabold text-gray-900">{p.prospectCount ?? 0}</p>
                        <p className="text-[9px] text-gray-400 font-medium">Prospects</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-extrabold text-amber-600">{p.interestedCount ?? 0}</p>
                        <p className="text-[9px] text-gray-400 font-medium">Interested</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-extrabold text-violet-600">{p.convertedCount ?? 0}</p>
                        <p className="text-[9px] text-gray-400 font-medium">In Leads</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-300 mt-3">By {p.createdBy?.name} · {formatDate(p.createdAt)}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminCRM;
