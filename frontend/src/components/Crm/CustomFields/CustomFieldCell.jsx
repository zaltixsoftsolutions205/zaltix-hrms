import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import CustomFieldInput from './CustomFieldInput';
import { updateLeadCustomFieldValue } from '../../../services/Leadcustomfieldservice';

const isEmptyValue = (value) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

const renderDisplayValue = (field, value, userLookup) => {
  if (isEmptyValue(value)) return <span className="text-violet-200">—</span>;
  switch (field.type) {
    case 'checkbox':
      return value ? <span className="text-violet-600">✓</span> : <span className="text-violet-200">—</span>;
    case 'currency':
      return <span className="font-semibold text-violet-900">₹{Number(value).toLocaleString('en-IN')}</span>;
    case 'number':
      return <span>{value}</span>;
    case 'date':
      return <span className="text-xs">{new Date(value).toLocaleDateString('en-IN')}</span>;
    case 'datetime':
      return <span className="text-xs">{new Date(value).toLocaleString('en-IN')}</span>;
    case 'single-select': {
      const opt = (field.options || []).find((o) => o.value === value);
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">{opt?.label || value}</span>;
    }
    case 'multi-select':
      return (
        <div className="flex flex-wrap gap-1">
          {(Array.isArray(value) ? value : []).map((v) => {
            const opt = (field.options || []).find((o) => o.value === v);
            return (
              <span key={v} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">
                {opt?.label || v}
              </span>
            );
          })}
        </div>
      );
    case 'person':
      return <span>{userLookup?.[value]?.name || 'Unknown'}</span>;
    case 'url':
      return (
        <a href={value} target="_blank" rel="noreferrer" className="text-violet-600 hover:underline text-xs font-medium">
          Open Link
        </a>
      );
    default:
      return <span>{String(value)}</span>;
  }
};

const valuesEqual = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const arrA = Array.isArray(a) ? [...a].sort() : [];
    const arrB = Array.isArray(b) ? [...b].sort() : [];
    return arrA.length === arrB.length && arrA.every((v, i) => v === arrB[i]);
  }
  const norm = (v) => (v === undefined || v === '' ? null : v);
  return norm(a) === norm(b);
};

const CLICK_TO_SAVE_TYPES = ['checkbox', 'single-select', 'person'];
// Clearing doesn't make sense for checkbox — there's no third "empty"
// state distinct from false, and it already saves on every click anyway.
const CLEARABLE_TYPES = ['text', 'number', 'email', 'phone', 'date', 'datetime', 'single-select', 'multi-select', 'person', 'reference', 'url', 'currency'];

const CustomFieldCell = ({ field, value, userLookup, leadId, onValueChanged }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const startEdit = () => {
    if (saving) return;
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const save = async (nextValue) => {
    if (savingRef.current) return;
    if (valuesEqual(nextValue, value)) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setEditing(false);
    try {
      await updateLeadCustomFieldValue(leadId, field._id, nextValue);
      onValueChanged?.(leadId, field._id, nextValue);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save field');
      setDraft(value);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleInputChange = (nextValue) => {
    setDraft(nextValue);
    if (CLICK_TO_SAVE_TYPES.includes(field.type)) {
      save(nextValue);
    }
  };

  // Clears ONLY this Lead's value for this field via the same
  // updateLeadCustomFieldValue used for every other save — never touches
  // the field definition/column. save()'s existing equality check makes
  // this a no-op if the value is already empty, so it's safe to fire
  // regardless of current state.
  const clearValue = (e) => {
    e.stopPropagation();
    save(null);
  };

  if (!editing) {
    return (
      <div
        onClick={startEdit}
        onDoubleClick={startEdit}
        className="min-h-[1.4rem] cursor-text"
        title={saving ? undefined : 'Click to edit'}
      >
        {saving ? <span className="text-violet-300 text-xs italic">Saving…</span> : renderDisplayValue(field, value, userLookup)}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1"
      onBlur={(e) => {
        if (CLICK_TO_SAVE_TYPES.includes(field.type)) return;
        if (e.currentTarget.contains(e.relatedTarget)) return;
        save(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !CLICK_TO_SAVE_TYPES.includes(field.type)) {
          e.preventDefault();
          save(draft);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <div className="flex-1 min-w-0">
        <CustomFieldInput field={field} value={draft} onChange={handleInputChange} autoFocus />
      </div>

      {CLEARABLE_TYPES.includes(field.type) && (
        <button
          type="button"
          title="Clear value"
          // Prevents the browser from moving focus off the input on
          // mousedown, which would otherwise fire the wrapper's onBlur
          // (→ a save with the stale draft) a moment before onClick runs
          // the actual clear — i.e. two writes for one click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearValue}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-violet-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
};

export default CustomFieldCell;