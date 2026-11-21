import { useEffect, useRef, useState } from 'react';
import AssigneeSelect from '../Crm/Assigneeselect';
import { getTypeMeta, personOptions } from './fieldTypes';
import { productChoices, productsHint, productId } from './Productref';
import FollowUpInput, { FollowUpCellEditor } from './FollowUpInput';

/**
 * Editors return raw values only.
 * Persistence and API conversion belong to the parent.
 *
 * onCommit(rawValue, nav)
 * nav: down | next | prev | stay
 *
 * Editor values follow fieldTypes.toEditorValue():
 *   checkbox -> true | false      boolean -> 'true' | 'false' | ''
 *   multi-select / person -> array of strings
 */

const YES_NO_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const useFinishOnce = (onCommit, onCancel) => {
  const done = useRef(false);

  return {
    commit: (value, nav = 'stay') => {
      if (done.current) return;
      done.current = true;
      onCommit?.(value, nav);
    },
    cancel: () => {
      if (done.current) return;
      done.current = true;
      onCancel?.();
    },
  };
};

const navForKey = (e) => {
  if (e.key === 'Enter') return 'down';
  if (e.key === 'Tab') return e.shiftKey ? 'prev' : 'next';
  return null;
};

/* --------------------------- text-like inputs --------------------------- */

const InputEditor = ({
  type = 'text',
  step,
  initial,
  label,
  onCommit,
  onCancel,
}) => {
  const [draft, setDraft] = useState(initial ?? '');
  const { commit, cancel } = useFinishOnce(onCommit, onCancel);

  return (
    <input
      autoFocus
      type={type}
      step={step}
      value={draft}
      aria-label={label}
      className="input-field !py-1 !text-xs w-full"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select?.()}
      onBlur={() => commit(draft, 'stay')}
      onKeyDown={(e) => {
        const nav = navForKey(e);

        if (nav) {
          e.preventDefault();
          commit(draft, nav);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }

        e.stopPropagation();
      }}
    />
  );
};

/* ------------------------------ checkbox ------------------------------- */

const CheckboxEditor = ({ initial, label, onCommit }) => {
  const { commit } = useFinishOnce(onCommit, () => { });

  return (
    <input
      autoFocus
      type="checkbox"
      aria-label={label}
      checked={initial === true || initial === 'true' || initial === 1}
      className="accent-violet-600"
      onChange={(e) => commit(e.target.checked, 'stay')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    />
  );
};

/* ------------------------------- select -------------------------------- */

const SelectEditor = ({
  options = [],
  initial,
  label,
  onCommit,
  onCancel,
}) => {
  const { commit, cancel } = useFinishOnce(onCommit, onCancel);
  const [draft, setDraft] = useState(initial ?? '');

  return (
    <select
      autoFocus
      value={draft}
      aria-label={label}
      className="input-field !py-1 !text-xs w-full"
      onChange={(e) => {
        const value = e.target.value;
        setDraft(value);
        commit(value, 'stay');
      }}
      onBlur={() => commit(draft, 'stay')}
      onKeyDown={(e) => {
        const nav = navForKey(e);

        if (nav) {
          e.preventDefault();
          commit(draft, nav);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }

        e.stopPropagation();
      }}
    >
      <option value="">—</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

/* ------------------------------- product ------------------------------- */

// Inline editor for the Lead's Product: the shared select, fed with the active products plus the
// lead's current one. Commits the product _id ('' clears it); the parent saves it.
const ProductEditor = ({ col, initial, onCommit, onCancel }) => {
  const choices = productChoices(col.options, initial);
  const hint = productsHint(col.productsState, choices.length);
  return (
    <div>
      <SelectEditor
        options={choices}
        initial={productId(initial) || ''}
        label={col.label}
        onCommit={onCommit}
        onCancel={onCancel}
      />
      {hint && <div className="mt-0.5 text-[10px] text-violet-400" role="status">{hint}</div>}
    </div>
  );
};

/* ---------------------------- multi-select ----------------------------- */
/* Also used for `person` fields (options = users). */

const MultiSelectEditor = ({
  options = [],
  initial,
  label,
  onCommit,
  onCancel,
}) => {
  const { commit, cancel } = useFinishOnce(onCommit, onCancel);
  const [selected, setSelected] = useState(
    Array.isArray(initial) ? initial : []
  );
  const [open, setOpen] = useState(true);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const toggle = (value) => {
    setSelected((previous) =>
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value]
    );
  };

  return (
    <div
      role="group"
      aria-label={label}
      className="relative min-w-0"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          return;
        }

        if (e.key === 'Enter' && !open) {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      <button
        type="button"
        className="w-full min-h-7 text-left text-xs truncate"
        onClick={() => setOpen((previous) => !previous)}
      >
        {selected.length
          ? selected
            .map((value) =>
              options.find((option) => option.value === value)?.label ?? value
            )
            .join(', ')
          : 'Select options…'}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 min-w-[12rem] max-h-56 overflow-auto bg-white border border-violet-200 rounded-lg shadow-lg p-1">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-violet-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                className="accent-violet-600"
              />
              {option.label}
            </label>
          ))}

          <div className="flex justify-end gap-1 pt-1 border-t border-violet-100 mt-1">
            <button
              type="button"
              onClick={cancel}
              className="px-2 py-0.5 text-[11px] text-violet-500 hover:bg-violet-50 rounded"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => commit(selectedRef.current, 'stay')}
              className="px-2 py-0.5 text-[11px] bg-violet-600 text-white rounded hover:bg-violet-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


/* ------------------------------ assignee ------------------------------- */

const AssigneeEditor = ({ initial, onCommit, onCancel, userLookup }) => {
  const { commit, cancel } = useFinishOnce(onCommit, onCancel);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target)
      ) {
        cancel();
      }
    };

    document.addEventListener('mousedown', onDown);

    return () => {
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }

        e.stopPropagation();
      }}
    >
      <AssigneeSelect
        value={initial || ''}
        userLookup={userLookup}
        onChange={(value) => commit(value, 'stay')}
      />
    </div>
  );
};

/* ----------------------------- dispatcher ------------------------------ */

export const CellEditor = ({
  col,
  initial,
  onCommit,
  onCancel,
  userLookup,
}) => {
  const label = col.label;

  if (col.type === 'assignee') {
    return (
      <AssigneeEditor
        initial={initial}
        userLookup={userLookup}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  switch (col.type) {
    case 'product':
      return <ProductEditor col={col} initial={initial} onCommit={onCommit} onCancel={onCancel} />;

    case 'mandal':
      return (
        <SelectEditor
          options={col.options || []}
          initial={initial ? String(initial?._id || initial) : ''}
          label={col.label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'name':
      return (
        <InputEditor
          type="text"
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'stage':
      return (
        <SelectEditor
          options={col.options || col.field?.options || []}
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );
    case 'text':
      return (
        <InputEditor
          type={col.inputType || 'text'}
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'email':
      return (
        <InputEditor
          type="email"
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'number':
    case 'currency':
      return (
        <InputEditor
          type="number"
          step={getTypeMeta(col.type).step || 'any'}
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'date':
      return (
        <InputEditor
          type="date"
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'followup':
      return <FollowUpCellEditor initial={initial} label={label} onCommit={onCommit} onCancel={onCancel} />;

    case 'datetime':
      return (
        <InputEditor
          type="datetime-local"
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    // checkbox: two states, never empty (false when unchecked)
    case 'checkbox':
      return (
        <CheckboxEditor
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    // boolean: three states (Yes / No / not set)
    case 'boolean':
      return (
        <SelectEditor
          options={YES_NO_OPTIONS}
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'single-select':
      return (
        <SelectEditor
          options={col.field?.options || []}
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    case 'multi-select':
      return (
        <MultiSelectEditor
          options={col.field?.options || []}
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    // The backend stores person values as an array of user ids
    case 'person':
      return (
        <MultiSelectEditor
          options={personOptions(userLookup, col.field?.config?.role)}
          initial={initial}
          label={label}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );

    // Calculated and reference fields are not directly editable.
    case 'formula':
    case 'reference':
    default:
      return null;
  }
};

/**
 * Controlled form control (inline Add Row + GlobalDrawer) when `onChange` is passed,
 * otherwise the cell editor with the col/initial/onCommit/onCancel contract.
 *
 * `dense` = compact styling for grid cells; pass dense={false} in forms.
 */

export const FieldControl = ({
  col,
  field,
  value,
  initial,
  onChange,
  onCommit,
  onCancel,
  autoFocus = false,
  invalid = false,
  dense = true,
  userLookup,
}) => {
  const resolvedCol = col || {
    type: field?.type,
    label: field?.label || field?.name || '',
    field,
  };

  const resolvedInitial = initial ?? value ?? '';

  // Inline Add Row / drawer own the draft state. Keep their controls controlled.
  if (onChange) {
    const type = resolvedCol.type;
    const options = resolvedCol.field?.options || resolvedCol.options || [];
    const inputClass = `${dense ? 'input-field !py-1 !text-xs' : 'input-field'} w-full ${invalid ? 'border-red-500' : ''}`;

    // never editable
    if (type === 'formula' || type === 'reference') return null;

    if (type === 'assignee') {
      return (
        <div className={invalid ? 'rounded ring-1 ring-red-500' : ''}>
          <AssigneeSelect
            value={resolvedInitial || ''}
            onChange={onChange}
            userLookup={userLookup}
          />
        </div>
      );
    }

    if (type === 'person' || type === 'multi-select') {
      const choices =
        type === 'person'
          ? personOptions(userLookup, resolvedCol.field?.config?.role)
          : options;

      const selected = Array.isArray(resolvedInitial)
        ? resolvedInitial
        : [];

      return (
        <div
          role="group"
          aria-label={resolvedCol.label}
          aria-invalid={invalid}
          className={`w-full rounded-md border p-2 ${invalid ? 'border-red-500' : 'border-violet-200'
            }`}
        >
          <div className="max-h-36 overflow-y-auto space-y-1">
            {choices.map((option) => {
              const checked = selected.includes(option.value);

              return (
                <label
                  key={option.value}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-violet-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={false}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, option.value]
                        : selected.filter(
                          (item) => item !== option.value
                        );

                      onChange(next);
                    }}
                    className="accent-violet-600"
                  />

                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>

          {choices.length === 0 && (
            <p className="text-xs text-gray-500 px-2 py-1">
              No options available
            </p>
          )}

          {selected.length > 0 && (
            <p className="text-xs text-gray-500 mt-2 border-t pt-2">
              {selected.length} selected
            </p>
          )}
        </div>
      );
    }


    if (type === 'product') {
      const choices = productChoices(options, resolvedInitial);
      const hint = productsHint(resolvedCol.productsState, choices.length);
      return (
        <div>
          <select
            autoFocus={autoFocus}
            aria-label={resolvedCol.label}
            aria-invalid={invalid}
            value={productId(resolvedInitial) || ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {choices.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {hint && <div className="mt-0.5 text-[10px] text-violet-400" role="status">{hint}</div>}
        </div>
      );
    }

    if (type === 'single-select' || type === 'stage') {
      return (
        <select
          autoFocus={autoFocus}
          aria-label={resolvedCol.label}
          aria-invalid={invalid}
          value={resolvedInitial ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    // boolean: Yes / No / not set
    if (type === 'boolean') {
      return (
        <select
          autoFocus={autoFocus}
          aria-label={resolvedCol.label}
          aria-invalid={invalid}
          value={resolvedInitial === true ? 'true' : resolvedInitial === false ? 'false' : (resolvedInitial ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Not set</option>
          {YES_NO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (type === 'followup') {
      return <FollowUpInput value={resolvedInitial || ''} onChange={onChange} dense={dense} invalid={invalid} autoFocus={autoFocus} label={resolvedCol.label} />;
    }

    // checkbox: checked / unchecked
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          autoFocus={autoFocus}
          aria-label={resolvedCol.label}
          checked={resolvedInitial === true}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-violet-600"
        />
      );
    }

    const inputType =
      type === 'email' ? 'email'
        : type === 'number' || type === 'currency' ? 'number'
          : type === 'date' ? 'date'
            : type === 'datetime' ? 'datetime-local'
              : 'text';

    return (
      <input
        type={inputType}
        autoFocus={autoFocus}
        step={inputType === 'number' ? (getTypeMeta(type).step || 'any') : undefined}
        aria-label={resolvedCol.label}
        aria-invalid={invalid}
        value={resolvedInitial ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    );
  }

  return (
    <CellEditor
      col={resolvedCol}
      initial={resolvedInitial}
      userLookup={userLookup}
      onCommit={(rawValue, nav) => {
        onChange?.(rawValue);
        onCommit?.(rawValue, nav || 'stay');
      }}
      onCancel={onCancel || (() => { })}
    />
  );
};


export const FormulaCellDisplay = ({ value }) => (
  <span
    className="text-xs text-violet-400 italic"
    title="Calculated field (read-only)"
  >
    {value === null || value === undefined || value === ''
      ? '—'
      : String(value)}
  </span>
);