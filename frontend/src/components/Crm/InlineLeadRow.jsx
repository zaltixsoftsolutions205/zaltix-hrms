import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { createLead } from '../../services/Leadservice';
import { updateLeadCustomFieldValue } from '../../services/Leadcustomfieldservice';
import CustomFieldInput from './CustomFields/CustomFieldInput';
import AssigneeSelect from './Assigneeselect';
import { formatPipelineStage, pipelineBadgeClass } from '../../utils/leadPipeline';

// Inline create row. City/District/State are set from the lead drawer after
// creation (keeps this row compact); pipelineStage defaults to "lead" on the
// backend, so no stage is sent from here.
const InlineLeadRow = ({ customFields, onCreated, onCancel, pinnedColumns, pinnedLeftByKey, lastPinnedKey }) => {
  const pinned = pinnedColumns || new Set();
  const leftByKey = pinnedLeftByKey || {};

  const ss = (key) =>
    pinned.has(key)
      ? { position: 'sticky', left: leftByKey[key] ?? 0, zIndex: 20, isolation: 'isolate', backgroundColor: '#faf5ff' }
      : undefined;
  const sc = (key) => (pinned.has(key) && key === lastPinnedKey ? 'border-r border-violet-200' : '');

  const [form, setForm] = useState({ name: '', phone: '', email: '', followUpDate: '', assignedTo: '' });
  const [customValues, setCustomValues] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required.');
    if (!form.phone.trim()) return toast.error('Phone is required.');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        ...(form.followUpDate ? { followUpDate: form.followUpDate } : {}),
        ...(form.assignedTo ? { assignedTo: form.assignedTo } : {}),
      };
      const lead = await createLead(payload);
      const leadId = lead._id || lead.id;

      const entries = Object.entries(customValues).filter(([, v]) => v !== undefined && v !== null && v !== '');
      for (const [fieldId, value] of entries) {
        // eslint-disable-next-line no-await-in-loop
        await updateLeadCustomFieldValue(leadId, fieldId, value);
      }

      toast.success('Lead created');
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create lead — your entries are still here.');
    } finally {
      setSaving(false);
    }
  };

  const drawerHint = 'Set in the lead details after creating';

  return (
    <motion.tr initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-violet-50/50">
      <td className={sc('name')} style={ss('name')}>
        <input className="input-field" autoFocus placeholder="Name" value={form.name} onChange={(e) => setField('name', e.target.value)} />
      </td>
      <td className={sc('phone')} style={ss('phone')}>
        <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
      </td>
      <td className={sc('email')} style={ss('email')}>
        <input className="input-field" placeholder="Email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
      </td>
      <td className={`text-xs text-violet-200 text-center ${sc('city')}`} style={ss('city')} title={drawerHint}>—</td>
      <td className={`text-xs text-violet-200 text-center ${sc('district')}`} style={ss('district')} title={drawerHint}>—</td>
      <td className={`text-xs text-violet-200 text-center ${sc('state')}`} style={ss('state')} title={drawerHint}>—</td>
      <td className={sc('followUpDate')} style={ss('followUpDate')}>
        <input type="date" className="input-field" value={form.followUpDate} onChange={(e) => setField('followUpDate', e.target.value)} />
      </td>
      <td className={sc('assignedTo')} style={ss('assignedTo')}>
        <AssigneeSelect value={form.assignedTo} onChange={(v) => setField('assignedTo', v)} />
      </td>
      <td className={sc('pipelineStage')} style={ss('pipelineStage')} title="New leads start at Lead">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap opacity-70 ${pipelineBadgeClass('lead')}`}>
          {formatPipelineStage('lead')}
        </span>
      </td>
      <td className={`text-xs text-violet-300 ${sc('visitCount')}`} style={ss('visitCount')}>0</td>
      {customFields.map((field) => (
        <td key={field._id} className={sc(field._id)} style={ss(field._id)}>
          <CustomFieldInput field={field} value={customValues[field._id]} onChange={(v) => setCustomValues((c) => ({ ...c, [field._id]: v }))} />
        </td>
      ))}
      <td className="sticky right-0 z-20" style={{ isolation: 'isolate', backgroundColor: '#faf5ff' }}>
        <div className="flex gap-1.5 justify-end">
          <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm text-xs">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={onCancel} className="btn-secondary btn-sm text-xs">Cancel</button>
        </div>
      </td>
    </motion.tr>
  );
};

export default InlineLeadRow;