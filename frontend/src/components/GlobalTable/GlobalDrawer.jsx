import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarClock, ExternalLink, FileText, Pencil, User, Workflow,
} from 'lucide-react';

import Drawer from '../Crm/Drawer';
import { formatPipelineStage } from '../../utils/leadPipeline';
import { getGlobalTableRecord } from '../../services/GlobalTableService';
import { createRecord, updateRecord } from '../../store/globalTableSlice';
import { useAuth } from '../../contexts/AuthContext';
import { formatFollowUp, isFollowUpOverdue } from '../../utils/followUp';
import { TERMINAL_STAGES, normalizeStage, stageLabel } from '../../hooks/useGlobalTableColumns';
import { FieldControl, FormulaCellDisplay } from './CellEditors';
import CellDisplay from './CellDisplay';
import LeadPipelinePanel from '../Activities/LeadPipelinePanel';
import { StageEditor } from '../Activities/ActivityLeadInfo';
import { ACTIVITY_ORDER } from '../Activities/activityTypes';
import { canEditLead, canEditPipeline, canSeePipeline } from '../Activities/pipelineAccess';
import {
  buildCreateRequest,
  buildUpdateRequest,
  formColumn,
  getTypeMeta,
  initialDraftValue,
  isRequiredColumn,
  toEditorValue,
} from './fieldTypes';

/**
 * Global Drawer: create or edit a full record (native Lead fields + custom fields).
 *
 * - Fields come from `columns` (the table's native + custom column definitions, each custom one
 *   carrying its field definition, options and config), so nothing is fetched twice.
 * - Inputs are the same FieldControl the inline Add Row uses, and the draft -> request conversion
 *   is shared with it (fieldTypes.buildCreateRequest / buildUpdateRequest).
 * - Create  -> POST /global-tables/:id/records   (thunk createRecord)
 *   Edit    -> GET  /global-tables/:id/records/:recordId to load,
 *              PUT  /global-tables/:id/records/:recordId to save (thunk updateRecord)
 *   Native and custom values are saved together by the backend, atomically.
 *   Edit sends only the fields that changed.
 * - Formula fields are shown as the backend-calculated value and are never editable.
 * - On failure the drawer stays open with the user's input and the backend's message.
 *
 * An existing lead opens READ-ONLY: stage / assignee / follow-up on top, then two tabs:
 *   Details   main and custom fields; "Edit" (needs CRM edit) switches them to inputs
 *   Pipeline  admin / HR / managers only (pipelineAccess.js): every stage as a timeline;
 *             with CRM edit they change the stage and add / edit / delete entries here
 * Other employees see only the Details. `startEditing` opens straight in edit mode
 * (used by the lead page's Edit button).
 *
 * onSaved(record, { mode }) is called with the native record from the response (create: then onClose()).
 * onPartial(details) is called when the backend reports a partially applied save.
 */

const describeError = (err, fallback) => {
  const data = err?.response?.data;
  const errors = Array.isArray(err?.errors) ? err.errors : Array.isArray(data?.errors) ? data.errors : [];
  return {
    message: (err?.response ? data?.message : err?.message) || fallback,
    list: errors.map((e) => e.message).filter(Boolean),
    details: err?.details || data?.details,
  };
};

const GlobalDrawer = ({
  mode = 'edit',
  tableId,
  recordId,
  isOpen,
  onClose,
  columns = [],
  userLookup,
  onSaved,
  onPartial,
  startEditing = false,
  showLeadLink = true,
  // Pipeline sections under the fields: every stage by default. The backend shows them
  // to admin / HR / managers for any lead, and to other employees for their own leads.
  activityTypes = ACTIVITY_ORDER,
  // View-only access to the page the drawer is opened from (e.g. Leads page with
  // 'lead' view): no field edits, no stage change. Stage entries still follow
  // their own page module (pipelineAccess.canEditStage).
  readOnly = false,
}) => {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const isCreate = mode === 'create';
  const [editing, setEditing] = useState(isCreate || startEditing);
  const [reloadKey, setReloadKey] = useState(0); // reload the record after a save
  const [tab, setTab] = useState('details'); // 'details' | 'pipeline'
  const notifyRef = useRef(false); // a pipeline change: tell the table once the lead is reloaded
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const visibleColumns = useMemo(
    () => columns.filter((c) => c && c.visible !== false && c.key !== undefined),
    [columns]
  );
  const columnsRef = useRef(visibleColumns);
  columnsRef.current = visibleColumns;

  const [record, setRecord] = useState(null); // native record (edit)
  const [customValues, setCustomValues] = useState({}); // stored values by field key (edit)
  const [computed, setComputed] = useState({}); // formula results by field key (edit)
  const [draft, setDraft] = useState(() => (isCreate
    ? Object.fromEntries(visibleColumns.map((c) => [c.key, initialDraftValue(c)]))
    : {}));
  const [initial, setInitial] = useState({}); // draft as loaded, to send only changes
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null); // { message, list }
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [partialLock, setPartialLock] = useState(false); // created, custom values failed: never create twice
  const savingRef = useRef(false);

  /* ------------------------------ load (edit) ------------------------------ */

  useEffect(() => {
    if (!isOpen || isCreate || !tableId || !recordId) return undefined;

    let active = true;
    setLoading(true);
    setLoadError(null);

    getGlobalTableRecord(tableId, recordId)
      .then((res) => {
        if (!active) return;
        const rec = res?.record || null;
        const stored = res?.customValues || {};
        setRecord(rec);
        setCustomValues(stored);
        setComputed(res?.computedValues || {});

        const values = {};
        columnsRef.current.forEach((col) => {
          if (!col.editable) return;
          const raw = col.source === 'lead'
            ? (col.type === 'assignee' ? rec?.assignedTo : rec?.[col.key])
            : stored[col.field?.key];
          values[col.key] = toEditorValue(col, raw);
        });
        setDraft(values);
        setInitial(values);
        if (notifyRef.current) {
          notifyRef.current = false;
          if (rec) onSavedRef.current?.(rec, { mode: 'edit' });
        }
      })
      .catch((err) => {
        if (active) setLoadError(describeError(err, 'Failed to load record').message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [isOpen, isCreate, tableId, recordId, reloadKey]);

  /* -------------------------------- editing -------------------------------- */

  const setValue = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  /* --------------------------------- save ---------------------------------- */

  const submit = async () => {
    if (savingRef.current || partialLock) return;

    const { errs, native, customValues: custom } = isCreate
      ? buildCreateRequest(visibleColumns, draft)
      : buildUpdateRequest(visibleColumns, draft, initial);

    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError({ message: 'Fix the highlighted fields', list: Object.values(errs) });
      return;
    }
    if (!isCreate && !Object.keys(native).length && !Object.keys(custom).length) {
      onClose?.(); // nothing changed: no request
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const result = await dispatch(
        isCreate
          ? createRecord({ tableId, native, customValues: custom })
          : updateRecord({ tableId, recordId, native, customValues: custom })
      ).unwrap();

      toast.success(isCreate ? 'Lead created' : 'Lead updated');
      onSaved?.(result?.record, { mode });
      if (isCreate) onClose?.();
      else { setEditing(false); setReloadKey((k) => k + 1); } // back to the read-only view, fresh data
    } catch (err) {
      const { message, list } = describeError(err, isCreate ? 'Failed to create the lead' : 'Failed to update the lead');
      const details = err?.details;
      if (isCreate && details?.recordId) {
        // NOT a success: the Lead exists but some custom values were not saved.
        setPartialLock(true);
        setFormError({ message: `${message}. The lead was created; open it in the table to add the missing values. Do not submit this form again.`, list: [] });
        onPartial?.(details);
      } else if (!isCreate && details && 'nativeApplied' in details) {
        setFormError({ message: `${message}. Some changes may already be saved; the table has been refreshed.`, list });
        onPartial?.(details);
      } else {
        setFormError({ message, list });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /* -------------------------------- render --------------------------------- */

  const title = isCreate ? 'Create Record' : record?.name || record?.title || 'Record';

  const readOnlyContent = (col) => {
    if (col.activityOnly) {
      return (
        <span className="text-sm text-violet-900" title={`Filled in the ${col.field?.appliesTo} form`}>
          <CellDisplay col={col} lead={record || {}} raw={customValues[col.field?.key]} userLookup={userLookup} canEdit={false} onToggleBool={() => {}} />
        </span>
      );
    }
    if (col.source === 'custom' && col.systemManaged) {
      const value = customValues[col.field?.key];
      return <span className="text-sm text-violet-900">{value === undefined || value === null || value === '' ? '—' : String(value)}</span>;
    }
    if (col.systemManaged && col.key === 'product') {
      const value = record?.product;
      return <span className="text-sm text-violet-900">{value?.name || value || '—'}</span>;
    }
    if (col.source === 'custom') {
      if (col.type === 'formula') {
        return isCreate
          ? <span className="text-xs text-violet-400 italic">Calculated after the record is saved</span>
          : <FormulaCellDisplay value={computed[col.field?.key]} />;
      }
      if (col.type === 'reference') {
        const v = customValues[col.field?.key];
        return <span className="text-xs text-violet-400" title={v ? String(v) : undefined}>{v ? 'Linked record' : '—'}</span>;
      }
    }
    if (col.type === 'stage') return <span className="text-sm">{formatPipelineStage(record?.[col.key] || 'lead')}</span>;
    if (col.type === 'count') return <span className="text-sm">{record?.visitCount ?? 0}</span>;
    const v = record?.[col.key];
    return <span className="text-sm text-violet-900">{v === undefined || v === null || v === '' ? '—' : String(v)}</span>;
  };

  const cancelEdit = () => {
    setDraft(initial);
    setErrors({});
    setFormError(null);
    setEditing(false);
  };

  // Read-only value of a column (view mode): the same rendering as the table cells.
  const viewContent = (col) => {
    if (col.source === 'lead' && col.type === 'name') return <span className="text-sm font-semibold text-violet-900">{record?.name || '—'}</span>;
    if (col.source === 'lead' && col.type === 'assignee') {
      const a = record?.assignedTo;
      return <span className="text-sm text-violet-900">{a?.name || userLookup?.[a?._id || a]?.name || '—'}</span>;
    }
    if (col.source === 'lead' && col.key === 'district') return <span className="text-sm text-violet-900">{record?.district || '—'}</span>;
    const raw = col.source === 'lead' ? record?.[col.key] : customValues[col.field?.key];
    return (
      <span className="text-sm text-violet-900">
        <CellDisplay col={col} lead={record || {}} raw={raw} computedValue={computed[col.field?.key]} userLookup={userLookup} canEdit={false} onToggleBool={() => {}} />
      </span>
    );
  };

  const rows = visibleColumns.map((col, index) => {
    if (!isCreate && !editing) {
      return (
        <div key={col.key} data-source={col.source} className={`rounded-lg px-3 py-2 bg-gray-50/70 ${col.type === 'multi-select' || col.type === 'person' ? 'sm:col-span-2' : ''}`}>
          <span className="block text-[11px] font-medium text-gray-400">{col.label}</span>
          <div className="min-h-[1.5rem] flex items-center break-words">{viewContent(col)}</div>
        </div>
      );
    }
    const control = isCreate ? formColumn(col) : (col.editable ? col : null);
    const calculatedOrReference = col.source === 'custom' && getTypeMeta(col.type).readOnly;
    if (isCreate && !control && !calculatedOrReference) return null;

    const editor = getTypeMeta(control ? control.type : col.type).editor;
    const required = control && (isCreate
      ? isRequiredColumn(col)
      : col.source === 'custom' && Boolean(col.field?.required) && editor !== 'toggle');
    const wide = editor === 'multi' || editor === 'person';

    return (
      <div key={col.key} data-source={col.source} className={wide ? 'sm:col-span-2' : ''}>
        <label className="input-label">
          {col.label}
          {required && <span> *</span>}
        </label>

        {control ? (
          <FieldControl
            col={control}
            value={draft[col.key] ?? initialDraftValue(col)}
            userLookup={userLookup}
            dense={false}
            autoFocus={isCreate && index === 0}
            invalid={Boolean(errors[col.key])}
            onChange={(v) => setValue(col.key, v)}
          />
        ) : (
          <div className="min-h-[2rem] flex items-center">{readOnlyContent(col)}</div>
        )}

        {errors[col.key] && (
          <div role="alert" className="mt-0.5 text-[11px] text-red-600">{errors[col.key]}</div>
        )}
      </div>
    );
  }).filter(Boolean);

  const mainRows = rows.filter((r) => r.props['data-source'] !== 'custom');
  const customRows = rows.filter((r) => r.props['data-source'] === 'custom');

  const canEdit = !readOnly && canEditLead(user) && visibleColumns.some((c) => c.editable);
  const showPipeline = !isCreate && Boolean(record) && activityTypes.length > 0 && canSeePipeline(user);
  const stageEditable = !readOnly && canEditPipeline(user); // change the lead's stage
  const pipelineEditable = canSeePipeline(user); // entries: per stage module (LeadPipelinePanel)
  const onPipelineChanged = () => { notifyRef.current = true; setReloadKey((k) => k + 1); };
  const stage = normalizeStage(record?.pipelineStage || 'lead');
  const followUp = record?.followUpDate;
  const overdue = isFollowUpOverdue(followUp) && !TERMINAL_STAGES.includes(stage);
  const assignee = record?.assignedTo;
  const assigneeName = assignee?.name || userLookup?.[assignee?._id || assignee]?.name || '—';
  const onDetails = tab === 'details' || !showPipeline;

  const headerActions = !isCreate && record ? (
    <>
      {showLeadLink && (
        <Link
          to={`/crm/leads/${record._id}`}
          title="Open the full lead page"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-50"
        >
          <ExternalLink size={13} /> Lead page
        </Link>
      )}
      {!editing && canEdit && onDetails && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"
        >
          <Pencil size={13} /> Edit
        </button>
      )}
    </>
  ) : null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={!isCreate && record ? (editing ? 'Editing the lead details' : [record.mandal, record.product?.name].filter(Boolean).join(' · ') || 'Lead') : 'Fill in the lead details'}
      actions={headerActions}
      size={showPipeline ? 'xl' : 'lg'}
      footer={!editing ? null : (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={saving || loading || partialLock || Boolean(loadError)}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </button>

          <button
            type="button"
            onClick={isCreate || partialLock ? onClose : cancelEdit}
            disabled={saving}
            className="btn-secondary flex-1"
          >
            {partialLock ? 'Close' : 'Cancel'}
          </button>
        </div>
      )}
    >
      {loading && !record ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 bg-violet-100/70 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      ) : (
        <div className="space-y-4">
          {!isCreate && record && !editing && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-500"><Workflow size={11} /> Stage</p>
                <div className="mt-1 text-sm">
                  {stageEditable
                    ? <StageEditor lead={record} onChanged={onPipelineChanged} />
                    : <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-semibold">{stageLabel(stage)}</span>}
                </div>
              </div>
              <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><User size={11} /> Assigned to</p>
                <p className="mt-1 text-sm font-medium text-gray-800 truncate">{assigneeName}</p>
              </div>
              <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><CalendarClock size={11} /> Next follow-up</p>
                <p className="mt-1 text-sm font-medium text-gray-800">
                  {formatFollowUp(followUp)}
                  {overdue && <span className="ml-1.5 rounded-full bg-red-50 text-red-600 px-1.5 py-0.5 text-[10px] font-semibold">Overdue</span>}
                </p>
              </div>
            </div>
          )}

          {showPipeline && !editing && (
            <div role="tablist" aria-label="Lead sections" className="flex border-b border-violet-100">
              {[
                { key: 'details', label: 'Details', Icon: FileText },
                { key: 'pipeline', label: 'Pipeline', Icon: Workflow },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === key ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          )}

          {formError && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
              {formError.message}
              {formError.list.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {formError.list.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
            </div>
          )}

          {onDetails && (
            <>
              {mainRows.length > 0 && (
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">Main fields</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{mainRows}</div>
                </section>
              )}
              {customRows.length > 0 && (
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">Custom fields</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{customRows}</div>
                </section>
              )}
              {!rows.length && (
                <div className="text-center py-10 text-sm text-violet-400">
                  No fields configured for this table.
                </div>
              )}
              {!isCreate && !editing && !canEdit && (
                <p className="text-[11px] text-gray-400">You can view these details; you do not have permission to edit leads.</p>
              )}
            </>
          )}

          {showPipeline && tab === 'pipeline' && !editing && (
            <LeadPipelinePanel
              leadId={record._id}
              stage={record.pipelineStage}
              types={activityTypes}
              userLookup={userLookup}
              reloadKey={reloadKey}
              editable={pipelineEditable}
              currentUser={user}
              onLeadChanged={onPipelineChanged}
            />
          )}
        </div>
      )}
    </Drawer>
  );
};

export default GlobalDrawer;