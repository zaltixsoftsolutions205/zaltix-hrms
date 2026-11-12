import { useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { Check, Loader2, X } from 'lucide-react';
import { createRecord } from '../../store/globalTableSlice';
import { FieldControl } from './CellEditors';
import { productId } from './productRef';
import {
  buildCreateRequest,
  formColumn,
  getTypeMeta,
  initialDraftValue,
  isRequiredColumn,
} from './fieldTypes';

/**
 * The "+ Add Row" form row at the bottom of the grid.
 *
 * - One control per column, chosen by the SAME registry/editors the cells use (FieldControl).
 *   Native columns use `col.createType`; custom columns use their field type. Formula / reference /
 *   unsupported columns show a read-only placeholder and are never sent.
 * - Draft -> request conversion is shared with the GlobalDrawer (fieldTypes.buildCreateRequest), so
 *   both forms serialize and validate identically.
 * - Save calls the backend's record endpoint (thunk createRecord -> POST /global-tables/:id/records,
 *   body { native, customValues }): the Lead is created through the existing createLead rules and its
 *   custom values are saved in the same backend transaction.
 * - Cancel discards the draft and makes NO request.
 * - Saving is guarded against double submission; validation and API errors stay visible on the row
 *   and the draft is kept on failure.
 */

// The Product column is a reference handled here and in the controls, not by the field-type
// registry: its draft is a product _id, sent as native.product (omitted when nothing is chosen).
const isProductColumn = (col) => col.source === 'lead' && col.key === 'product';

const GlobalTableInlineAddRow = ({
  tableId,
  columns = [],
  pinnedSet = new Set(),
  pinnedLeftByKey = {},
  lastPinnedKey = null,
  userLookup,
  onCancel,
  onCreated,
  onOpenFullForm,
  onRefreshLeads,
  leadingCell = false, // multi-select tables have a checkbox column first
}) => {
  const dispatch = useDispatch();
  const fillable = useMemo(() => columns.filter((c) => !c.systemManaged && (isProductColumn(c) || formColumn(c))), [columns]);
  const firstKey = fillable.length ? fillable[0].key : null;

  // Footer hint is built from the columns that are actually required, so it can never
  // name a field the Lead no longer has (it used to say "Name and phone are required.").
  const requiredLabels = useMemo(
    () => fillable.filter((c) => !c.systemManaged && !isProductColumn(c) && isRequiredColumn(c)).map((c) => c.label),
    [fillable]
  );
  const hint = `Press Enter to save, Esc to cancel.${requiredLabels.length ? ` Required: ${requiredLabels.join(', ')}.` : ''}`;

  const [draft, setDraft] = useState(() => Object.fromEntries(columns.map((c) => [c.key, isProductColumn(c) ? '' : initialDraftValue(c)])));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null); // { message, list }
  const [partialId, setPartialId] = useState(null); // set when the Lead exists but its custom values failed
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // columns added after the row was opened have no draft entry yet
  const draftValue = (col) => (draft[col.key] ?? (isProductColumn(col) ? '' : initialDraftValue(col)));

  const setValue = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  const submit = async () => {
    if (savingRef.current || partialId) return; // no duplicate submissions
    const { errs, native, customValues } = buildCreateRequest(columns.filter((c) => !c.systemManaged && !isProductColumn(c)), draft);
    const chosenProduct = productId(draft.product);
    if (draft.product && !chosenProduct) errs.product = 'Invalid product';
    else if (chosenProduct) native.product = chosenProduct;
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError({ message: 'Fix the highlighted fields', list: Object.values(errs) });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const { record } = await dispatch(createRecord({ tableId, native, customValues })).unwrap();
      toast.success('Lead created');
      if (onCreated) onCreated(record);
      else if (onRefreshLeads) onRefreshLeads();
      onCancel(); // closes the row
    } catch (err) {
      if (err && err.details && err.details.recordId) {
        // NOT a success: the Lead exists but some custom values were not saved.
        setPartialId(err.details.recordId);
        setFormError({ message: `${err.message}. The lead was created; open it in the table to add the missing values. Do not submit this row again.`, list: [] });
        if (onRefreshLeads) onRefreshLeads();
      } else {
        const list = Array.isArray(err && err.errors) ? err.errors.map((e) => e.message) : [];
        setFormError({ message: (err && err.message) || 'Failed to create the lead', list });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); if (!saving) onCancel(); }
    e.stopPropagation();
  };

  const pinStyle = (col) => (pinnedSet.has(col.key)
    ? { position: 'sticky', left: pinnedLeftByKey[col.key] ?? 0, zIndex: 20, isolation: 'isolate', backgroundColor: '#faf5ff' }
    : { backgroundColor: '#faf5ff' });

  return (
    <>
      <tr data-testid="inline-add-row" className="bg-violet-50/60" onKeyDown={onKeyDown}>
        {leadingCell && <td className="sticky left-0 z-20" style={{ isolation: 'isolate', backgroundColor: '#faf5ff' }} />}
        {columns.map((col) => {
          const fc = col.systemManaged ? null : isProductColumn(col) ? col : formColumn(col);
          const required = !col.systemManaged && !isProductColumn(col) && isRequiredColumn(col);
          return (
            <td
              key={col.key}
              className={pinnedSet.has(col.key) && col.key === lastPinnedKey ? 'border-r border-violet-200' : ''}
              style={{ minWidth: col.width, maxWidth: col.width * 1.6, ...pinStyle(col) }}
            >
              {fc ? (
                <div data-testid={`add-${col.key}`}>
                  <FieldControl
                    col={fc}
                    value={draftValue(col)}
                    userLookup={userLookup}
                    autoFocus={col.key === firstKey}
                    invalid={Boolean(errors[col.key])}
                    onChange={(v) => setValue(col.key, v)}
                  />
                  {required && !errors[col.key] && <span className="sr-only">required</span>}
                  {errors[col.key] && <div role="alert" className="mt-0.5 text-[10px] text-red-600">{errors[col.key]}</div>}
                </div>
              ) : (
                <span className="text-xs text-violet-300 italic" title={getTypeMeta(col.type).reason}>
                  {getTypeMeta(col.type).calculated ? 'calculated' : '—'}
                </span>
              )}
            </td>
          );
        })}
        <td className="sticky right-0 z-20" style={{ isolation: 'isolate', backgroundColor: '#faf5ff', width: 48 }}>
          <div className="flex items-center justify-center gap-1">
            <button
              type="button" data-testid="inline-add-save" title="Save row" aria-label="Save new row"
              disabled={saving || Boolean(partialId)} onClick={submit}
              className="w-6 h-6 flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              type="button" data-testid="inline-add-cancel" title={partialId ? 'Close' : 'Cancel'} aria-label={partialId ? 'Close new row' : 'Cancel new row'}
              disabled={saving} onClick={onCancel}
              className="w-6 h-6 flex items-center justify-center rounded text-violet-400 hover:bg-violet-100 disabled:opacity-40"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
      <tr data-testid="inline-add-footer">
        <td colSpan={columns.length + 1 + (leadingCell ? 1 : 0)} className="!py-1">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className={formError ? 'text-red-600' : 'text-violet-400'} role={formError ? 'alert' : undefined}>
              {formError ? (
                <>
                  {formError.message}
                  {formError.list.length > 0 && <ul className="list-disc pl-4">{formError.list.map((m, i) => <li key={i}>{m}</li>)}</ul>}
                </>
              ) : hint}
            </span>
            {onOpenFullForm && !partialId && (
              <button type="button" onClick={onOpenFullForm} className="shrink-0 text-violet-600 hover:text-violet-800 underline">
                Open full form
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
};

export default GlobalTableInlineAddRow;