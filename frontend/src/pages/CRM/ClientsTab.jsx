import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeftRight, Eye, RotateCcw, Send, Trophy, Undo2, UserX,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Card, { KpiCard } from '../../components/UI/Card';
import EmptyState from '../../components/UI/EmptyState';
import { SearchableSelect } from '../../components/UI/Assignmentselects';
import ConfirmDialog from '../../components/GlobalTable/ConfirmDialog';
import { ConvertLostModal, ReworkModal, SendToActivityModal } from '../../components/Crm/ClientActionModals';
import { ACTIVITY_STAGES, stageLabel } from '../../hooks/useGlobalTableColumns';
import { canAccessEdit } from '../../constants/modules';
import { getAllLeadsInStage, sendClientToActivity } from '../../services/Leadservice';
import { formatFollowUp, isFollowUpOverdue } from '../../utils/followUp';
import { formatDate } from '../../utils/helpers';

/**
 * CRM › Clients
 *   Won Clients   every lead in Lead Won. From here a client is sent to an activity page
 *                 (Visit, Demo, Data Update, Registration, Feedback) and given to a sales
 *                 employee; its stage stays Lead Won. Or it is converted to Lead Lost.
 *   Lost Clients  every lead in Lead Lost ("was a client" when it had been won). Rework puts
 *                 it back into the pipeline.
 * Actions need edit access to the CRM module; the backend checks it again.
 */

const NO_PRODUCT = '__none__';
const productIdOf = (lead) => (lead.product?._id ? String(lead.product._id) : NO_PRODUCT);
const placeOf = (lead) => [lead.mandal, lead.district].filter(Boolean).join(', ') || '—';
const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

const NOT_IN_ACTIVITY = '__clients__';
const ACTIVITY_FILTERS = [
  { id: '', label: 'All activities' },
  { id: NOT_IN_ACTIVITY, label: 'Not in an activity' },
  ...ACTIVITY_STAGES.map((s) => ({ id: s, label: stageLabel(s) })),
];

const Icon = ({ d, size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><path d={d} /></svg>
);
const PEOPLE_ICON = 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z';

function ActivityChip({ lead }) {
  if (!lead.wonActivityStage) return <span className="text-xs text-gray-400">Not in an activity</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> {stageLabel(lead.wonActivityStage)}
    </span>
  );
}

function FollowUpCell({ lead }) {
  if (!lead.followUpDate || !lead.wonActivityStage) return <span className="text-gray-400">—</span>;
  const overdue = isFollowUpOverdue(lead.followUpDate);
  return <span className={overdue ? 'font-semibold text-red-600' : ''}>{formatFollowUp(lead.followUpDate, { withYear: false })}{overdue ? ' · overdue' : ''}</span>;
}

const WasClientTag = () => (
  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 flex-shrink-0" title="This lead was won before it was lost">
    <Trophy size={10} /> was a client
  </span>
);

const IconButton = ({ title, onClick, children, tone = 'violet' }) => {
  const tones = {
    violet: 'text-violet-600 hover:bg-violet-50',
    red: 'text-red-600 hover:bg-red-50',
    gray: 'text-gray-500 hover:bg-gray-100',
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </button>
  );
};

/** Product dropdown options built from the loaded leads, with counts. */
const productOptions = (leads) => {
  const byId = new Map();
  leads.forEach((l) => {
    const id = productIdOf(l);
    const entry = byId.get(id) || { id, label: l.product?.name || 'No product', count: 0 };
    entry.count += 1;
    byId.set(id, entry);
  });
  const list = [...byId.values()]
    .sort((a, b) => (a.id === NO_PRODUCT) - (b.id === NO_PRODUCT) || a.label.localeCompare(b.label))
    .map((p) => ({ id: p.id, label: p.label, sublabel: `${p.count}` }));
  return [{ id: '', label: 'All products', sublabel: `${leads.length}` }, ...list];
};

const matchesSearch = (lead, q, extra = []) => !q || [lead.name, lead.mandal, lead.district, lead.product?.name, lead.assignedTo?.name, ...extra]
  .some((v) => String(v || '').toLowerCase().includes(q));

export default function ClientsTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = canAccessEdit(user, 'crm');

  const sub = searchParams.get('clients') === 'lost' ? 'lost' : 'won';
  const setSub = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'lost') next.set('clients', 'lost'); else next.delete('clients');
    setSearchParams(next, { replace: true });
  };

  const [won, setWon] = useState(null);
  const [lost, setLost] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [activity, setActivity] = useState('');
  const [action, setAction] = useState(null); // { kind: 'send' | 'lost' | 'rework' | 'back', lead }
  const [backBusy, setBackBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, l] = await Promise.all([getAllLeadsInStage('lead-won'), getAllLeadsInStage('lead-lost')]);
      setWon(w);
      setLost(l);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Filters reset when switching sub-tabs (the product lists differ).
  useEffect(() => { setProductId(''); setActivity(''); }, [sub]);

  const q = search.trim().toLowerCase();
  const list = (sub === 'won' ? won : lost) || [];
  const products = useMemo(() => productOptions(list), [list]);

  const shownWon = useMemo(() => (won || []).filter((l) => {
    if (productId && productIdOf(l) !== productId) return false;
    if (activity === NOT_IN_ACTIVITY && l.wonActivityStage) return false;
    if (activity && activity !== NOT_IN_ACTIVITY && l.wonActivityStage !== activity) return false;
    return matchesSearch(l, q, [l.wonActivityStage && stageLabel(l.wonActivityStage)]);
  }), [won, productId, activity, q]);

  const shownLost = useMemo(() => (lost || []).filter((l) => {
    if (productId && productIdOf(l) !== productId) return false;
    return matchesSearch(l, q, [l.lostReason, l.lostBy?.name]);
  }), [lost, productId, q]);

  const monthStart = startOfMonth();
  const wonStats = {
    total: won?.length,
    inActivity: won?.filter((l) => l.wonActivityStage).length,
    thisMonth: won?.filter((l) => new Date(l.updatedAt) >= monthStart).length,
  };
  const lostStats = {
    total: lost?.length,
    formerClients: lost?.filter((l) => l.wasClient).length,
    thisMonth: lost?.filter((l) => l.lostAt && new Date(l.lostAt) >= monthStart).length,
  };

  const done = () => { setAction(null); load(); };
  const open = (lead) => navigate(`/crm/leads/${lead._id}`);

  const backToClients = async () => {
    if (!action?.lead) return;
    setBackBusy(true);
    try {
      await sendClientToActivity(action.lead._id, { stage: null });
      toast.success(`${action.lead.name} is back in Clients`);
      done();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBackBusy(false);
    }
  };

  const wonActions = (lead) => (
    <div className="flex flex-wrap items-center justify-end gap-0.5">
      {canEdit && (
        <IconButton title={lead.wonActivityStage ? 'Change activity / assignee' : 'Send to an activity'} onClick={() => setAction({ kind: 'send', lead })}>
          {lead.wonActivityStage ? <ArrowLeftRight size={13} /> : <Send size={13} />}
          <span className="hidden lg:inline">{lead.wonActivityStage ? 'Change' : 'Send to activity'}</span>
        </IconButton>
      )}
      {canEdit && lead.wonActivityStage && (
        <IconButton title="Back to Clients (take off the activity page)" tone="gray" onClick={() => setAction({ kind: 'back', lead })}>
          <Undo2 size={13} />
        </IconButton>
      )}
      {canEdit && (
        <IconButton title="Convert to Lead Lost" tone="red" onClick={() => setAction({ kind: 'lost', lead })}>
          <UserX size={13} />
        </IconButton>
      )}
      <IconButton title="View" tone="gray" onClick={() => open(lead)}><Eye size={13} /></IconButton>
    </div>
  );

  const lostActions = (lead) => (
    <div className="flex items-center justify-end gap-0.5">
      {canEdit && (
        <IconButton title="Rework: back into the pipeline" onClick={() => setAction({ kind: 'rework', lead })}>
          <RotateCcw size={13} /> <span className="hidden lg:inline">Rework</span>
        </IconButton>
      )}
      <IconButton title="View" tone="gray" onClick={() => open(lead)}><Eye size={13} /></IconButton>
    </div>
  );

  const subTabs = [
    { key: 'won', label: 'Won Clients', count: won?.length },
    { key: 'lost', label: 'Lost Clients', count: lost?.length },
  ];

  const isWon = sub === 'won';
  const rows = isWon ? shownWon : shownLost;
  const loaded = isWon ? won : lost;

  return (
    <>
      {/* Sub-tabs */}
      <div className="flex gap-2" role="tablist" aria-label="Clients">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={sub === t.key}
            onClick={() => setSub(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${sub === t.key
              ? (t.key === 'won' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-red-600 border-red-600 text-white')
              : 'bg-white border-violet-100 text-violet-600 hover:bg-violet-50'}`}
          >
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${sub === t.key ? 'bg-white/20' : 'bg-violet-100 text-violet-700'}`}>{t.count ?? '—'}</span>
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {isWon ? (
          <>
            <KpiCard label="Total Clients" value={wonStats.total ?? '—'} icon={<Icon d={PEOPLE_ICON} className="text-violet-600" />} color="violet" />
            <KpiCard label="In an Activity" value={wonStats.inActivity ?? '—'} icon={<Send size={14} className="text-blue-600" />} color="blue" />
            <KpiCard label="Won This Month" value={wonStats.thisMonth ?? '—'} icon={<Trophy size={14} className="text-amber-500" />} color="golden" />
          </>
        ) : (
          <>
            <KpiCard label="Lost Leads" value={lostStats.total ?? '—'} icon={<UserX size={14} className="text-red-600" />} color="violet" />
            <KpiCard label="Were Clients" value={lostStats.formerClients ?? '—'} icon={<Trophy size={14} className="text-amber-500" />} color="golden" />
            <KpiCard label="Lost This Month" value={lostStats.thisMonth ?? '—'} icon={<Icon d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" className="text-red-500" />} color="blue" />
          </>
        )}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="font-bold text-violet-900">
            {isWon ? 'Won Clients' : 'Lost Clients'}{' '}
            <span className="text-xs font-medium text-violet-400">({isWon ? 'Lead Won' : 'Lead Lost'})</span>
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <input
              type="search"
              className="input-field sm:w-56"
              placeholder={isWon ? 'Search name, mandal, activity...' : 'Search name, mandal, reason...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="sm:w-48">
              <SearchableSelect options={products} value={productId} onChange={setProductId} loading={loading && !loaded} placeholder="All products" emptyMessage="No products found" />
            </div>
            {isWon && (
              <div className="sm:w-48">
                <SearchableSelect options={ACTIVITY_FILTERS} value={activity} onChange={setActivity} placeholder="All activities" />
              </div>
            )}
          </div>
        </div>

        {loading && !loaded ? (
          <p className="py-10 text-center text-sm text-violet-400">Loading clients...</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={isWon ? <Trophy size={40} className="text-violet-400" /> : <UserX size={40} className="text-violet-400" />}
            title={loaded?.length ? 'No matching leads' : isWon ? 'No clients yet' : 'No lost leads'}
            message={loaded?.length ? 'Try another product, activity or search.'
              : isWon ? 'Leads moved to the "Lead Won" stage show up here.' : 'Leads moved to "Lead Lost", or clients converted to lost, show up here.'}
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {rows.map((lead) => (
                <div key={lead._id} className="p-3 border border-violet-100 rounded-xl">
                  <div className="flex items-start justify-between gap-2 mb-1" onClick={() => open(lead)}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-violet-900 text-sm truncate flex items-center gap-1.5">
                        <span className="truncate">{lead.name}</span>
                        {!isWon && lead.wasClient && <WasClientTag />}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{lead.product?.name || 'No product'} · {placeOf(lead)}</p>
                    </div>
                    {isWon ? <ActivityChip lead={lead} /> : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0">Lost</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-violet-50 text-[11px] text-gray-500">
                    <span className="truncate">
                      {isWon
                        ? <>{lead.assignedTo?.name || '—'} · <FollowUpCell lead={lead} /></>
                        : <>{lead.lostAt ? formatDate(lead.lostAt) : '—'}{lead.lostReason ? ` · ${lead.lostReason}` : ''}</>}
                    </span>
                    {isWon ? wonActions(lead) : lostActions(lead)}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
              <table className="data-table min-w-[760px]">
                <thead>
                  {isWon ? (
                    <tr><th>Client</th><th>Product</th><th>Mandal / District</th><th>Assigned To</th><th>Activity</th><th>Follow-up</th><th className="text-right">Actions</th></tr>
                  ) : (
                    <tr><th>Lead</th><th>Product</th><th>Mandal / District</th><th>Lost On</th><th>Lost By</th><th>Reason</th><th className="text-right">Actions</th></tr>
                  )}
                </thead>
                <tbody>
                  {rows.map((lead) => (
                    <tr key={lead._id} className="cursor-pointer" onClick={() => open(lead)}>
                      <td className="font-semibold text-violet-900">
                        <span className="inline-flex items-center gap-1.5">{lead.name}{!isWon && lead.wasClient && <WasClientTag />}</span>
                      </td>
                      <td className="text-gray-600">{lead.product?.name || '—'}</td>
                      <td className="text-sm text-gray-600">{placeOf(lead)}</td>
                      {isWon ? (
                        <>
                          <td className="text-sm">{lead.assignedTo?.name || '—'}</td>
                          <td><ActivityChip lead={lead} /></td>
                          <td className="text-xs"><FollowUpCell lead={lead} /></td>
                          <td>{wonActions(lead)}</td>
                        </>
                      ) : (
                        <>
                          <td className="text-xs">{lead.lostAt ? formatDate(lead.lostAt) : '—'}</td>
                          <td className="text-sm">{lead.lostBy?.name || '—'}</td>
                          <td className="text-xs text-gray-600 max-w-[16rem] truncate" title={lead.lostReason || ''}>{lead.lostReason || '—'}</td>
                          <td>{lostActions(lead)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {action?.kind === 'send' && <SendToActivityModal lead={action.lead} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'lost' && <ConvertLostModal lead={action.lead} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'rework' && <ReworkModal lead={action.lead} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'back' && (
        <ConfirmDialog
          title="Take this client off its activity page?"
          confirmLabel="Back to Clients"
          busy={backBusy}
          onConfirm={backToClients}
          onCancel={() => setAction(null)}
        >
          <strong>{action.lead.name}</strong> leaves the {stageLabel(action.lead.wonActivityStage)} page and its follow-up date is cleared.
          Its records stay. It remains a client (Lead Won).
        </ConfirmDialog>
      )}
    </>
  );
}
