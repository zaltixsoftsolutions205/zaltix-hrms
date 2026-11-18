import { useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import LeadNameCell from './LeadNameCell';
import CustomFieldCell from './CustomFields/CustomFieldCell';
import AssigneeSelect from './Assigneeselect';
import { formatDate } from '../../utils/helpers';
import { formatPipelineStage, pipelineBadgeClass } from '../../utils/leadPipeline';
import { updateLead } from '../../services/Leadservice';

const PINNED_BG = '#ffffff';
const PINNED_BG_HOVER = '#f5f3ff'; // violet-50, fully opaque

const pinnedCellStyle = (key, pinnedColumns, pinnedLeftByKey, hovered) =>
  pinnedColumns?.has(key)
    ? {
        style: {
          position: 'sticky',
          left: pinnedLeftByKey?.[key] ?? 0,
          zIndex: 20,
          isolation: 'isolate',
          backgroundColor: hovered ? PINNED_BG_HOVER : PINNED_BG,
        },
      }
    : {};

const pinnedCellClass = (key, pinnedColumns, lastPinnedKey) =>
  pinnedColumns?.has(key) && key === lastPinnedKey ? 'border-r border-violet-200' : '';

const InlineTextCell = ({ lead, fieldKey, inputType, displayValue, onLeadUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const currentValue = () =>
    fieldKey === 'followUpDate'
      ? (lead.followUpDate ? String(lead.followUpDate).slice(0, 10) : '')
      : (lead[fieldKey] ?? '');

  const startEdit = () => {
    if (saving) return;
    setDraft(currentValue());
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    if (draft === currentValue()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setEditing(false);
    try {
      const updated = await updateLead(lead._id, { [fieldKey]: draft });
      onLeadUpdated?.(updated);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div onClick={startEdit} onDoubleClick={startEdit} className="min-h-[1.4rem] cursor-text">
        {saving ? <span className="text-violet-300 text-xs italic">Saving…</span> : (displayValue ?? <span className="text-violet-200">—</span>)}
      </div>
    );
  }

  return (
    <input
      autoFocus
      type={inputType}
      className="input-field !py-1 !text-xs w-full"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
    />
  );
};

const InlineAssigneeCell = ({ lead, assigneeName, onLeadUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (value) => {
    // Lead.assignedTo is required on the backend; choosing the empty
    // placeholder just leaves the current assignee in place.
    if (!value || value === (lead.assignedTo?._id || lead.assignedTo)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateLead(lead._id, { assignedTo: value });
      onLeadUpdated?.(updated);
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div onClick={() => !saving && setEditing(true)} className="min-h-[1.4rem] cursor-pointer">
        {saving ? <span className="text-violet-300 text-xs italic">Saving…</span> : (assigneeName || <span className="text-violet-200">—</span>)}
      </div>
    );
  }

  return <AssigneeSelect value={lead.assignedTo?._id || lead.assignedTo || ''} onChange={save} />;
};

const dash = <span className="text-violet-200">—</span>;

const LeadRow = ({
  lead, customFields, values, userLookup, onOpen,
  pinnedColumns, pinnedLeftByKey, lastPinnedKey,
  onValueChanged, onLeadUpdated, onDeleteRequest,
}) => {
  const assignee = userLookup?.[lead.assignedTo?._id || lead.assignedTo];
  const [hovered, setHovered] = useState(false);
  const pinStyle = (key) => pinnedCellStyle(key, pinnedColumns, pinnedLeftByKey, hovered);
  const pinClass = (key) => pinnedCellClass(key, pinnedColumns, lastPinnedKey);
  const stage = lead.pipelineStage || 'lead';

  return (
    <tr
      className="hover:bg-violet-50/40 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Column order matches STANDARD_COLUMNS in Leadtable.jsx */}
      <td className={pinClass('name')} {...pinStyle('name')}>
        <LeadNameCell lead={lead} onOpen={onOpen} />
      </td>

      <td className={pinClass('phone')} {...pinStyle('phone')}>
        <InlineTextCell lead={lead} fieldKey="phone" inputType="tel" displayValue={lead.phone} onLeadUpdated={onLeadUpdated} />
      </td>

      <td className={`text-violet-500 ${pinClass('email')}`} {...pinStyle('email')}>
        <InlineTextCell lead={lead} fieldKey="email" inputType="email" displayValue={lead.email} onLeadUpdated={onLeadUpdated} />
      </td>

      {/* City / District / State: display-only here. They are edited in the
          lead drawer so the State → District → City dependency is respected. */}
      <td className={`text-xs ${pinClass('city')}`} {...pinStyle('city')}>{lead.city || dash}</td>
      <td className={`text-xs ${pinClass('district')}`} {...pinStyle('district')}>{lead.district || dash}</td>
      <td className={`text-xs ${pinClass('state')}`} {...pinStyle('state')}>{lead.state || dash}</td>

      <td className={`text-xs ${pinClass('followUpDate')}`} {...pinStyle('followUpDate')}>
        <InlineTextCell
          lead={lead}
          fieldKey="followUpDate"
          inputType="date"
          displayValue={lead.followUpDate ? formatDate(lead.followUpDate) : null}
          onLeadUpdated={onLeadUpdated}
        />
      </td>

      <td className={`text-xs ${pinClass('assignedTo')}`} {...pinStyle('assignedTo')}>
        <InlineAssigneeCell lead={lead} assigneeName={assignee?.name} onLeadUpdated={onLeadUpdated} />
      </td>

      <td className={pinClass('pipelineStage')} {...pinStyle('pipelineStage')}>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${pipelineBadgeClass(stage)}`}>
          {formatPipelineStage(stage)}
        </span>
      </td>

      <td className={`text-xs ${pinClass('visitCount')}`} {...pinStyle('visitCount')}>
        {lead.visitCount ?? 0}
      </td>

      {customFields.map((field) => (
        <td key={field._id} className={pinClass(field._id)} {...pinStyle(field._id)}>
          <CustomFieldCell field={field} value={values[field._id]} userLookup={userLookup} leadId={lead._id} onValueChanged={onValueChanged} />
        </td>
      ))}

      {/* Row delete. The flex wrapper is a div INSIDE the td: putting
          display:flex on the td itself breaks table-cell layout. */}
      <td className="sticky right-0 z-20" style={{ isolation: 'isolate', backgroundColor: hovered ? PINNED_BG_HOVER : PINNED_BG }}>
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => onDeleteRequest?.(lead)}
            title="Delete lead"
            className="w-6 h-6 flex items-center justify-center rounded text-violet-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default LeadRow;