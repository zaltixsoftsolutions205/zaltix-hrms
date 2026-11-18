import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '../../utils/api';
import Modal from '../UI/Modal';
import { stageLabel } from '../../hooks/useGlobalTableColumns';
import FollowUpInput from '../GlobalTable/FollowUpInput';
import { assigneeLabel } from '../../services/Userservice';
import { followUpInput, followUpToApi } from '../../utils/followUp';

/**
 * Moving a lead INTO Visit, Demo, Data Update, Registration or Feedback: the
 * stage pages place leads on their calendar by follow-up date, so this popup
 * asks for "Assign To" and "Next Follow-up" (prefilled when already set) and
 * saves them together with the stage (PUT /leads/:id). The backend refuses the
 * stage change without a follow-up date (code FOLLOW_UP_REQUIRED).
 *
 * lead: { _id, name, pipelineStage, assignedTo, followUpDate }   to: target stage
 * onSaved(updatedLead)   onCancel()
 */

export const FOLLOW_UP_STAGES = ['visit', 'demo', 'data-update', 'registration', 'feedback'];
export const needsFollowUpDialog = (to) => FOLLOW_UP_STAGES.includes(to);

const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';

export default function StageChangeDialog({ lead, from, to, onSaved, onCancel }) {
  const [assignees, setAssignees] = useState(null);
  const [assignedTo, setAssignedTo] = useState(idOf(lead.assignedTo));
  const [followUp, setFollowUp] = useState(followUpInput(lead.followUpDate));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/leads/${lead._id}/assignees`)
      .then(({ data }) => { if (active) setAssignees(data.assignees || []); })
      .catch(() => { if (active) setAssignees([]); });
    return () => { active = false; };
  }, [lead._id]);

  const current = lead.assignedTo && typeof lead.assignedTo === 'object' ? lead.assignedTo : null;
  const options = assignees
    ? (current && !assignees.some((a) => String(a._id) === String(current._id)) ? [current, ...assignees] : assignees)
    : [];

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!assignedTo) errs.assignedTo = 'Choose who follows this lead';
    let followUpDate = '';
    try { followUpDate = followUpToApi(followUp); } catch (err) { errs.followUp = err.message; }
    if (!followUpDate && !errs.followUp) errs.followUp = 'Set the next follow-up date';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/leads/${lead._id}`, {
        pipelineStage: to,
        expectedStage: from,
        assignedTo,
        followUpDate,
      });
      toast.success(`Moved to ${stageLabel(to)}`);
      onSaved(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to change the stage');
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={saving ? () => {} : onCancel} title={`Move to ${stageLabel(to)}`} size="sm">
      <form onSubmit={save} className="space-y-4" noValidate>
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">{lead.name}</strong> moves from <strong>{stageLabel(from)}</strong> to{' '}
          <strong>{stageLabel(to)}</strong>. Who follows it, and when is the next follow-up?
        </p>
        <div>
          <label className="block text-xs font-medium text-violet-700 mb-1" htmlFor="stage-assignee">Assign To *</label>
          {assignees === null ? (
            <p className="flex items-center gap-2 text-xs text-violet-500"><Loader2 size={13} className="animate-spin" /> Loading employees…</p>
          ) : (
            <select id="stage-assignee" className={`input-field w-full ${errors.assignedTo ? 'border-red-500' : ''}`} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Select an employee</option>
              {options.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.role ? assigneeLabel(a) : `${a.name} (current, not a sales role)`}
                </option>
              ))}
            </select>
          )}
          {errors.assignedTo && <p role="alert" className="mt-1 text-[11px] text-red-600">{errors.assignedTo}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-violet-700 mb-1" htmlFor="stage-followup">Next Follow-up *</label>
          <FollowUpInput idPrefix="stage-followup" value={followUp} onChange={setFollowUp} invalid={Boolean(errors.followUp)} label="Next follow-up" />
          {errors.followUp && <p role="alert" className="mt-1 text-[11px] text-red-600">{errors.followUp}</p>}
          <p className="mt-1 text-[11px] text-gray-400">The lead appears on the {stageLabel(to)} calendar on this date, at this time when you set one (otherwise as all day).</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary btn-sm gap-1.5" disabled={saving || assignees === null}>
            {saving && <Loader2 size={14} className="animate-spin" />} Move to {stageLabel(to)}
          </button>
        </div>
      </form>
    </Modal>
  );
}
