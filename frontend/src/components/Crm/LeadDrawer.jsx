import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Drawer from './Drawer';
import Badge from '../UI/Badge';
import CustomFieldInput from './CustomFields/CustomFieldInput';
import AssigneeSelect from './Assigneeselect';
import { formatDate, formatDateTime } from '../../utils/helpers';
import { PIPELINE_STAGES, formatPipelineStage } from '../../utils/leadPipeline';
import { getLead, createLead, updateLead, updateLeadStatus, addLeadActivity } from '../../services/Leadservice';
import { getLeadCustomFieldValues, updateLeadCustomFieldValue } from '../../services/Leadcustomfieldservice';

const STATUS_OPTIONS = ['new', 'interested', 'not-interested', 'converted'];
const emptyForm = () => ({
  name: '', phone: '', email: '', city: '', district: '', state: '',
  followUpDate: '', assignedTo: '', pipelineStage: 'lead',
});

const LeadDrawer = ({ mode = 'edit', leadId, isOpen, onClose, customFields, onSaved }) => {
  const isCreate = mode === 'create';

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(!isCreate);
  const [form, setForm] = useState(emptyForm());
  const [customValues, setCustomValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: 'call', note: '' });

  useEffect(() => {
    if (!isOpen) return undefined;

    if (isCreate) {
      setLead(null);
      setForm(emptyForm());
      setCustomValues({});
      setLoading(false);
      return undefined;
    }

    if (!leadId) return undefined;
    let active = true;
    setLoading(true);
    // GET /leads/:id → lead + pipelineStage + visitCount + visits[]
    Promise.all([getLead(leadId), getLeadCustomFieldValues(leadId)])
      .then(([leadRes, values]) => {
        if (!active) return;
        setLead(leadRes);
        setForm({
          name: leadRes.name || '',
          phone: leadRes.phone || '',
          email: leadRes.email || '',
          city: leadRes.city || '',
          district: leadRes.district || '',
          state: leadRes.state || '',
          followUpDate: leadRes.followUpDate ? String(leadRes.followUpDate).slice(0, 10) : '',
          assignedTo: leadRes.assignedTo?._id || leadRes.assignedTo || '',
          pipelineStage: leadRes.pipelineStage || 'lead',
        });
        const cv = {};
        (values || []).forEach((v) => { cv[v.field._id] = v.value; });
        setCustomValues(cv);
      })
      .catch(() => toast.error('Failed to load lead details'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, isCreate, leadId]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return toast.error('Name and phone are required.');
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), phone: form.phone.trim() };
      const created = await createLead(payload);
      const newLeadId = created._id || created.id;
      const entries = Object.entries(customValues).filter(([, v]) => v !== undefined && v !== null && v !== '');
      for (const [fieldId, value] of entries) {
        // eslint-disable-next-line no-await-in-loop
        await updateLeadCustomFieldValue(newLeadId, fieldId, value);
      }
      toast.success('Lead created');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  };

  // Merge instead of replace: the update/status/activity responses don't
  // carry visits[], and replacing would blank the Visits section.
  const saveStandard = async () => {
    setSaving(true);
    try {
      const updated = await updateLead(leadId, form);
      setLead((prev) => ({ ...prev, ...updated }));
      toast.success('Lead updated');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const handleCustomFieldChange = async (fieldId, value) => {
    setCustomValues((c) => ({ ...c, [fieldId]: value }));
    if (isCreate) return;
    try {
      await updateLeadCustomFieldValue(leadId, fieldId, value);
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save field');
    }
  };

  const changeStatus = async (status) => {
    try {
      const updated = await updateLeadStatus(leadId, status);
      setLead((prev) => ({ ...prev, ...updated }));
      toast.success('Status updated');
      onSaved?.();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const submitActivity = async (e) => {
    e.preventDefault();
    if (!activityForm.note.trim()) return toast.error('Enter a note.');
    try {
      const updated = await addLeadActivity(leadId, activityForm);
      setLead((prev) => ({ ...prev, ...updated }));
      setActivityForm({ type: 'call', note: '' });
      toast.success('Activity logged');
    } catch {
      toast.error('Failed to log activity');
    }
  };

  const title = isCreate ? 'Create Lead' : (lead?.name || 'Lead');
  const subtitle = !isCreate && lead ? `Added ${formatDate(lead.createdAt)}` : undefined;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const fieldsBody = (
    <>
      <section>
        <h4 className="font-bold text-violet-900 mb-3 text-sm">Standard Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="input-label">Name{isCreate && ' *'}</label>
            <input className="input-field" required={isCreate} value={form.name} onChange={set('name')} />
          </div>
          <div>
            <label className="input-label">Phone{isCreate && ' *'}</label>
            <input className="input-field" required={isCreate} value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="input-label">Email</label>
            <input type="email" className="input-field" value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label className="input-label">City</label>
            <input className="input-field" value={form.city} onChange={set('city')} />
          </div>
          <div>
            <label className="input-label">District</label>
            <input className="input-field" value={form.district} onChange={set('district')} />
          </div>
          <div>
            <label className="input-label">State</label>
            <input className="input-field" value={form.state} onChange={set('state')} />
          </div>
          <div>
            <label className="input-label">Next Follow-up</label>
            <input type="date" className="input-field" value={form.followUpDate} onChange={set('followUpDate')} />
          </div>
          <div className="sm:col-span-2">
            <label className="input-label">Assign To</label>
            <AssigneeSelect value={form.assignedTo} onChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))} />
          </div>
        </div>
      </section>

      {customFields.length > 0 && (
        <section>
          <h4 className="font-bold text-violet-900 mb-3 text-sm">Custom Fields</h4>
          <div className="grid grid-cols-2 gap-3">
            {customFields.map((field) => (
              <div key={field._id}>
                <label className="input-label">{field.name}{field.required && ' *'}</label>
                <CustomFieldInput field={field} value={customValues[field._id]} onChange={(v) => handleCustomFieldChange(field._id, v)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );

  const footer = !isCreate && lead ? (
    <div className="flex gap-3">
      <button type="button" onClick={saveStandard} disabled={saving} className="btn-primary flex-1">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
    </div>
  ) : undefined;

  const visits = lead?.visits || [];

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} footer={footer}>
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-violet-100/70 rounded-lg animate-pulse" />)}
        </div>
      ) : isCreate ? (
        <form onSubmit={handleCreateSubmit} className="space-y-6">
          {fieldsBody}
          <button type="submit" disabled={saving} className="btn-primary btn-sm">
            {saving ? 'Creating…' : 'Create Lead'}
          </button>
        </form>
      ) : lead ? (
        <div className="space-y-6">
          {/* Lead STATUS — separate from pipeline stage */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={lead.status} />
            {STATUS_OPTIONS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => changeStatus(s)}
                className={`${lead.status === s ? 'filter-pill-active' : 'filter-pill-inactive'} capitalize`}
              >
                {s.replace(/-/g, ' ')}
              </button>
            ))}
          </div>

          {/* PIPELINE STAGE — form.pipelineStage, sent on Save */}
          <section>
            <h4 className="font-bold text-violet-900 mb-3 text-sm">Pipeline Stage</h4>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STAGES.map((stage) => (
                <button
                  type="button"
                  key={stage}
                  onClick={() => setForm((f) => ({ ...f, pipelineStage: stage }))}
                  className={form.pipelineStage === stage ? 'filter-pill-active' : 'filter-pill-inactive'}
                >
                  {formatPipelineStage(stage)}
                </button>
              ))}
            </div>
          </section>

          {fieldsBody}

          <section>
            <h4 className="font-bold text-violet-900 mb-3 text-sm">Activity Timeline</h4>
            <form onSubmit={submitActivity} className="flex flex-col sm:flex-row gap-2">
              <select className="input-field sm:w-auto" value={activityForm.type} onChange={(e) => setActivityForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="follow-up">Follow-up</option>
                <option value="note">Note</option>
              </select>
              <input className="input-field flex-1" placeholder="Log activity note…" value={activityForm.note} onChange={(e) => setActivityForm((f) => ({ ...f, note: e.target.value }))} />
              <button type="submit" className="btn-primary">Add</button>
            </form>
            {(!lead.activities || lead.activities.length === 0) ? (
              <p className="text-sm text-violet-400 text-center py-4">No activities logged yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto mt-3">
                {[...lead.activities].reverse().map((act, i) => (
                  <div key={i} className="p-3 bg-violet-50 rounded-xl">
                    <p className="text-sm font-medium text-violet-900">{act.note}</p>
                    <p className="text-xs text-violet-400 mt-0.5">{formatDateTime(act.date)} · {act.by?.name || 'You'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* VISITS — full list from GET /leads/:id (lead.visits) */}
          <section>
            <h4 className="font-bold text-violet-900 mb-3 text-sm">
              Visits <span className="text-violet-400 font-normal">({lead.visitCount ?? visits.length})</span>
            </h4>
            {visits.length === 0 ? (
              <p className="text-sm text-violet-400 text-center py-4">No visits recorded yet</p>
            ) : (
              <div className="space-y-2">
                {visits.map((v, i) => (
                  <div key={v._id || i} className="p-3 bg-violet-50 rounded-xl">
                    <p className="text-sm font-semibold text-violet-900">Visit {visits.length - i}</p>
                    <p className="text-xs text-violet-500 mt-0.5">
                      {v.visitDate ? formatDate(v.visitDate) : '—'}
                    </p>
                    <p className="text-xs text-violet-500 mt-0.5">Assigned: {v.assignedTo?.name || '—'}</p>
                    <p className="text-xs text-violet-400 mt-0.5">Created by: {v.createdBy?.name || '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
};

export default LeadDrawer;