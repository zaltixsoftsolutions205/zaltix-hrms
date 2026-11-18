import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarClock, CalendarSearch, Check, ClipboardList, Loader2, Lock, MapPin, Package, Pencil, Plus, User, Workflow, X,
} from 'lucide-react';
import {
  PIPELINE_STAGE_OPTIONS, activityStageOf, isClient, isStageLocked, normalizeStage, stageLabel,
} from '../../hooks/useGlobalTableColumns';
import ClientBadge from '../Crm/ClientBadge';
import { updateLeadStage } from '../../services/ActivityService';
import StageChangeDialog, { needsFollowUpDialog } from '../Crm/StageChangeDialog';
import { groupByDay } from '../Visits/VisitCalendar';
import { formatDay, formatTime } from '../Visits/visitDates';
import { entryDate } from './activityTypes';
import { followUpInput, followUpToApi, formatFollowUp, joinFollowUp, splitFollowUp } from '../../utils/followUp';

/**
 * The stage with an edit option (lead rules: lead-won / lead-lost cannot be changed).
 * readOnly: just the stage (no edit permission).
 */
export function StageEditor({ lead, onChanged, readOnly = false }) {
  const current = normalizeStage(lead.pipelineStage);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(false); // Assign To + Next Follow-up popup
  useEffect(() => { setValue(current); setEditing(false); }, [lead._id, current]);

  const locked = isStageLocked(current);

  const save = async () => {
    if (value === current) { setEditing(false); return; }
    if (needsFollowUpDialog(value)) { setDialog(true); return; }
    setSaving(true);
    try {
      await updateLeadStage(lead._id, value, current);
      toast.success(`Stage changed to ${stageLabel(value)}`);
      setEditing(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Portal: used in the lead drawer too, whose transform would trap a fixed dialog.
  const stageDialog = dialog && createPortal(
    <StageChangeDialog
      lead={lead}
      from={current}
      to={value}
      onCancel={() => setDialog(false)}
      onSaved={() => { setDialog(false); setEditing(false); onChanged?.(); }}
    />,
    document.body,
  );

  if (!editing) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-semibold">{stageLabel(current)}</span>
        {isClient(lead) && lead.wonActivityStage && (
          <span className="text-[11px] text-gray-500">· client in {stageLabel(lead.wonActivityStage)}</span>
        )}
        {readOnly ? null : locked ? (
          <Lock size={12} className="text-gray-400" aria-label="Changed from CRM › Clients" title="Won and lost leads are changed from CRM › Clients" />
        ) : (
          <button type="button" onClick={() => setEditing(true)} aria-label="Change pipeline stage" title="Change stage" className="w-6 h-6 rounded text-violet-400 hover:text-violet-700 hover:bg-violet-50">
            <Pencil size={12} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <select aria-label="Pipeline stage" value={value} disabled={saving} onChange={(e) => setValue(e.target.value)} className="input-field !py-1 !text-xs flex-1 min-w-0">
        {PIPELINE_STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="button" onClick={save} disabled={saving} aria-label="Save stage" className="w-7 h-7 flex-shrink-0 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </button>
      <button type="button" onClick={() => { setValue(current); setEditing(false); }} disabled={saving} aria-label="Cancel" className="w-7 h-7 flex-shrink-0 rounded text-gray-400 hover:bg-gray-100">
        <X size={14} />
      </button>
      {stageDialog}
    </span>
  );
}

/**
 * The lead's follow-up date (the calendars place the lead by it), with an edit
 * option for users with edit access to this page's module. Day + optional time
 * (no time: all day). The server checks the permission again.
 */
function FollowUpEditor({ page, lead, readOnly, onChanged, onShowFollowUp }) {
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEditing(false); }, [lead._id, lead.followUpDate]);

  const start = () => {
    const { day: d, time: t } = splitFollowUp(followUpInput(lead.followUpDate));
    setDay(d);
    setTime(t);
    setEditing(true);
  };

  const save = async (clear = false) => {
    let value;
    try {
      value = clear ? '' : followUpToApi(joinFollowUp(day, time));
    } catch (err) {
      toast.error(err.message);
      return;
    }
    setSaving(true);
    try {
      await page.api.setFollowUp(lead._id, value);
      toast.success(value ? 'Follow-up date updated' : 'Follow-up date cleared');
      setEditing(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className="flex items-center gap-1.5">
        {formatFollowUp(lead.followUpDate)}
        {lead.followUpDate && (
          <button type="button" onClick={onShowFollowUp} aria-label="Show in calendar" title="Show in calendar" className="w-6 h-6 rounded text-violet-400 hover:text-violet-700 hover:bg-violet-50">
            <CalendarSearch size={13} />
          </button>
        )}
        {!readOnly && (
          <button type="button" onClick={start} aria-label="Change follow-up date" title="Change follow-up date" className="w-6 h-6 rounded text-violet-400 hover:text-violet-700 hover:bg-violet-50">
            <Pencil size={12} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="block space-y-1.5">
      <span className="flex items-center gap-1">
        <input type="date" aria-label="Follow-up date" value={day} disabled={saving} onChange={(e) => setDay(e.target.value)} className="input-field !py-1 !text-xs flex-1 min-w-0" />
        <input type="time" aria-label="Follow-up time (optional)" title="Optional: leave empty for all day" value={time} disabled={saving || !day} onChange={(e) => setTime(e.target.value)} className="input-field !py-1 !text-xs w-[6.5rem] flex-shrink-0" />
      </span>
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => save(false)} disabled={saving || !day} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100">
          Cancel
        </button>
        {lead.followUpDate && (
          <button type="button" onClick={() => save(true)} disabled={saving} className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
            Clear
          </button>
        )}
      </span>
      <span className="block text-[10px] text-gray-400">No time: all day. The lead moves on the calendar to this date.</span>
    </span>
  );
}

/** No lead selected: the leads of the period shown in the middle, to pick from. */
function Agenda({ page, leads, title, onSelect }) {
  const days = useMemo(() => [...groupByDay(leads).entries()].sort(([a], [b]) => a.localeCompare(b)), [leads]);
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2">
        <ClipboardList size={16} className="text-violet-500" />
        <h2 className="text-sm font-bold text-gray-900">In {page.label}</h2>
        <span className="ml-auto rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[11px] font-semibold">{leads.length}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-gray-500">{title}</p>
      {leads.length === 0 ? (
        <p className="mt-6 text-center text-xs text-gray-400">No leads in the {page.label} stage in this period.</p>
      ) : (
        <div className="mt-3 -mx-1 px-1 flex-1 min-h-0 overflow-y-auto space-y-3">
          {days.map(([key, items]) => (
            <div key={key}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                {items[0].place.day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
              <div className="space-y-1">
                {items.map(({ lead, place }) => (
                  <button
                    key={lead._id}
                    type="button"
                    onClick={() => onSelect(lead)}
                    className="w-full !flex !justify-start gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-violet-50"
                  >
                    <span className="w-1.5 self-stretch rounded-full bg-violet-400 flex-shrink-0" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="flex items-center gap-1 text-xs font-semibold text-gray-900 min-w-0"><span className="truncate">{lead.name}</span><ClientBadge lead={lead} /></span>
                      <span className="block text-[10px] text-gray-500 truncate">{place.allDay ? 'All day' : formatTime(place.date)}{lead.mandal ? ` · ${lead.mandal}` : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-400">Pick a lead to see its details and {page.title.toLowerCase()}.</p>
    </div>
  );
}

/**
 * Left bar of an activity page. With a lead selected: its main fields, the stage
 * edit, and shortcuts that drive the other panels (show its follow-up day in the
 * calendar, add an entry). Without one: the agenda of the period shown in the middle.
 *   editable        edit permission on the page's module: "Add" is offered
 *   canChangeStage  may also change the lead's stage
 */
export default function ActivityLeadInfo({
  page, lead, detail, loading, periodLeads, periodTitle, onSelect, onClose, onLeadChanged, onShowFollowUp, onAdd, onOpenEntry,
  editable = true, canChangeStage = true,
}) {
  if (!lead) return <Agenda page={page} leads={periodLeads} title={periodTitle} onSelect={onSelect} />;

  const entries = detail?.entries || [];
  const last = entries[entries.length - 1];
  // Open leads in this stage, and clients sent to this page from CRM › Clients.
  const inStage = activityStageOf(lead) === page.stage;
  const client = isClient(lead);
  const single = page.single;

  const rows = [
    { icon: Workflow, label: 'Pipeline stage', value: <StageEditor lead={lead} onChanged={onLeadChanged} readOnly={!canChangeStage} /> },
    {
      icon: CalendarClock,
      label: 'Follow-up date',
      value: <FollowUpEditor page={page} lead={lead} readOnly={!editable || !page.api?.setFollowUp} onChanged={onLeadChanged} onShowFollowUp={onShowFollowUp} />,
    },
    { icon: MapPin, label: 'Mandal', value: lead.mandal || '—' },
    { icon: MapPin, label: 'Address', value: lead.district || '—' },
    { icon: Package, label: 'Product', value: lead.product?.name || '—' },
    { icon: User, label: 'Assigned to', value: lead.assignedTo ? `${lead.assignedTo.name}${lead.assignedTo.employeeId ? ` (${lead.assignedTo.employeeId})` : ''}` : '—' },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 flex items-center gap-1.5">{client ? 'Client' : 'Lead'} <ClientBadge lead={lead} /></p>
          <h2 className="mt-0.5 text-lg font-bold text-gray-900 leading-tight break-words">{lead.name}</h2>
          <Link to={`/crm/leads/${lead._id}`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-800">
            Open lead page →
          </Link>
        </div>
        <button type="button" onClick={onClose} aria-label="Close lead" title="Back to the list (Esc)" className="w-7 h-7 flex-shrink-0 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-violet-50 px-3 py-2">
          <p className="text-[10px] text-violet-500">{page.title} done</p>
          <p className="text-base font-bold text-violet-900">{detail ? entries.length : (lead.activityCount ?? '—')}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2">
          <p className="text-[10px] text-emerald-600">Last {page.noun}</p>
          <p className="text-xs font-bold text-emerald-900 mt-1">{last ? formatDay(entryDate(detail.mainFields, last)) : (lead.lastActivityDate ? formatDay(lead.lastActivityDate) : '—')}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon size={15} className="mt-0.5 flex-shrink-0 text-violet-400" />
            <div className="min-w-0 flex-1">
              <dt className="text-[11px] text-gray-400">{label}</dt>
              <dd className="text-sm text-gray-800 break-words">{value}</dd>
            </div>
          </div>
        ))}
        {loading && <p className="flex items-center gap-1.5 text-[11px] text-violet-500"><Loader2 size={12} className="animate-spin" /> Updating…</p>}
      </dl>

      {single && last ? (
        <button type="button" onClick={() => onOpenEntry(last)} className="mt-4 btn-secondary btn-sm w-full gap-1.5">
          Open {page.noun}
        </button>
      ) : inStage && editable ? (
        <button type="button" onClick={onAdd} disabled={!detail} className="mt-4 btn-primary btn-sm w-full gap-1.5 disabled:opacity-50">
          <Plus size={14} /> Add {page.noun}
        </button>
      ) : null}
      {!editable && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-600 leading-snug">
          <Lock size={12} className="mt-px flex-shrink-0" /> View only: you can see this lead&apos;s {page.title.toLowerCase()} but not add or change them.
        </p>
      )}
      {!inStage && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 leading-snug">
          {client
            ? <>This client is no longer sent to {page.label} (CRM › Clients), so it leaves this calendar{single ? '' : ` and new ${page.noun} entries cannot be added`}.</>
            : <>This lead is no longer in the {page.label} stage, so it leaves this calendar{single ? '' : ` and new ${page.noun} entries cannot be added`}.</>}
        </p>
      )}
    </div>
  );
}
