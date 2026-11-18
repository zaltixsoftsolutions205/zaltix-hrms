import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../UI/Modal';
import CustomFieldOptionEditor from './CustomFieldOptionEditor';
import { createLeadCustomField, updateLeadCustomField } from '../../../services/Leadcustomfieldservice';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'single-select', label: 'Single select' },
  { value: 'multi-select', label: 'Multi select' },
  { value: 'person', label: 'Person' },
  { value: 'reference', label: 'Reference' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'currency', label: 'Currency' },
];

// Mirrors constants/leadCustomFieldEntities.js on the backend.
const ENTITIES = [
  { value: 'sales_employee', label: 'Sales Employee' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'manager', label: 'Manager' },
];

const SELECT_TYPES = ['single-select', 'multi-select'];
const emptyOption = () => ({ label: '', value: '' });

const CustomFieldCreateModal = ({ isOpen, onClose, onSaved, editingField }) => {
  const isEditing = Boolean(editingField);
  const [name, setName] = useState(editingField?.name || '');
  const [type, setType] = useState(editingField?.type || 'text');
  const [entity, setEntity] = useState(editingField?.entity || '');
  const [options, setOptions] = useState(editingField?.options?.length ? editingField.options : [emptyOption()]);
  const [required, setRequired] = useState(editingField?.required || false);
  const [saving, setSaving] = useState(false);

  // Resync form state every time the modal opens. Without this, the
  // useState initializers above only ever run once on first mount — since
  // this component stays mounted the whole time (only `isOpen` toggles),
  // editing field A, closing, then editing field B would otherwise still
  // show field A's name/options/required. Runs on open, and again if
  // `editingField` itself changes while already open.
  useEffect(() => {
    if (!isOpen) return;
    if (editingField) {
      setName(editingField.name || '');
      setType(editingField.type || 'text');
      setEntity(editingField.entity || '');
      setOptions(editingField.options?.length ? editingField.options : [emptyOption()]);
      setRequired(Boolean(editingField.required));
    } else {
      setName('');
      setType('text');
      setEntity('');
      setOptions([emptyOption()]);
      setRequired(false);
    }
  }, [isOpen, editingField]);

  const reset = () => {
    setName(''); setType('text'); setEntity(''); setOptions([emptyOption()]); setRequired(false);
  };
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Field name is required.');
    if (type === 'person' && !entity) return toast.error('Choose who this person field applies to.');

    const cleanedOptions = options
      .map((o) => ({ label: o.label.trim(), value: o.value.trim() }))
      .filter((o) => o.label && o.value);
    if (SELECT_TYPES.includes(type) && cleanedOptions.length === 0) {
      return toast.error('Add at least one option.');
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        required,
        ...(type === 'person' ? { entity } : {}),
        ...(SELECT_TYPES.includes(type) ? { options: cleanedOptions } : {}),
      };
      if (isEditing) {
        await updateLeadCustomField(editingField._id, payload);
        toast.success('Field updated');
      } else {
        await createLeadCustomField({ ...payload, type });
        toast.success('Field created');
      }
      onSaved();
      handleClose();
    } catch (err) {
      // Modal stays open, form state untouched — including on the 409
      // "option still in use" conflict from the backend.
      toast.error(err.response?.data?.message || 'Failed to save field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditing ? 'Edit Field' : 'New Field'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="input-label">Field Name *</label>
          <input className="input-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lead Priority" />
        </div>

        <div>
          <label className="input-label">
            Type {isEditing && <span className="text-violet-300 font-normal">(locked after creation)</span>}
          </label>
          <select className="input-field" value={type} disabled={isEditing} onChange={(e) => setType(e.target.value)}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {type === 'person' && (
          <div>
            <label className="input-label">Applies to</label>
            <select className="input-field" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Select…</option>
              {ENTITIES.map((e2) => (
                <option key={e2.value} value={e2.value}>{e2.label}</option>
              ))}
            </select>
          </div>
        )}

        {SELECT_TYPES.includes(type) && <CustomFieldOptionEditor options={options} onChange={setOptions} />}

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
          />
          <span className="text-sm text-gray-600">Required</span>
        </label>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Update Field' : 'Create Field'}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={handleClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

export default CustomFieldCreateModal;