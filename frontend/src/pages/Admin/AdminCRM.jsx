import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
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
  pin:     "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
  check:   "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  x:       "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  trophy:  "M8 21h8m-4-4v4m-5-17h10v5a5 5 0 01-10 0V4zm10 1h2a2 2 0 010 4h-2M7 5H5a2 2 0 000 4h2",
};

/* ── KPI card ── */
const KPI = ({ label, value, sub, icon, color = 'violet', trend }) => {
  const c = {
    violet: { card: 'bg-violet-50/70 border-violet-200/70 hover:border-violet-300', chip: 'bg-violet-100 text-violet-600', label: 'text-violet-900/60', sub: 'text-violet-500' },
    amber:  { card: 'bg-amber-50/70 border-amber-200/70 hover:border-amber-300',    chip: 'bg-amber-100 text-amber-600',  label: 'text-amber-900/60',  sub: 'text-amber-500' },
    green:  { card: 'bg-emerald-50/70 border-emerald-200/70 hover:border-emerald-300', chip: 'bg-emerald-100 text-emerald-600', label: 'text-emerald-900/60', sub: 'text-emerald-500' },
    blue:   { card: 'bg-blue-50/70 border-blue-200/70 hover:border-blue-300',       chip: 'bg-blue-100 text-blue-600',    label: 'text-blue-900/60',   sub: 'text-blue-500' },
    rose:   { card: 'bg-rose-50/70 border-rose-200/70 hover:border-rose-300',       chip: 'bg-rose-100 text-rose-500',    label: 'text-rose-900/60',   sub: 'text-rose-500' },
    indigo: { card: 'bg-indigo-50/70 border-indigo-200/70 hover:border-indigo-300', chip: 'bg-indigo-100 text-indigo-600',label: 'text-indigo-900/60', sub: 'text-indigo-500' },
  }[color];

  return (
    <div className={`border rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col ${c.card}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.chip}`}>{icon}</span>
        <p className={`text-xs font-bold leading-tight ${c.label}`}>{label}</p>
      </div>
      <p className="text-[26px] font-extrabold text-gray-900 leading-none tabular-nums">{value ?? '—'}</p>
      {trend != null ? (
        <div className={`inline-flex items-center gap-1 text-[11px] font-bold mt-2 ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          <span>{trend >= 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(trend).toFixed(1)}%</span>
          <span className={`font-medium ${c.label}`}>vs last period</span>
        </div>
      ) : sub ? (
        <p className={`text-[11px] mt-2 font-semibold ${c.sub}`}>{sub}</p>
      ) : <div className="mt-2 h-[17px]" />}
    </div>
  );
};

/* ── Card shell + empty state ── */
const Card = ({ title, sub, right, children, className = '' }) => (
  <div className={`bg-white border border-gray-100 rounded-2xl p-5 shadow-sm ${className}`}>
    {(title || right) && (
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {title && <p className="font-bold text-gray-900 text-sm">{title}</p>}
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
    )}
    {children}
  </div>
);

const Empty = ({ icon, title, text }) => (
  <div className="flex flex-col items-center justify-center min-h-[180px] text-center px-4">
    <span className="w-11 h-11 rounded-2xl bg-violet-50 flex items-center justify-center mb-3">
      <Icon d={icon} size={20} className="text-violet-300" />
    </span>
    <p className="text-sm font-semibold text-gray-500">{title}</p>
    {text && <p className="text-[11px] text-gray-400 mt-1">{text}</p>}
  </div>
);

const TOOLTIP = { borderRadius: 10, border: '1px solid #F3F4F6', fontSize: 11, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };

const STAGE_COLORS = {
  lead: '#A78BFA', visit: '#60A5FA', demo: '#22D3EE', 'data-update': '#818CF8',
  registration: '#F59E0B', feedback: '#F472B6', 'lead-won': '#10B981', 'lead-lost': '#EF4444',
};

const ACTIVITY_SERIES = [
  { key: 'visits',        label: 'Visits',        color: '#60A5FA' },
  { key: 'demos',         label: 'Demos',         color: '#22D3EE' },
  { key: 'dataUpdates',   label: 'Data Updates',  color: '#818CF8' },
  { key: 'registrations', label: 'Registrations', color: '#F59E0B' },
  { key: 'feedback',      label: 'Feedback',      color: '#F472B6' },
];

const ROLE_BADGE = {
  sales: 'bg-violet-50 text-violet-700',
  'inside-sales': 'bg-blue-50 text-blue-700',
  'product-executive': 'bg-amber-50 text-amber-700',
};

const MEDALS = [
  { ring: 'border-amber-300 bg-gradient-to-br from-amber-50 to-white', badge: 'bg-amber-400 text-white', label: '1st' },
  { ring: 'border-gray-300 bg-gradient-to-br from-gray-50 to-white',   badge: 'bg-gray-400 text-white',  label: '2nd' },
  { ring: 'border-orange-300 bg-gradient-to-br from-orange-50 to-white', badge: 'bg-orange-400 text-white', label: '3rd' },
];

const PERIODS = [
  { key: 'today',   label: 'Today' },
  { key: 'weekly',  label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
  { key: 'yearly',  label: 'This Year' },
];

const TEAM_COLUMNS = [
  { key: 'name',          label: 'Employee',  get: (t) => t.employee.name, align: 'left' },
  { key: 'role',          label: 'Role',      get: (t) => t.employee.roleLabel, align: 'left' },
  { key: 'created',       label: 'Created',   get: (t) => t.created },
  { key: 'assigned',      label: 'Assigned',  get: (t) => t.assigned },
  { key: 'open',          label: 'Open',      get: (t) => t.open },
  { key: 'visits',        label: 'Visits',    get: (t) => t.activities.visits },
  { key: 'demos',         label: 'Demos',     get: (t) => t.activities.demos },
  { key: 'dataUpdates',   label: 'Data Upd.', get: (t) => t.activities.dataUpdates },
  { key: 'registrations', label: 'Regs',      get: (t) => t.activities.registrations },
  { key: 'feedback',      label: 'Feedback',  get: (t) => t.activities.feedback },
  { key: 'won',           label: 'Won',       get: (t) => t.won },
  { key: 'lost',          label: 'Lost',      get: (t) => t.lost },
  { key: 'conversionRate', label: 'Conv %',   get: (t) => t.conversionRate },
  { key: 'score',         label: 'Score',     get: (t) => t.score },
];

// Percentage change, or null when there is no prior figure to divide by.
const pct = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);
const firstName = (name = '') => name.split(' ')[0];

/* ═══════════════════ COMPONENT ═══════════════════ */
const AdminCRM = () => {
  const navigate = useNavigate();
  const [data, setData]         = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod]     = useState('monthly');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sort, setSort]         = useState({ key: 'score', dir: 'desc' });
  const requestId = useRef(0);

  useEffect(() => {
    api.get('/products').then(r => setProducts(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    api.get('/admin/reports/crm-analytics', { params: { period } })
      .then(r => { if (id === requestId.current) setData(r.data); })
      .catch(err => { if (id === requestId.current) setError(err.response?.data?.message || 'Failed to load CRM analytics'); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [period]);

  const k = data?.kpis;
  const periodLabel = PERIODS.find(p => p.key === period)?.label;
  const totalLeads = (data?.pipeline || []).reduce((s, p) => s + p.count, 0);

  /* ── Team (filtered + sorted) ── */
  const team = data?.team || [];
  const filteredTeam = useMemo(
    () => (roleFilter === 'all' ? team : team.filter(t => t.employee.role === roleFilter)),
    [team, roleFilter],
  );
  const sortedTeam = useMemo(() => {
    const col = TEAM_COLUMNS.find(c => c.key === sort.key) || TEAM_COLUMNS[TEAM_COLUMNS.length - 1];
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filteredTeam].sort((a, b) => {
      const x = col.get(a); const y = col.get(b);
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
  }, [filteredTeam, sort]);
  const topPerformers = filteredTeam.filter(t => t.score > 0).slice(0, 3); // server already ranks by score
  const teamChart = filteredTeam.map(t => ({
    name: firstName(t.employee.name),
    fullName: t.employee.name,
    ...t.activities,
    won: t.won,
    lost: t.lost,
  }));
  const chartWidth = Math.max(100, teamChart.length * 70); // px per employee, scrolls on small screens

  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'role' ? 'asc' : 'desc' }));

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'team',     label: `Team Performance${team.length ? ` (${team.length})` : ''}` },
    { key: 'products', label: `Products (${products.length})` },
  ];

  const fullNameTooltip = (_, payload) => payload?.[0]?.payload?.fullName || _;

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">CRM Analytics</h2>
          <p className="text-sm text-gray-400 mt-0.5">Lead pipeline, won and lost leads, and sales team performance</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl self-start overflow-x-auto max-w-full">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                period === p.key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ── KPI cards ── */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
        <KPI label="Leads Created" value={k?.leadsCreated} icon={<Icon d={IC.lead} />}  color="violet" trend={k && pct(k.leadsCreated, k.prev.leadsCreated)} />
        <KPI label="Visits"        value={k?.visits}       icon={<Icon d={IC.pin} />}   color="blue"   trend={k && pct(k.visits, k.prev.visits)} />
        <KPI label="Demos"         value={k?.demos}        icon={<Icon d={IC.spark} />} color="amber"  trend={k && pct(k.demos, k.prev.demos)} />
        <KPI label="Leads Won"     value={k?.won}          icon={<Icon d={IC.check} />} color="green"  trend={k && pct(k.won, k.prev.won)} />
        <KPI label="Leads Lost"    value={k?.lost}         icon={<Icon d={IC.x} />}     color="rose"   trend={k && pct(k.lost, k.prev.lost)} />
        <KPI label="Win Rate"      value={k ? `${k.conversionRate}%` : undefined} icon={<Icon d={IC.trend} />} color="indigo"
          sub={k ? `${k.won} won of ${k.won + k.lost} closed` : ''} />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-100 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 font-semibold text-xs border-b-2 -mb-px whitespace-nowrap transition-colors ${
              activeTab === t.key ? 'text-violet-700 border-violet-600' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="py-16 text-center text-gray-300 text-sm">Loading…</div>
      ) : (
      <AnimatePresence mode="wait">
        {/* ═══════════ Overview ═══════════ */}
        {activeTab === 'overview' && data && (
          <motion.div key="overview" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Lead pipeline */}
              <Card title="Lead Pipeline" sub={`All time · ${totalLeads} leads · ${k.openPipeline} open`}>
                {totalLeads === 0 ? (
                  <Empty icon={IC.lead} title="No leads yet" text="Leads appear here as they are created." />
                ) : (
                  <div className="space-y-2.5">
                    {data.pipeline.map(p => {
                      const share = totalLeads ? (p.count / totalLeads) * 100 : 0;
                      return (
                        <div key={p.stage} className="flex items-center gap-3">
                          <span className="w-24 text-xs font-semibold text-gray-600 flex-shrink-0">{p.label}</span>
                          <div className="flex-1 h-6 bg-gray-50 rounded-lg overflow-hidden">
                            <div className="h-full rounded-lg transition-all duration-700"
                              style={{ width: `${Math.max(share, p.count ? 1.5 : 0)}%`, background: STAGE_COLORS[p.stage] }} />
                          </div>
                          <span className="w-20 text-right text-xs tabular-nums flex-shrink-0">
                            <strong className="text-gray-900">{p.count}</strong>
                            <span className="text-gray-400"> · {share.toFixed(0)}%</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Trend */}
              <Card title="Created, Won & Lost" sub="Last 6 months"
                right={
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-200 inline-block" />Created</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Won</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />Lost</span>
                  </div>
                }>
                {data.trend.some(m => m.created || m.won || m.lost) ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.trend} barGap={3} barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#D1D5DB' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP} cursor={{ fill: '#F5F3FF' }} />
                      <Bar dataKey="created" name="Created" fill="#DDD6FE" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="won"     name="Won"     fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="lost"    name="Lost"    fill="#F87171" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty icon={IC.trend} title="No trend data" text="Leads appear here as they are created, won or lost." />
                )}
              </Card>
            </div>

            {/* Won / Lost lists */}
            <div className="grid lg:grid-cols-2 gap-4">
              {[
                { key: 'won',  title: 'Won Leads',  list: data.wonLeads,  count: k.won,  tone: 'text-emerald-600 bg-emerald-50', icon: IC.check },
                { key: 'lost', title: 'Lost Leads', list: data.lostLeads, count: k.lost, tone: 'text-red-500 bg-red-50',         icon: IC.x },
              ].map(box => (
                <div key={box.key} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{box.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{periodLabel}{box.count > box.list.length ? ` · latest ${box.list.length}` : ''}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full flex-shrink-0 ${box.tone}`}>{box.count}</span>
                  </div>
                  {box.list.length === 0 ? (
                    <Empty icon={box.icon} title={`No ${box.key} leads`} text={`Nothing was ${box.key} ${periodLabel.toLowerCase()}.`} />
                  ) : (
                    <ul className="divide-y divide-gray-50 max-h-[360px] overflow-y-auto">
                      {box.list.map(l => (
                        <li key={l._id}>
                          <button onClick={() => navigate(`/crm/leads/${l._id}`)}
                            className="w-full text-left px-5 py-3 hover:bg-violet-50/40 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{l.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">
                                  {l.assignedTo?.name || 'Unassigned'}{l.product?.name ? ` · ${l.product.name}` : ''}
                                </p>
                                {box.key === 'lost' && (
                                  <p className="text-[11px] text-red-400 mt-0.5 truncate">{l.lostReason || 'No reason given'}</p>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400 flex-shrink-0">{formatDate(l.date)}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {/* Lost reasons */}
            {data.lostReasons.length > 0 && (
              <Card title="Why Leads Were Lost" sub={periodLabel}>
                <div className="space-y-2.5">
                  {data.lostReasons.map(r => {
                    const share = k.lost ? (r.count / k.lost) * 100 : 0;
                    return (
                      <div key={r.reason} className="flex items-center gap-3">
                        <span className="w-40 sm:w-56 text-xs text-gray-600 truncate flex-shrink-0" title={r.reason}>{r.reason}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs font-bold text-gray-700 tabular-nums">{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {/* ═══════════ Team Performance ═══════════ */}
        {activeTab === 'team' && data && (
          <motion.div key="team" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">
            {team.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center shadow-sm">
                <Icon d={IC.users} size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 font-semibold">No team data yet</p>
                <p className="text-sm text-gray-300 mt-1">Sales, Inside Sales and Product Executive employees will appear here.</p>
              </div>
            ) : (
              <>
                {/* Role filter */}
                <div className="flex gap-2 flex-wrap">
                  {[{ role: 'all', label: 'All', employees: team.length }, ...data.roleSummary].map(r => (
                    <button key={r.role} onClick={() => setRoleFilter(r.role)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        roleFilter === r.role ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                      }`}>
                      {r.label} <span className={roleFilter === r.role ? 'text-violet-200' : 'text-gray-400'}>{r.employees}</span>
                    </button>
                  ))}
                </div>

                {/* Role summary */}
                <div className="grid sm:grid-cols-3 gap-3">
                  {data.roleSummary.map(r => (
                    <button key={r.role} onClick={() => setRoleFilter(r.role)}
                      className={`text-left bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all ${
                        roleFilter === r.role ? 'border-violet-300 ring-1 ring-violet-200' : 'border-gray-100'
                      }`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[r.role] || 'bg-gray-100 text-gray-600'}`}>{r.label}</span>
                        <span className="text-[11px] text-gray-400">{r.employees} employee{r.employees !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {[
                          { v: r.created, l: 'Created', c: 'text-violet-700' },
                          { v: r.activities, l: 'Activities', c: 'text-blue-600' },
                          { v: r.won, l: 'Won', c: 'text-emerald-600' },
                          { v: r.lost, l: 'Lost', c: 'text-red-500' },
                        ].map(x => (
                          <div key={x.l}>
                            <p className={`text-lg font-extrabold tabular-nums ${x.c}`}>{x.v}</p>
                            <p className="text-[9px] text-gray-400 font-medium">{x.l}</p>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Top performers */}
                <Card title="Top Performers" sub={`${periodLabel} · ranked by won leads, then registrations, demos, visits and leads created`}
                  right={<Icon d={IC.trophy} size={18} className="text-amber-400" />}>
                  {topPerformers.length === 0 ? (
                    <Empty icon={IC.trophy} title="No activity yet" text={`Nobody has created, worked or won a lead ${periodLabel.toLowerCase()}.`} />
                  ) : (
                    <div className="grid sm:grid-cols-3 gap-3">
                      {topPerformers.map((t, i) => (
                        <div key={t.employee._id} className={`border-2 rounded-2xl p-4 ${MEDALS[i].ring}`}>
                          <div className="flex items-center gap-3 mb-3">
                            <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${MEDALS[i].badge}`}>
                              {MEDALS[i].label}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 truncate">{t.employee.name}</p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[t.employee.role] || 'bg-gray-100 text-gray-600'}`}>
                                {t.employee.roleLabel}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div><p className="text-lg font-extrabold text-emerald-600 tabular-nums">{t.won}</p><p className="text-[9px] text-gray-400">Won</p></div>
                            <div><p className="text-lg font-extrabold text-blue-600 tabular-nums">{t.activities.total}</p><p className="text-[9px] text-gray-400">Activities</p></div>
                            <div><p className="text-lg font-extrabold text-violet-700 tabular-nums">{t.conversionRate}%</p><p className="text-[9px] text-gray-400">Win rate</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Charts */}
                <div className="grid lg:grid-cols-2 gap-4">
                  <Card title="Activities by Employee" sub={`${periodLabel} · visits, demos, data updates, registrations, feedback`}>
                    {teamChart.some(t => t.total > 0) ? (
                      <div className="overflow-x-auto">
                        <div style={{ minWidth: chartWidth }}>
                          <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={teamChart} barSize={18}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={0} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#D1D5DB' }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={TOOLTIP} cursor={{ fill: '#F5F3FF' }} labelFormatter={fullNameTooltip} />
                              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                              {ACTIVITY_SERIES.map((s, i) => (
                                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color}
                                  radius={i === ACTIVITY_SERIES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <Empty icon={IC.pin} title="No activities recorded" text={`No visits, demos or other activities ${periodLabel.toLowerCase()}.`} />
                    )}
                  </Card>

                  <Card title="Won vs Lost by Employee" sub={periodLabel}>
                    {teamChart.some(t => t.won || t.lost) ? (
                      <div className="overflow-x-auto">
                        <div style={{ minWidth: chartWidth }}>
                          <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={teamChart} barSize={14} barGap={3}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={0} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#D1D5DB' }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={TOOLTIP} cursor={{ fill: '#F5F3FF' }} labelFormatter={fullNameTooltip} />
                              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                              <Bar dataKey="won"  name="Won"  fill="#10B981" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="lost" name="Lost" fill="#F87171" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <Empty icon={IC.check} title="No won or lost leads" text={`No leads were closed ${periodLabel.toLowerCase()}.`} />
                    )}
                  </Card>
                </div>

                {/* Leads held per employee */}
                <Card title="Leads Held by Employee" sub="Currently assigned leads (all time) · open vs closed">
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: chartWidth }}>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={filteredTeam.map(t => ({ name: firstName(t.employee.name), fullName: t.employee.name, open: t.open, closed: t.assigned - t.open }))} barSize={18}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={0} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#D1D5DB' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: '#F5F3FF' }} labelFormatter={fullNameTooltip} />
                          <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                          <Bar dataKey="open" name="Open" stackId="h" fill="#C4B5FD" />
                          <Bar dataKey="closed" name="Closed" stackId="h" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>

                {/* Employee table */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <p className="font-bold text-gray-900 text-sm">All Sales Employees</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {periodLabel} for created, activities, won and lost · Assigned and Open are current totals · click a column to sort
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead>
                        <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-50">
                          {TEAM_COLUMNS.map(c => (
                            <th key={c.key} onClick={() => toggleSort(c.key)}
                              className={`px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-violet-600 ${c.align === 'left' ? 'text-left first:pl-5' : 'text-right'}`}>
                              {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTeam.map((t, i) => (
                          <tr key={t.employee._id} className={`border-b border-gray-50 hover:bg-violet-50/30 ${i % 2 ? 'bg-gray-50/30' : ''}`}>
                            <td className="pl-5 pr-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 flex-shrink-0">
                                  {t.employee.name.charAt(0).toUpperCase()}
                                </span>
                                <div>
                                  <p className="font-semibold text-gray-800">{t.employee.name}</p>
                                  <p className="text-[10px] text-gray-400">{t.employee.employeeId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[t.employee.role] || 'bg-gray-100 text-gray-600'}`}>
                                {t.employee.roleLabel}
                              </span>
                            </td>
                            {TEAM_COLUMNS.slice(2).map(c => (
                              <td key={c.key} className={`px-3 py-3 text-right tabular-nums ${
                                c.key === 'won' ? 'font-bold text-emerald-600'
                                  : c.key === 'lost' ? 'font-bold text-red-500'
                                  : c.key === 'conversionRate' ? 'font-bold text-violet-700'
                                  : 'text-gray-700'
                              }`}>
                                {c.get(t)}{c.key === 'conversionRate' ? '%' : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ═══════════ Products ═══════════ */}
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
                        <p className="text-lg font-extrabold text-violet-700">{p.leadCount ?? 0}</p>
                        <p className="text-[9px] text-gray-400 font-medium">All Leads</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-extrabold text-emerald-600">{p.wonCount ?? 0}</p>
                        <p className="text-[9px] text-gray-400 font-medium">Won</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-extrabold text-red-500">{p.lostCount ?? 0}</p>
                        <p className="text-[9px] text-gray-400 font-medium">Lost</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-300 mt-3">By {p.createdBy?.name || '—'} · {formatDate(p.createdAt)}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      )}
    </div>
  );
};

export default AdminCRM;
