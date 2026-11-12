import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CalendarClock, CalendarDays, Check, History, Loader2, MapPin, Package, Pencil, RotateCcw, Send, Trophy, User, UserX, Workflow, X,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { getGlobalTable, getGlobalTableFields, getGlobalTableRecord } from '../../services/GlobalTableService';
import { getAssignableUsers } from '../../services/Userservice';
import { useProducts } from '../../hooks/useProducts';
import {
  PIPELINE_STAGES, STAGE_LABELS, TERMINAL_STAGES, activityStageOf, normalizeStage, stageLabel, useGlobalTableColumns,
} from '../../hooks/useGlobalTableColumns';
import { ConvertLostModal, ReworkModal, SendToActivityModal } from '../../components/Crm/ClientActionModals';
import { canAccessEdit } from '../../constants/modules';
import CellDisplay from '../../components/GlobalTable/CellDisplay';
import GlobalDrawer from '../../components/GlobalTable/GlobalDrawer';
import { PAGE_PATHS } from '../../components/Activities/LeadActivitySection';
import LeadPipelinePanel from '../../components/Activities/LeadPipelinePanel';
import { StageEditor } from '../../components/Activities/ActivityLeadInfo';
import { ACTIVITY_ORDER, ACTIVITY_PAGES } from '../../components/Activities/activityTypes';
import {
  canEditLead, canEditPipeline, canEditStage, canSeePipeline,
} from '../../components/Activities/pipelineAccess';
import { formatDateTime } from '../../utils/helpers';
import { formatFollowUp, isFollowUpOverdue } from '../../utils/followUp';

/**
 * CRM › Lead page (/crm/leads/:leadId): everything about one lead.
 *   header    name, stage, assignee, follow-up, product, Mandal, address
 *   details   every field of the lead's table (main + custom); "Edit details"
 *             (CRM edit) opens the same editor as the table's drawer
 *   pipeline  admin / HR / managers only (pipelineAccess.js): progress bar and every
 *             stage as a timeline. With CRM edit they change the stage and add, edit
 *             or delete visits, demos, data update, registration and feedback here.
 * Other employees see the header and the details only.
 * Access is the backend's: GET /leads/:id answers 404 outside the user's CRM scope.
 */

const panel = 'bg-white rounded-2xl border border-violet-100 shadow-sm';

function PipelineProgress({ stage }) {
  const current = normalizeStage(stage);
  const lost = current === 'lead-lost';
  const flow = PIPELINE_STAGES.filter((s) => !TERMINAL_STAGES.includes(s));
  const end = lost ? 'lead-lost' : 'lead-won';
  const steps = [...flow, end];
  const index = steps.indexOf(current);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Pipeline progress">
      {steps.map((s, i) => {
        const done = i < index || (i === index && TERMINAL_STAGES.includes(s));
        const isCurrent = i === index;
        const tone = lost && s === 'lead-lost' ? 'bg-red-500 text-white border-red-500'
          : isCurrent ? 'bg-violet-600 text-white border-violet-600'
            : done ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-white text-gray-400 border-gray-200';
        const content = (
          <>
            {done && !isCurrent && <Check size={12} />}
            {lost && s === 'lead-lost' && <X size={12} />}
            {STAGE_LABELS[s]}
          </>
        );
        return (
          <li key={s} className="flex items-center gap-1 flex-shrink-0" aria-current={isCurrent ? 'step' : undefined}>
            {ACTIVITY_ORDER.includes(s) ? (
              <a href={`#stage-${s}`} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold hover:ring-2 hover:ring-violet-200 ${tone}`}>{content}</a>
            ) : (
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{content}</span>
            )}
            {i < steps.length - 1 && <span className={`w-4 h-px ${i < index ? 'bg-violet-300' : 'bg-gray-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

const Fact = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-2.5 min-w-0 rounded-xl bg-gray-50/80 px-3 py-2.5">
    <Icon size={15} className="mt-0.5 flex-shrink-0 text-violet-400" />
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-800 break-words">{children}</div>
    </div>
  </div>
);

function FieldGroup({ title, columns, valueOf, empty, wide }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
        {title} <span className="font-medium text-gray-400">{columns.length}</span>
      </h3>
      {columns.length === 0 ? (
        <p className="text-xs text-gray-400">{empty}</p>
      ) : (
        <dl className={`grid gap-2.5 sm:grid-cols-2 ${wide ? 'xl:grid-cols-3' : ''}`}>
          {columns.map((col) => (
            <div key={col.key} className={`rounded-lg bg-gray-50/70 px-3 py-2 ${col.type === 'multi-select' || col.type === 'person' ? 'sm:col-span-2' : ''}`}>
              <dt className="text-[11px] text-gray-400">{col.label}</dt>
              <dd className="mt-0.5 text-sm text-gray-800 min-h-[1.25rem] break-words">{valueOf(col)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const HISTORY_ACTIONS = {
  move: 'Stage changed',
  convert: 'Converted to lost',
  rework: 'Reworked',
  activity: 'Client activity',
};
const historyStage = (s) => (s === 'clients' ? 'Clients' : stageLabel(s));
const HISTORY_DOT = { convert: 'bg-red-500', rework: 'bg-amber-500', activity: 'bg-blue-500', move: 'bg-violet-400' };

/** Every stage change, newest first (from GET /leads/:id). */
function StageHistory({ items }) {
  if (!items?.length) return null;
  const list = [...items].reverse();
  return (
    <section className={`${panel} p-5`} aria-label="Stage history">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900 mb-3"><History size={15} className="text-violet-400" /> Stage history</h2>
      <ol className="space-y-2.5">
        {list.map((h, i) => (
          <li key={`${h.at}-${i}`} className="flex items-start gap-2.5 text-xs">
            <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${HISTORY_DOT[h.action] || HISTORY_DOT.move}`} />
            <div className="min-w-0 flex-1">
              <p className="text-gray-800">
                <span className="font-semibold">{HISTORY_ACTIONS[h.action] || 'Changed'}</span>: {historyStage(h.from)} → {historyStage(h.to)}
              </p>
              <p className="text-gray-400">{h.by?.name || 'Someone'} · {formatDateTime(h.at)}</p>
              {h.reason && <p className="mt-0.5 text-gray-600 break-words">&ldquo;{h.reason}&rdquo;</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Won / lost banner with the CRM › Clients actions (CRM edit only). */
function ClientBanner({ lead, canEdit, onAction }) {
  const stage = normalizeStage(lead.pipelineStage);
  if (stage === 'lead-won') {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
        <Trophy size={16} className="text-emerald-600" />
        <p className="flex-1 min-w-0 text-xs text-emerald-800">
          <strong>Client.</strong>{' '}
          {lead.wonActivityStage
            ? <>Currently in <strong>{stageLabel(lead.wonActivityStage)}</strong>, assigned to {lead.assignedTo?.name || '—'}.</>
            : 'Not on any activity page.'}
        </p>
        {canEdit && (
          <>
            <button type="button" onClick={() => onAction('send')} className="btn-secondary btn-sm gap-1.5"><Send size={13} /> {lead.wonActivityStage ? 'Change activity' : 'Send to activity'}</button>
            <button type="button" onClick={() => onAction('lost')} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"><UserX size={13} /> Convert to Lost</button>
          </>
        )}
      </div>
    );
  }
  if (stage === 'lead-lost') {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
        <UserX size={16} className="text-red-600" />
        <p className="flex-1 min-w-0 text-xs text-red-800">
          <strong>Lead Lost</strong>{lead.wasClient ? ' (was a client)' : ''}
          {lead.lostAt ? <> on {formatDateTime(lead.lostAt)}</> : null}
          {lead.lostBy?.name ? <> by {lead.lostBy.name}</> : null}
          {lead.lostReason ? <>: &ldquo;{lead.lostReason}&rdquo;</> : '.'}
        </p>
        {canEdit && (
          <button type="button" onClick={() => onAction('rework')} className="btn-primary btn-sm gap-1.5"><RotateCcw size={13} /> Rework</button>
        )}
      </div>
    );
  }
  return null;
}

export default function LeadDetailPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const products = useProducts();
  const [users, setUsers] = useState([]);
  const [state, setState] = useState({ loading: true, error: null, lead: null, table: null, fields: [], record: null, customValues: {}, computed: {} });
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clientAction, setClientAction] = useState(null); // 'send' | 'lost' | 'rework'
  const canEditClients = canAccessEdit(user, 'crm');

  const seePipeline = canSeePipeline(user);
  const editPipeline = canEditPipeline(user);
  const editLead = canEditLead(user);
  // Entries: edit on that stage's page module (visits, demos, ...), checked per stage.
  const editAnyStage = seePipeline && ACTIVITY_ORDER.some((type) => canEditStage(user, type));

  useEffect(() => {
    getAssignableUsers().then((list) => setUsers(Array.isArray(list) ? list : [])).catch(() => setUsers([]));
  }, []);
  const userLookup = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data: lead } = await api.get(`/leads/${leadId}`);
      let table = null;
      let fields = [];
      let record = null;
      let customValues = {};
      let computed = {};
      if (lead.globalTableId) {
        const tableId = lead.globalTableId._id || lead.globalTableId;
        const [t, f, r] = await Promise.all([
          getGlobalTable(tableId),
          getGlobalTableFields({ tableId }),
          getGlobalTableRecord(tableId, leadId),
        ]);
        table = t;
        fields = (f?.fields || []).filter((x) => x.isActive !== false).sort((a, b) => (a.position - b.position));
        record = r?.record || null;
        customValues = r?.customValues || {};
        computed = r?.computedValues || {};
      }
      setState({ loading: false, error: null, lead, table, fields, record, customValues, computed });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err?.response?.status === 404 ? 'This lead does not exist, or you do not have access to it.' : (err?.response?.data?.message || 'Failed to load the lead'),
      }));
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load, reloadKey]);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const { loading, error, lead, table, fields, record, customValues, computed } = state;
  const { columns } = useGlobalTableColumns(fields, products, table);
  const shown = record || lead;

  if (loading && !lead) {
    return <div className="flex items-center justify-center gap-2 py-24 text-sm text-violet-500"><Loader2 size={18} className="animate-spin" /> Loading lead…</div>;
  }
  if (error && !lead) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <AlertTriangle size={28} className="mx-auto text-amber-500" />
        <p className="mt-3 text-sm text-gray-700">{error}</p>
        <button type="button" onClick={() => navigate(-1)} className="mt-4 btn-secondary btn-sm gap-1"><ArrowLeft size={14} /> Back</button>
      </div>
    );
  }

  // The lead's own fields carry the populated assignee / product; the table record may not.
  const assignee = lead?.assignedTo || shown.assignedTo;
  const assigneeName = assignee?.name || userLookup[assignee?._id || assignee]?.name || '—';
  const productName = lead?.product?.name || shown.product?.name || products.options.find((o) => o.value === String(shown.product))?.label || '—';
  const followUp = shown.followUpDate;
  const currentStage = normalizeStage(shown.pipelineStage);
  // A client sent to an activity page is worked on there; other closed leads have no page.
  const activeStage = activityStageOf({ ...shown, wonActivityStage: lead?.wonActivityStage ?? shown.wonActivityStage });
  const overdue = isFollowUpOverdue(followUp) && Boolean(activeStage);
  const stagePage = activeStage ? ACTIVITY_PAGES[activeStage] : null; // the page where the lead is worked on

  const valueOf = (col) => {
    if (col.source === 'lead' && col.type === 'name') return <span className="text-sm font-semibold">{shown.name}</span>;
    if (col.source === 'lead' && col.type === 'assignee') return <span className="text-sm">{assigneeName}</span>;
    if (col.source === 'lead' && col.key === 'district') return <span className="text-sm">{shown.district || '—'}</span>;
    const raw = col.source === 'lead' ? shown[col.key] : customValues[col.field?.key];
    return <CellDisplay col={col} lead={shown} raw={raw} computedValue={computed[col.field?.key]} userLookup={userLookup} canEdit={false} onToggleBool={() => {}} />;
  };
  const mainColumns = columns.filter((c) => c.source !== 'custom');
  const customColumns = columns.filter((c) => c.source === 'custom');
  const stageLead = { ...shown, assignedTo: assignee };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} className="gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-50">
          <ArrowLeft size={14} /> Back
        </button>
        <nav aria-label="Location" className="text-xs text-gray-500 truncate">
          {[productName !== '—' ? productName : null, shown.district, shown.mandal, table?.name].filter(Boolean).join(' › ')}
        </nav>
        {loading && <Loader2 size={14} className="animate-spin text-violet-400" />}
      </div>

      {/* Header */}
      <section className={`${panel} p-5`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-500">{currentStage === 'lead-won' ? 'Client' : 'Lead'}</p>
            <h1 className="text-2xl font-bold text-gray-900 break-words">{shown.name}</h1>
            <p className="mt-1 text-xs text-gray-400">Created {formatDateTime(shown.createdAt)} · Updated {formatDateTime(shown.updatedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {seePipeline && stagePage && (
              <Link to={`${PAGE_PATHS[stagePage.key]}?lead=${leadId}`} className="btn-secondary btn-sm gap-1.5"><CalendarDays size={14} /> Open in {stagePage.title}</Link>
            )}
            {table && editLead && (
              <button type="button" onClick={() => setEditing(true)} className="btn-primary btn-sm gap-1.5"><Pencil size={14} /> Edit details</button>
            )}
          </div>
        </div>

        {seePipeline && (
          <div className="mt-4">
            <PipelineProgress stage={shown.pipelineStage} />
          </div>
        )}

        {lead && <ClientBanner lead={lead} canEdit={canEditClients} onAction={setClientAction} />}

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Fact icon={Workflow} label="Pipeline stage">
            {editPipeline
              ? <StageEditor lead={stageLead} onChanged={reload} />
              : <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-semibold">{stageLabel(currentStage)}</span>}
          </Fact>
          <Fact icon={User} label="Assigned to">{assigneeName}</Fact>
          <Fact icon={CalendarClock} label="Next follow-up">
            {formatFollowUp(followUp)}
            {overdue && <span className="ml-1.5 rounded-full bg-red-50 text-red-600 px-1.5 py-0.5 text-[10px] font-semibold">Overdue</span>}
          </Fact>
          <Fact icon={Package} label="Product">{productName}</Fact>
          <Fact icon={MapPin} label="Mandal">{shown.mandal || '—'}</Fact>
          <Fact icon={MapPin} label="Address">{shown.district || '—'}</Fact>
        </div>
      </section>

      <div className={`grid gap-4 items-start ${seePipeline ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''}`}>
        {/* All fields */}
        <section className={`${panel} p-5 space-y-5 ${seePipeline ? 'lg:sticky lg:top-4' : ''}`} aria-label="Lead details">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">Details</h2>
            {table && editLead && (
              <button type="button" onClick={() => setEditing(true)} className="gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50"><Pencil size={12} /> Edit</button>
            )}
          </div>
          {!table && <p className="text-xs text-gray-500">This lead is not in a table, so only its main fields are shown.</p>}
          <FieldGroup title="Main fields" columns={mainColumns} valueOf={valueOf} empty="No main fields." wide={!seePipeline} />
          {table && <FieldGroup title="Custom fields" columns={customColumns} valueOf={valueOf} empty="This table has no custom fields." wide={!seePipeline} />}
        </section>

        {/* Every pipeline stage (admin / HR / managers) */}
        {seePipeline && (
          <section className={`${panel} p-5`} aria-label="Pipeline activity">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-gray-900">Pipeline activity</h2>
              <p className="text-[11px] text-gray-400">
                {editAnyStage ? 'Add entries to the current stage; open any entry to edit it.' : 'View only: open an entry to see all of it.'}
              </p>
            </div>
            <LeadPipelinePanel
              leadId={leadId}
              stage={shown.pipelineStage}
              wonActivityStage={lead?.wonActivityStage || null}
              userLookup={userLookup}
              reloadKey={reloadKey}
              editable={seePipeline}
              currentUser={user}
              onLeadChanged={reload}
            />
          </section>
        )}
      </div>

      {lead?.stageHistory?.length > 0 && <StageHistory items={lead.stageHistory} />}

      {clientAction === 'send' && <SendToActivityModal lead={lead} onClose={() => setClientAction(null)} onDone={() => { setClientAction(null); reload(); }} />}
      {clientAction === 'lost' && <ConvertLostModal lead={lead} onClose={() => setClientAction(null)} onDone={() => { setClientAction(null); reload(); }} />}
      {clientAction === 'rework' && <ReworkModal lead={lead} onClose={() => setClientAction(null)} onDone={() => { setClientAction(null); reload(); }} />}

      {editing && table && (
        <GlobalDrawer
          isOpen
          mode="edit"
          tableId={table._id}
          recordId={leadId}
          columns={columns}
          userLookup={userLookup}
          startEditing
          showLeadLink={false}
          activityTypes={[]} // already on this page
          onClose={() => setEditing(false)}
          onSaved={reload}
          onPartial={reload}
        />
      )}
    </div>
  );
}
