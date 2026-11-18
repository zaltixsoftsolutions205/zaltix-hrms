import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  ACTIVITY_FIELD_TYPES,
  APPLIES_TO_OPTIONS,
  CREATABLE_FIELD_TYPES,
  NOT_REQUIRABLE_FIELD_TYPES,
  SELECT_FIELD_TYPES,
} from './fieldTypes';

/**
 * Add / edit a Global Table field.
 *
 * What the backend accepts (GlobalTableField + globalTableService):
 *   key, label, type, description, required, options (select types),
 *   config: formula -> { expression }, person -> { role } (optional).
 *   Other types must send no config.
 * Types come from the shared registry (fieldTypes.js). `reference` is not offered for NEW fields:
 * the backend has no reference-target configuration, so it would have no picker. Existing reference
 * fields can still be renamed.
 *
 * Formula expressions are validated by the backend when saved (syntax, known keys, numeric
 * fields only, no formula-on-formula); its message is shown here. Nothing is parsed or evaluated
 * in the browser.
 *
 * Immutable after creation (the backend rejects changes): key, type.
 * checkbox and formula fields cannot be required.
 *
 * "Show in" (appliesTo): Lead = a column of this table; Visits / Demos / Data Update /
 * Registration / Feedback = a field of that activity's form for this table's leads.
 * Can be changed later. Activity fields cannot be formula or person fields; in the lead table
 * they are read-only columns showing the latest entry's value.
 */

const KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;

const slugify = (label) => {
  const s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  return /^[0-9]/.test(s) ? `f_${s}`.slice(0, 50) : s;
};

const labelClass = 'block text-xs font-medium text-violet-700 mb-1';

const GlobalTableFieldModal = ({
  mode,
  field,
  onSubmit,
  onClose,
  roleOptions = [], // role names of known users, suggested for person fields
  numericFieldKeys = [], // keys a formula may reference
  types = CREATABLE_FIELD_TYPES, // the visit form leaves out formula
}) => {
  const isEdit = mode === 'edit';
  const [label, setLabel] = useState(field?.label || '');
  const [key, setKey] = useState(field?.key || '');
  const [keyTouched, setKeyTouched] = useState(isEdit);
  const [type, setType] = useState(field?.type || 'text');
  const [appliesTo, setAppliesTo] = useState(field?.appliesTo || 'lead');
  const forActivity = appliesTo !== 'lead';
  const typeChoices = forActivity && !isEdit ? ACTIVITY_FIELD_TYPES : types;
  const [description, setDescription] = useState(field?.description || '');
  const [required, setRequired] = useState(Boolean(field?.required));
  const [options, setOptions] = useState(
    (field?.options || []).map((o) => ({ label: o.label, value: o.value }))
  );
  const [expression, setExpression] = useState(field?.config?.expression || '');
  const [role, setRole] = useState(field?.config?.role || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { message, errors? }
  const labelRef = useRef(null);

  const isSelect = SELECT_FIELD_TYPES.includes(type);
  const isFormula = type === 'formula';
  const isPerson = type === 'person';
  const canRequire = !NOT_REQUIRABLE_FIELD_TYPES.includes(type);
  const typeLocked = isEdit;

  useEffect(() => {
    labelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const onLabelChange = (v) => {
    setLabel(v);
    if (!keyTouched) setKey(slugify(v));
  };

  const setOptionLabel = (i, v) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, label: v } : o)));

  const submit = async (e) => {
    e.preventDefault();
    const cleanLabel = label.trim();
    if (!cleanLabel) return setError({ message: 'Field name is required' });
    if (!isEdit && !KEY_RE.test(key)) {
      return setError({ message: 'Field key must be lowercase letters, numbers and "_", starting with a letter' });
    }

    let cleanOptions;
    if (isSelect) {
      cleanOptions = options
        .map((o) => ({ label: o.label.trim(), value: (o.value ?? o.label).trim() }))
        .filter((o) => o.label && o.value);
      if (cleanOptions.length === 0) return setError({ message: 'Add at least one option' });
      if (new Set(cleanOptions.map((o) => o.value)).size !== cleanOptions.length) {
        return setError({ message: 'Option names must be unique' });
      }
    }

    if (forActivity && !ACTIVITY_FIELD_TYPES.some((t) => t.value === type)) {
      return setError({ message: `${type} fields can only be shown in the lead table` });
    }

    const cleanExpression = expression.trim();
    if (isFormula && !cleanExpression) return setError({ message: 'Enter a formula expression' });
    const cleanRole = role.trim();

    const common = {
      label: cleanLabel,
      description: description.trim(),
      ...(canRequire ? { required } : {}),
      ...(isSelect ? { options: cleanOptions } : {}),
    };

    let payload;
    if (isEdit) {
      payload = { ...common };
      if (appliesTo !== (field?.appliesTo || 'lead')) payload.appliesTo = appliesTo;
      // config is only re-validated by the backend when it is sent, so send it only when changed
      if (isFormula && cleanExpression !== (field?.config?.expression || '')) {
        payload.config = { expression: cleanExpression };
      }
      if (isPerson && cleanRole !== (field?.config?.role || '')) {
        payload.config = cleanRole ? { role: cleanRole } : {};
      }
    } else {
      payload = { key, type, appliesTo, ...common };
      if (isFormula) payload.config = { expression: cleanExpression };
      if (isPerson && cleanRole) payload.config = { role: cleanRole };
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit(payload); // parent closes the modal on success
    } catch (err) {
      setError({ message: err?.message || 'Something went wrong', errors: err?.errors });
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => !busy && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="gt-field-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-auto bg-white rounded-xl border border-violet-100 shadow-xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="gt-field-title" className="text-sm font-semibold text-violet-900">
            {isEdit ? 'Edit Field' : 'Add Field'}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-violet-400 hover:text-violet-700">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="gt-field-label">Field Name</label>
            <input id="gt-field-label" ref={labelRef} className="input-field w-full" value={label} maxLength={100} onChange={(e) => onLabelChange(e.target.value)} />
          </div>

          <div>
            <label className={labelClass} htmlFor="gt-field-key">Field Key</label>
            <input
              id="gt-field-key"
              className="input-field w-full font-mono text-xs disabled:opacity-60"
              value={key}
              disabled={isEdit}
              maxLength={50}
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }}
            />
            <p className="mt-1 text-[11px] text-violet-400">
              {isEdit ? 'The key cannot be changed after creation.' : 'Lowercase, used by imports and formulas. Cannot be changed afterwards.'}
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="gt-field-applies">Show in</label>
            <select
              id="gt-field-applies"
              className="input-field w-full disabled:opacity-60"
              value={appliesTo}
              onChange={(e) => {
                const next = e.target.value;
                setAppliesTo(next);
                // activity forms have no formula / person fields (a new field switches to Text)
                if (!isEdit && next !== 'lead' && !ACTIVITY_FIELD_TYPES.some((t) => t.value === type)) setType('text');
              }}
            >
              {APPLIES_TO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-violet-400">
              {forActivity
                ? "Filled in that form for the leads of this table. Here it is a read-only column with the latest entry's value."
                : 'An editable column of this lead table.'}
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="gt-field-type">Type</label>
            {isEdit && !typeChoices.some((t) => t.value === type) ? (
              <input id="gt-field-type" className="input-field w-full" value={type} disabled />
            ) : (
              <select
                id="gt-field-type"
                className="input-field w-full disabled:opacity-60"
                value={type}
                disabled={typeLocked}
                onChange={(e) => setType(e.target.value)}
              >
                {typeChoices.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            )}
            {isEdit && <p className="mt-1 text-[11px] text-violet-400">The type cannot be changed after creation.</p>}
          </div>

          {isSelect && (
            <div>
              <span className={labelClass}>Options</span>
              <div className="space-y-1.5">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      className="input-field !py-1 !text-xs flex-1"
                      value={o.label}
                      maxLength={100}
                      aria-label={`Option ${i + 1}`}
                      onChange={(e) => setOptionLabel(i, e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove option ${i + 1}`}
                      onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                      className="w-6 h-6 flex items-center justify-center rounded text-violet-300 hover:text-red-500 hover:bg-red-50"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, { label: '', value: null }])}
                className="mt-2 inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
              >
                <Plus size={13} /> Add option
              </button>
              {isEdit && (
                <p className="mt-1 text-[11px] text-violet-400">Options that are already used by saved values cannot be removed.</p>
              )}
            </div>
          )}

          {isFormula && (
            <div>
              <label className={labelClass} htmlFor="gt-field-expression">Formula</label>
              <textarea
                id="gt-field-expression"
                className="input-field w-full font-mono text-xs"
                rows={3}
                value={expression}
                spellCheck={false}
                onChange={(e) => setExpression(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-violet-400">
                Refer to a number or currency field by its key, or to a numeric lead field as native.&lt;key&gt;.
                A formula cannot use another formula. The server checks the expression when you save and the
                result is calculated there, never typed in.
              </p>
              {numericFieldKeys.length > 0 && (
                <p className="mt-1 text-[11px] text-violet-400">
                  Available field keys: <span className="font-mono">{numericFieldKeys.join(', ')}</span>
                </p>
              )}
            </div>
          )}

          {isPerson && (
            <div>
              <label className={labelClass} htmlFor="gt-field-role">Role filter (optional)</label>
              <input
                id="gt-field-role"
                className="input-field w-full"
                list="gt-field-roles"
                value={role}
                maxLength={50}
                onChange={(e) => setRole(e.target.value)}
              />
              <datalist id="gt-field-roles">
                {roleOptions.map((r) => <option key={r} value={r} />)}
              </datalist>
              <p className="mt-1 text-[11px] text-violet-400">
                Only narrows the people offered in the picker. The server does not check the role.
              </p>
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="gt-field-desc">Description (optional)</label>
            <input id="gt-field-desc" className="input-field w-full" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {canRequire ? (
            <label className="flex items-center gap-2 text-xs text-violet-700 cursor-pointer">
              <input type="checkbox" className="accent-violet-600" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Required (values of this field cannot be left empty)
            </label>
          ) : (
            <p className="text-[11px] text-violet-400">
              {isFormula ? 'Formula fields are calculated, so they cannot be required.' : 'Checkbox fields always have a value (checked or not), so they cannot be required.'}
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
            {error.message}
            {Array.isArray(error.errors) && error.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {error.errors.map((e, i) => <li key={i}>{e.message}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
            {busy ? 'Saving…' : isEdit ? 'Save Field' : 'Create Field'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GlobalTableFieldModal;