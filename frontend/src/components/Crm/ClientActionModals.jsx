import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import Modal from '../UI/Modal';
import { SearchableSelect } from '../UI/Assignmentselects';
import {
  ACTIVITY_STAGES, REWORK_STAGES, stageLabel,
} from '../../hooks/useGlobalTableColumns';
import {
  convertClientToLost, getLeadAssignees, reworkLead, sendClientToActivity,
} from '../../services/Leadservice';
import { followUpToApi, joinFollowUp } from '../../utils/followUp';

/**
 * The three CRM › Clients actions, shared by the Clients tab and the lead page.
 *   SendToActivityModal  client -> an activity page (Visit, Demo, ...) + assignee + follow-up
 *   ConvertLostModal     client -> Lead Lost (reason required)
 *   ReworkModal          lost lead -> back into the pipeline at a chosen stage
 * Each calls onDone(updatedLead) after the server accepted the change.
 */

const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';

/** Sales employees who may hold this lead; starts on the current holder. */
function useAssignees(lead) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setList(null);
    getLeadAssignees(lead._id)
      .then((rows) => { if (!cancelled) setList(rows); })
      .catch((err) => { if (!cancelled) { setList([]); toast.error(err.message); } });
    return () => { cancelled = true; };
  }, [lead._id]);

  const options = useMemo(() => {
    const rows = list || [];
    const current = lead.assignedTo && typeof lead.assignedTo === 'object' ? lead.assignedTo : null;
    // Keep the current holder selectable even if the list does not include them.
    const withCurrent = current && !rows.some((u) => String(u._id) === String(current._id)) ? [current, ...rows] : rows;
    return withCurrent.map((u) => ({
      id: String(u._id),
      label: u.name || 'Unnamed',
      sublabel: [u.employeeId, u.role].filter(Boolean).join(' · '),
    }));
  }, [list, lead.assignedTo]);

  return { options, loading: list === null };
}

function FollowUpInput({ day, time, onDay, onTime, required, disabled }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        Next follow-up {required ? <span className="text-red-500">*</span> : <span className="font-normal text-gray-400">(optional)</span>}
      </label>
      <div className="flex gap-2">
        <input type="date" className="input-field flex-1" value={day} disabled={disabled} onChange={(e) => onDay(e.target.value)} />
        <input type="time" className="input-field w-32" value={time} disabled={disabled || !day} onChange={(e) => onTime(e.target.value)} title="Optional: leave empty for all day" />
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Places the lead on that page&apos;s calendar. No time: all day.</p>
    </div>
  );
}

function Footer({ onCancel, busy, label, danger = false, disabled = false }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary btn-sm">Cancel</button>
      <button
        type="submit"
        disabled={busy || disabled}
        className={`btn-sm gap-1.5 disabled:opacity-50 ${danger ? 'rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700' : 'btn-primary'}`}
      >
        {busy && <Loader2 size={14} className="animate-spin" />} {label}
      </button>
    </div>
  );
}

const readFollowUp = (day, time) => followUpToApi(joinFollowUp(day, time)); // throws on bad input

/* ----------------------------- Send to activity ----------------------------- */

export function SendToActivityModal({ lead, onClose, onDone }) {
  const [stage, setStage] = useState(lead.wonActivityStage || 'visit');
  const [assignedTo, setAssignedTo] = useState(idOf(lead.assignedTo));
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const assignees = useAssignees(lead);

  const submit = async (e) => {
    e.preventDefault();
    let followUpDate;
    try {
      followUpDate = readFollowUp(day, time);
    } catch (err) {
      toast.error(err.message);
      return;
    }
    if (!followUpDate) { toast.error('Set the next follow-up date'); return; }
    if (!assignedTo) { toast.error('Choose who works on this client'); return; }
    setBusy(true);
    try {
      const updated = await sendClientToActivity(lead._id, { stage, assignedTo, followUpDate, note });
      toast.success(`${lead.name} sent to ${stageLabel(stage)}`);
      onDone?.(updated);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title={`Send "${lead.name}" to an activity`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500">
          The lead stays <strong>Lead Won</strong>. It shows on the chosen activity page, where the assigned employee records the work.
        </p>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Activity <span className="text-red-500">*</span></label>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                disabled={busy}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${stage === s
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-violet-200 text-violet-700 hover:bg-violet-50'}`}
              >
                {stageLabel(s)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Assign to <span className="text-red-500">*</span></label>
          <SearchableSelect
            options={assignees.options}
            value={assignedTo}
            onChange={setAssignedTo}
            loading={assignees.loading}
            placeholder="Choose a sales employee"
            loadingMessage="Loading employees..."
            emptyMessage="No employees for this lead's Mandal"
          />
          <p className="mt-1 text-[11px] text-gray-400">This employee becomes the lead&apos;s owner.</p>
        </div>
        <FollowUpInput day={day} time={time} onDay={setDay} onTime={setTime} required disabled={busy} />
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Note <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea className="input-field" rows={2} maxLength={500} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} placeholder="What should be done?" />
        </div>
        <Footer onCancel={onClose} busy={busy} label="Send" />
      </form>
    </Modal>
  );
}

/* ------------------------------ Convert to lost ----------------------------- */

export function ConvertLostModal({ lead, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { toast.error('Give a reason'); return; }
    setBusy(true);
    try {
      const updated = await convertClientToLost(lead._id, reason.trim());
      toast.success(`${lead.name} moved to Lost Clients`);
      onDone?.(updated);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title={`Convert "${lead.name}" to Lead Lost`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500">
          Use this when the client has dropped. The lead moves to <strong>Lost Clients</strong>, leaves any activity page, and its records become read-only.
          It can be reworked later if the client comes back.
        </p>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
          <textarea className="input-field" rows={3} maxLength={500} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} placeholder="Why was the client lost?" autoFocus />
        </div>
        <Footer onCancel={onClose} busy={busy} label="Convert to Lost" danger disabled={!reason.trim()} />
      </form>
    </Modal>
  );
}

/* ---------------------------------- Rework --------------------------------- */

export function ReworkModal({ lead, onClose, onDone }) {
  const [toStage, setToStage] = useState('lead');
  const [assignedTo, setAssignedTo] = useState(idOf(lead.assignedTo));
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const assignees = useAssignees(lead);
  const toWon = toStage === 'lead-won';
  // Lead and Lead Won are not on an activity calendar, so no follow-up is needed.
  const needsFollowUp = toStage !== 'lead' && !toWon;

  const submit = async (e) => {
    e.preventDefault();
    let followUpDate;
    try {
      followUpDate = readFollowUp(day, time);
    } catch (err) {
      toast.error(err.message);
      return;
    }
    if (needsFollowUp && !followUpDate) { toast.error(`Set the next follow-up date to start at ${stageLabel(toStage)}`); return; }
    setBusy(true);
    try {
      const updated = await reworkLead(lead._id, {
        toStage,
        assignedTo: assignedTo || undefined,
        followUpDate: followUpDate || undefined,
        reason: reason.trim(),
      });
      toast.success(toWon ? `${lead.name} is a client again (Lead Won)` : `${lead.name} is back in the pipeline (${stageLabel(toStage)})`);
      onDone?.(updated);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title={`Rework "${lead.name}"`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500">
          The lead leaves Lost Clients and goes back into the Leads pipeline, or straight to <strong>Lead Won</strong> if the client is back.
          Its earlier records stay as history.
        </p>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Start at stage <span className="text-red-500">*</span></label>
          <div className="flex flex-wrap gap-1.5">
            {REWORK_STAGES.map((s) => {
              const won = s === 'lead-won';
              const selected = toStage === s;
              const tone = selected
                ? (won ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-violet-600 border-violet-600 text-white')
                : (won ? 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'bg-white border-violet-200 text-violet-700 hover:bg-violet-50');
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setToStage(s)}
                  disabled={busy}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${tone}`}
                >
                  {stageLabel(s)}
                </button>
              );
            })}
          </div>
          {toWon && (
            <p className="mt-1.5 text-[11px] text-emerald-700">
              The lead becomes a client again and shows in Won Clients, where it can be sent to an activity.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Assign to</label>
          <SearchableSelect
            options={assignees.options}
            value={assignedTo}
            onChange={setAssignedTo}
            loading={assignees.loading}
            placeholder="Keep the current owner"
            loadingMessage="Loading employees..."
            emptyMessage="No employees for this lead's Mandal"
          />
        </div>
        <FollowUpInput day={day} time={time} onDay={setDay} onTime={setTime} required={needsFollowUp} disabled={busy} />
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Reason <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea className="input-field" rows={2} maxLength={500} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client came back" />
        </div>
        <Footer onCancel={onClose} busy={busy} label="Rework" />
      </form>
    </Modal>
  );
}
