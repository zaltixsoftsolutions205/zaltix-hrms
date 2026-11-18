import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import EmptyState from '../UI/EmptyState';
import GlobalTableInlineAddRow from './GlobalTableInlineAddRow';
import GlobalDrawer from './GlobalDrawer';
import GlobalTableExcelActions from './GlobalTableExcelActions';
import { updateLead } from '../../services/Leadservice';
import { bulkDeleteGlobalTableRecords, deleteGlobalTableRecord } from '../../services/GlobalTableService';
import { createLeadTable, createField, deleteField, fetchFields, fetchLeadTable, fetchTableById, fetchValues, deleteCellValue, recordRemoved, saveCellValue, updateField } from '../../store/globalTableSlice';
import { useGlobalTableColumns, classifyStageChange, isStageLocked, normalizeStage, stageLabel } from '../../hooks/useGlobalTableColumns';
import { useProducts } from '../../hooks/useProducts';
import { productId } from './productRef';
import { NUMERIC_FIELD_TYPES, canon, getTypeMeta, isLeadField, toApiValue } from './fieldTypes';
import GlobalTableHeader from './GlobalTableHeader';
import GlobalTableRow, { SELECT_COL_WIDTH } from './GlobalTableRow';
import GlobalTableFieldModal from './GlobalTableFieldModal';
import ConfirmDialog from './ConfirmDialog';
import StageChangeDialog, { needsFollowUpDialog } from '../Crm/StageChangeDialog';
import { ACTIVITY_ORDER } from '../Activities/activityTypes';
import {
  LeadCalendarPanel, StageKanban, VIEW_OPTIONS, ViewSwitcher, useViewPref,
} from '../LeadViews/LeadViews';

/**
 * Dynamic Lead table (Excel / Airtable style).
 *
 * Data ownership (kept strictly separate):
 *   - Native Lead columns  -> Lead API (updateLead). Rows come from the parent.
 *   - Custom fields        -> Global Table API (Redux: valuesByRecord)
 *   - Formula fields       -> calculated by the backend, delivered with the values
 *                             (includeComputed); read-only
 *
 * Creating / editing whole records:
 *   bottom-left +     add a ROW inline                -> POST /global-tables/:id/records
 *   open a lead       edit in the Global Drawer       -> PUT  /global-tables/:id/records/:recordId
 *   "+ Create Lead"   create in the Global Drawer     -> POST /global-tables/:id/records
 *                     (opened by the parent through createDrawerOpen / onCreateDrawerClose)
 *
 * Other actions:
 *   top-right  +      add a FIELD (column)            -> POST /global-table-fields
 *   far-right trash   delete the whole LEAD           -> deleteLead()
 *   active-cell trash delete ONE custom value only    -> DELETE /global-table-values/:id
 *
 * Pipeline stage (native column, edited with the stage dropdown):
 *   picking a different stage does NOT save. It opens a Promote / Demote confirmation (position in
 *   the stage order decides which). Confirm -> updateLead(id, { pipelineStage, expectedStage }) ->
 *   PUT /leads/:id; the row changes only after the server answers. Cancel sends nothing. A lead in a
 *   terminal stage (Lead Won / Lead Lost) is not editable; the backend refuses it too, and a stale
 *   change (409) reloads the list instead of overwriting newer data.
 *
 * Views (props `views`, `viewKey`, `kanbanDrag`): besides the table, the same leads as a
 * Calendar / List (by follow-up date) or a Kanban (by pipeline stage). Clicking a lead
 * opens the same drawer. With `kanbanDrag`, dropping a card on another stage goes
 * through the same confirmation / StageChangeDialog as the stage dropdown.
 *
 * Props:
 *   leads, userLookup, loading,
 *   onOpenCreateDrawer(), createDrawerOpen, onCreateDrawerClose(),
 *   onLeadUpdated(updatedLead), onLeadDeleted(leadId), onLeadCreated(lead), onRefreshLeads()
 */
const EMPTY = Object.freeze({});
const isToggle = (col) => getTypeMeta(col.type).editor === 'toggle'; // checkbox: flips in place
// Editable inside a table cell (the lead name is edited only in the drawer).
const canEditCell = (col) => Boolean(col?.editable && col.cellEditable !== false);
const errMessage = (err, fallback) => err?.message || err?.response?.data?.message || fallback;
// The server's own message first (axios puts a generic text in err.message)
const apiMessage = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
// Message when a stage cell may not be edited (terminal stage), otherwise null
const stageLockMessage = (col, lead) => (
  col && col.source === 'lead' && col.key === 'pipelineStage' && lead && isStageLocked(lead.pipelineStage)
    ? `This lead is already ${stageLabel(lead.pipelineStage)}; its stage can no longer be changed.`
    : null
);
const shallowEqual = (a, b) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};
const TableSkeleton = ({ colCount }) => (
  <tbody>
    {[...Array(5)].map((_, r) => (
      <tr key={r}>
        {[...Array(colCount)].map((__, c) => (<td key={c}><div className="h-4 bg-violet-100/70 rounded animate-pulse" /></td>))}
      </tr>
    ))}
  </tbody>
);
const GlobalTable = ({
  tableId,
  leads,
  userLookup,
  loading,
  onOpenCreateDrawer,
  createDrawerOpen = false,
  onCreateDrawerClose,
  onLeadUpdated,
  onLeadDeleted,
  onLeadCreated,
  onRefreshLeads,
  // Leads page "All my leads": { mandalOptions } for the Mandal dropdown.
  // View and edit only: no custom columns and no way to create a lead here
  // (leads are created inside a Mandal's table).
  locationPicker,
  // Optional per-row button before the trash (see GlobalTableRow).
  rowAction,
  // Pipeline stages (visit, demo, ...) shown as cards in the lead drawer; all by default.
  drawerActivities = ACTIVITY_ORDER,
  // Table / Calendar / List / Kanban switcher: show it, remember the choice under viewKey.
  showViews = false,
  viewKey,
  // Kanban cards can be dragged to another stage.
  kanbanDrag = false,
  // View-only module access: no cell editing, Add Row, fields, import or delete.
  readOnly = false,
}) => {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const { table, tableStatus, tableError, fields, fieldsStatus, fieldsError, valuesByRecord, valuesStatus, valuesError, } = useSelector((s) => s.globalTable);
  const products = useProducts(); // active products for the Product column (name shown, _id saved)
  const { columns: baseColumns, pinnedSet, togglePin, moveColumn, canMove } = useGlobalTableColumns(fields, products, table, { lockLocation: Boolean(locationPicker), mandalOptions: locationPicker?.mandalOptions, nativeOnly: Boolean(locationPicker) });
  // Assign To is editable for everyone with edit access: the lead is no longer given to its
  // creator automatically, so someone picks the sales user. The backend checks that the
  // chosen user is a sales employee who covers the lead's Mandal.
  const columns = useMemo(() => {
    if (readOnly) return baseColumns.map((column) => ({ ...column, editable: false }));
    return baseColumns;
  }, [baseColumns, readOnly]);
  const [showInlineAddRow, setShowInlineAddRow] = useState(false);
  // Multi-select delete: Mandal tables only (not "All my leads").
  // Checkboxes only show after "Delete multiple" is clicked in the toolbar.
  const canSelect = Boolean(table?.product && table?.location && !locationPicker && !readOnly);
  const [selectMode, setSelectMode] = useState(false);
  const selectable = canSelect && selectMode;
  const [selected, setSelected] = useState(() => new Set());
  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelected(new Set()); }, []);
  useEffect(() => {
    // Forget rows that are no longer listed (deleted, other page, refreshed).
    setSelected((prev) => {
      if (!prev.size) return prev;
      const listed = new Set(leads.map((l) => l._id));
      const next = new Set([...prev].filter((id) => listed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [leads]);
  const toggleSelect = useCallback((id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l._id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(leads.map((l) => l._id)));
  const [editRecordId, setEditRecordId] = useState(null); // lead open in the Global Drawer
  const [savedView, setView] = useViewPref(showViews ? viewKey : null, 'table');
  const view = showViews ? savedView : 'table';
  useEffect(() => { if (view !== 'table') exitSelectMode(); }, [view, exitSelectMode]);
  /* ------------------------------ loading ------------------------------- */
  useEffect(() => {
    if (tableId) dispatch(fetchTableById(tableId));
    else dispatch(fetchLeadTable());
  }, [tableId, dispatch]);

  useEffect(() => {
    if (table?._id) dispatch(fetchFields({ tableId: table._id }));
  }, [table?._id, dispatch]);

  // Refetch custom values (and calculated formula results) only when the SET of visible
  // leads changes, never after a single cell edit.
  const idsKey = useMemo(() => leads.map((l) => l._id).join(','), [leads]);
  useEffect(() => {
    if (table?._id && idsKey) dispatch(fetchValues({ tableId: table._id, recordIds: idsKey.split(',') }));
  }, [table?._id, idsKey, dispatch]);

  /* --------------------------- latest-value refs ------------------------- */
  const leadsRef = useRef(leads);
  const columnsRef = useRef(columns);
  const valuesRef = useRef(valuesByRecord);
  const tableRef = useRef(table);
  const hasFormulaRef = useRef(false);
  const onLeadUpdatedRef = useRef(onLeadUpdated);
  leadsRef.current = leads;
  columnsRef.current = columns;
  valuesRef.current = valuesByRecord;
  tableRef.current = table;
  hasFormulaRef.current = fields.some((f) => f.type === 'formula');
  onLeadUpdatedRef.current = onLeadUpdated;

  /* ----------------------------- local UI state -------------------------- */

  const [active, setActive] = useState(null); // { rowId, colKey }
  const [editing, setEditing] = useState(false);
  const [statuses, setStatuses] = useState({}); // { rowId: { colKey: { s, m } } }
  const [fieldModal, setFieldModal] = useState(null); // { mode, field? }
  const [confirm, setConfirm] = useState(null); // { type: 'row'|'field', ... }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [stageChange, setStageChange] = useState(null); // { rowId, colKey, leadName, from, to, direction }
  const [stageBusy, setStageBusy] = useState(false);
  const stageBusyRef = useRef(false); // blocks a second submit before React re-renders
  const containerRef = useRef(null);

  const colsByKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns]);
  const focusGrid = useCallback(() => containerRef.current?.focus({ preventScroll: true }), []);
  // Reload stored values + backend-calculated formula results for some records
  const refreshRecordValues = useCallback((recordIds) => {
    const t = tableRef.current;
    if (t?._id && recordIds.length) dispatch(fetchValues({ tableId: t._id, recordIds }));
  }, [dispatch]);

  // Formulas depend on numeric values: after one changes, recalculate that row on the backend
  const refreshFormulasFor = useCallback((col, rowId) => {
    if (hasFormulaRef.current && NUMERIC_FIELD_TYPES.includes(col.type)) refreshRecordValues([rowId]);
  }, [refreshRecordValues]);

  /* ------------------------------ global drawer -------------------------- */

  const openRecord = useCallback((lead) => {
    const id = typeof lead === 'string' ? lead : lead?._id;
    if (id) setEditRecordId(id);
  }, []);

  const closeDrawer = useCallback(() => {
    setEditRecordId(null);
    onCreateDrawerClose?.();
  }, [onCreateDrawerClose]);

  const handleDrawerSaved = useCallback((record, { mode }) => {
    if (mode === 'create') {
      onLeadCreated?.(record); // the new row appears; its values + formulas load with the list
      onRefreshLeads?.();
    } else {
      if (record) onLeadUpdatedRef.current?.(record);
      if (record?._id) refreshRecordValues([record._id]);
    }
  }, [onLeadCreated, onRefreshLeads, refreshRecordValues]);

  // The backend reported a partly applied save: reload instead of trusting local state
  const handleDrawerPartial = useCallback(() => {
    onRefreshLeads?.();
    if (editRecordId) refreshRecordValues([editRecordId]);
  }, [onRefreshLeads, editRecordId, refreshRecordValues]);

  // Click outside the grid clears the active cell
  useEffect(() => {
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setActive(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const setStatus = useCallback((rowId, colKey, st) => {
    setStatuses((prev) => {
      const row = { ...(prev[rowId] || {}) };
      if (st) row[colKey] = st; else delete row[colKey];
      return { ...prev, [rowId]: row };
    });
    if (st && st.s !== 'saving') {
      setTimeout(() => {
        setStatuses((prev) => {
          if (prev[rowId]?.[colKey] !== st) return prev; // replaced by a newer status
          const row = { ...prev[rowId] };
          delete row[colKey];
          return { ...prev, [rowId]: row };
        });
      }, st.s === 'saved' ? 1200 : 5000);
    }
  }, []);

  /* ------------------------------ navigation ----------------------------- */

  const move = useCallback((rowId, colKey, dir) => {
    const rows = leadsRef.current;
    const cols = columnsRef.current;
    let r = rows.findIndex((l) => l._id === rowId);
    let c = cols.findIndex((x) => x.key === colKey);
    if (r < 0 || c < 0) return;

    if (dir === 'down') r = Math.min(r + 1, rows.length - 1);
    else if (dir === 'up') r = Math.max(r - 1, 0);
    else if (dir === 'left') c = Math.max(c - 1, 0);
    else if (dir === 'right') c = Math.min(c + 1, cols.length - 1);
    else {
      // next / prev: jump to the next EDITABLE column, wrapping across rows
      const s = dir === 'next' ? 1 : -1;
      let rr = r;
      let cc = c + s;
      for (; ;) {
        if (cc >= cols.length) { rr += 1; cc = 0; } else if (cc < 0) { rr -= 1; cc = cols.length - 1; }
        if (rr < 0 || rr >= rows.length) return;
        if (canEditCell(cols[cc])) break;
        cc += s;
      }
      r = rr;
      c = cc;
    }
    setActive({ rowId: rows[r]._id, colKey: cols[c].key });
    setEditing(false);
  }, []);

  /* ------------------------------- saving -------------------------------- */

  const saveCell = useCallback(async (rowId, colKey, raw) => {
    const col = columnsRef.current.find((c) => c.key === colKey);
    const lead = leadsRef.current.find((l) => l._id === rowId);
    if (!col || !lead) return;

    // Product: a reference. Saves the product _id (null clears it), never the name or the object.
    // Handled before the generic value conversion so it works for a populated object, a raw id
    // and an empty selection alike.
    if (col.source === 'lead' && col.key === 'product') {
      const nextId = productId(raw);
      if (raw && !nextId) {
        const message = 'Invalid product';
        setStatus(rowId, colKey, { s: 'error', m: message });
        toast.error(message);
        return;
      }
      if ((productId(lead.product) || null) === nextId) return; // unchanged: no request
      setStatus(rowId, colKey, { s: 'saving' });
      try {
        const updated = await updateLead(rowId, { product: nextId });
        onLeadUpdatedRef.current?.(updated);
        setStatus(rowId, colKey, { s: 'saved' });
      } catch (err) {
        const message = apiMessage(err, 'Failed to update the product');
        setStatus(rowId, colKey, { s: 'error', m: message });
        toast.error(message);
      }
      return;
    }

    let next;
    try {
      next = toApiValue(col, raw);
    } catch (e) {
      setStatus(rowId, colKey, { s: 'error', m: e.message });
      toast.error(e.message);
      return;
    }

    // Mandal (Leads page): saves the Mandal node id; the API derives Product and Address.
    if (col.source === 'lead' && col.key === 'productLocation') {
      const nextId = raw ? String(raw) : '';
      if (!nextId || nextId === String(lead.productLocation?._id || lead.productLocation || '')) return;
      setStatus(rowId, colKey, { s: 'saving' });
      try {
        const updated = await updateLead(rowId, { productLocation: nextId });
        onLeadUpdatedRef.current?.(updated);
        setStatus(rowId, colKey, { s: 'saved' });
      } catch (err) {
        const message = apiMessage(err, 'Failed to update the Mandal');
        setStatus(rowId, colKey, { s: 'error', m: message });
        toast.error(message);
      }
      return;
    }

    // Pipeline stage: never saved directly. Classify the move and ask first.
    if (col.source === 'lead' && col.key === 'pipelineStage') {
      if (!next) return; // a lead always has a stage
      const from = normalizeStage(lead.pipelineStage);
      const verdict = classifyStageChange(from, next);
      if (verdict.direction === 'none' && verdict.allowed) return; // same stage: nothing to do
      if (!verdict.allowed) {
        toast.error(verdict.reason);
        return;
      }
      setStageChange({ rowId, colKey, leadName: lead.name, from, to: next, direction: verdict.direction });
      return;
    }

    const prev = col.source === 'lead'
      ? (col.type === 'assignee' ? (lead.assignedTo?._id || lead.assignedTo) : lead[col.key])
      : valuesRef.current[rowId]?.[col.key]?.value;

    if (canon(col, prev) === canon(col, next)) return; // nothing changed: no request

    setStatus(rowId, colKey, { s: 'saving' });
    try {
      if (col.source === 'lead') {
        const updated = await updateLead(rowId, { [col.key]: next ?? '' });
        onLeadUpdatedRef.current?.(updated);
      } else {
        await dispatch(saveCellValue({
          tableId: tableRef.current._id,
          recordId: rowId,
          fieldId: col.field._id,
          value: next,
        })).unwrap(); // optimistic; the thunk restores the old value on failure
      }
      setStatus(rowId, colKey, { s: 'saved' });
      refreshFormulasFor(col, rowId);
    } catch (err) {
      const message = errMessage(err, 'Failed to save');
      setStatus(rowId, colKey, { s: 'error', m: message });
      toast.error(message);
    }
  }, [dispatch, setStatus, refreshFormulasFor]);

  // Deletes ONE value. Never touches the Lead itself.
  const clearCell = useCallback(async (rowId, colKey) => {
    const col = columnsRef.current.find((c) => c.key === colKey);
    if (!col || !col.clearable) return;

    setStatus(rowId, colKey, { s: 'saving' });
    try {
      if (col.source === 'custom') {
        const entry = valuesRef.current[rowId]?.[col.key];
        if (!entry?._id) { setStatus(rowId, colKey, null); return; } // nothing stored
        await dispatch(deleteCellValue({ tableId: tableRef.current._id, recordId: rowId, fieldId: col.field._id, valueId: entry._id })).unwrap();
      } else {
        // Optional native fields only (assignee, district, mandal, product, follow-up date): clear through the Lead API
        const updated = await updateLead(rowId, { [col.key]: '' });
        onLeadUpdatedRef.current?.(updated);
      }
      setStatus(rowId, colKey, { s: 'saved' });
      refreshFormulasFor(col, rowId);
    } catch (err) {
      const message = errMessage(err, 'Failed to clear value');
      setStatus(rowId, colKey, { s: 'error', m: message });
      toast.error(message);
    }
  }, [dispatch, setStatus, refreshFormulasFor]);

  /* --------------------------- pipeline stage change ---------------------- */

  const cancelStageChange = () => {
    if (stageBusyRef.current) return; // a save is in flight: let it finish
    setStageChange(null);
    focusGrid();
  };

  const confirmStageChange = async () => {
    if (!stageChange || stageBusyRef.current) return; // no duplicate submissions
    const { rowId, colKey, from, to } = stageChange;
    stageBusyRef.current = true;
    setStageBusy(true);
    setStatus(rowId, colKey, { s: 'saving' });
    try {
      // expectedStage = the stage this screen was showing; the backend refuses the change if
      // the lead has been moved by someone else meanwhile (409) instead of overwriting it.
      const updated = await updateLead(rowId, { pipelineStage: to, expectedStage: from });
      onLeadUpdatedRef.current?.(updated); // the row shows what the SERVER saved
      setStatus(rowId, colKey, { s: 'saved' });
      toast.success(`Moved to ${stageLabel(to)}`);
    } catch (err) {
      const message = apiMessage(err, 'Failed to update the pipeline stage');
      setStatus(rowId, colKey, { s: 'error', m: message });
      toast.error(message);
      // Stale or concurrent change: show the real stage instead of guessing
      if (err?.response?.status === 409) onRefreshLeads?.();
    } finally {
      stageBusyRef.current = false;
      setStageBusy(false);
      setStageChange(null);
      focusGrid();
    }
  };

  // Kanban: a card dropped on another stage. Same checks and dialogs as the stage dropdown.
  const requestStageMove = useCallback((lead, to) => {
    const from = normalizeStage(lead.pipelineStage);
    const verdict = classifyStageChange(from, to);
    if (verdict.direction === 'none' && verdict.allowed) return;
    if (!verdict.allowed) { toast.error(verdict.reason); return; }
    setStageChange({ rowId: lead._id, colKey: 'pipelineStage', leadName: lead.name, from, to, direction: verdict.direction });
  }, []);

  /* ---------------------------- cell handlers ---------------------------- */

  const handlers = useMemo(() => ({
    onCellClick: (rowId, colKey) => {
      setActive({ rowId, colKey });
      const col = columnsRef.current.find((c) => c.key === colKey);
      const lead = leadsRef.current.find((l) => l._id === rowId);
      if (col?.type === 'name') { // the lead name is edited in the drawer, not in the cell
        setEditing(false);
        if (lead) openRecord(lead);
        return;
      }
      const locked = Boolean(stageLockMessage(col, lead));
      setEditing(Boolean(canEditCell(col) && !isToggle(col) && !locked)); // click -> edit mode (checkbox toggles in place)
    },
    onCommit: (rowId, colKey, raw, nav) => {
      setEditing(false);
      saveCell(rowId, colKey, raw);
      if (nav !== 'stay') {
        move(rowId, colKey, nav);
        focusGrid(); // the editor unmounted; keep keyboard focus in the grid
      }
    },
    onCancel: () => { setEditing(false); focusGrid(); },
    onClear: clearCell,
    onToggleBool: (rowId, colKey) => {
      const col = columnsRef.current.find((c) => c.key === colKey);
      if (!col) return;

      const lead = leadsRef.current.find((item) => item._id === rowId);

      const currentValue =
        col.source === 'lead'
          ? lead?.[col.key]
          : valuesRef.current[rowId]?.[col.key]?.value;

      const cur =
        currentValue === true ||
        currentValue === 'true' ||
        currentValue === 1;

      saveCell(rowId, colKey, !cur);
    },
    onOpenLead: (lead) => openRecord(lead),
  }), [saveCell, clearCell, move, focusGrid, openRecord]);

  const onKeyDown = (e) => {
    if (editing || !active) return;
    const { rowId, colKey } = active;
    const col = colsByKey[colKey];
    if (!col) return;

    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(rowId, colKey, 'down'); break;
      case 'ArrowUp': e.preventDefault(); move(rowId, colKey, 'up'); break;
      case 'ArrowLeft': e.preventDefault(); move(rowId, colKey, 'left'); break;
      case 'ArrowRight': e.preventDefault(); move(rowId, colKey, 'right'); break;
      case 'Tab': e.preventDefault(); move(rowId, colKey, e.shiftKey ? 'prev' : 'next'); break;
      case 'Enter':
      case 'F2':
        if (canEditCell(col) && isToggle(col)) { e.preventDefault(); handlers.onToggleBool(rowId, colKey); }
        else if (canEditCell(col)) {
          e.preventDefault();
          const lockMessage = stageLockMessage(col, leadsRef.current.find((l) => l._id === rowId));
          if (lockMessage) toast(lockMessage, { id: 'stage-locked' }); else setEditing(true);
        }
        else if (col.type === 'name') {
          const lead = leadsRef.current.find((l) => l._id === rowId);
          if (lead) openRecord(lead);
        }
        break;
      case ' ':
        if (canEditCell(col) && isToggle(col)) { e.preventDefault(); handlers.onToggleBool(rowId, colKey); }
        break;
      case 'Delete':
      case 'Backspace':
        if (col.clearable && col.editable) { e.preventDefault(); clearCell(rowId, colKey); }
        break;
      case 'Escape': setActive(null); break;
      default: break;
    }
  };

  /* ------------------------------ row delete ------------------------------ */

  const requestRowDelete = useCallback((lead) => setConfirm({ type: 'row', lead }), []);

  const confirmRowsDelete = async () => {
    const ids = confirm.ids;
    setConfirmBusy(true);
    try {
      const result = await bulkDeleteGlobalTableRecords(tableRef.current._id, ids);
      ids.forEach((id) => dispatch(recordRemoved(id)));
      toast.success(`Deleted ${result.deleted} lead${result.deleted !== 1 ? 's' : ''}`);
      exitSelectMode();
      setConfirm(null);
      onRefreshLeads?.();
    } catch (err) {
      toast.error(errMessage(err, 'Failed to delete the selected leads'));
    } finally {
      setConfirmBusy(false);
    }
  };

  const confirmRowDelete = async () => {
    const { lead } = confirm;
    setConfirmBusy(true);
    try {
      await deleteGlobalTableRecord(tableRef.current._id, lead._id);
      dispatch(recordRemoved(lead._id));
      toast.success(tableRef.current.product ? 'Record removed from this table' : 'Lead deleted');
      onLeadDeleted?.(lead._id); // parent removes the row only after success
      setConfirm(null);
    } catch (err) {
      toast.error(errMessage(err, 'Failed to delete lead'));
    } finally {
      setConfirmBusy(false);
    }
  };

  /* ------------------------------ field actions --------------------------- */

  const openEditField = useCallback((field) => setFieldModal({ mode: 'edit', field }), []);
  const requestFieldDelete = useCallback((field) => setConfirm({ type: 'field', field, force: false }), []);

  const submitField = async (payload) => {
    try {
      let saved;
      if (fieldModal.mode === 'edit') {
        saved = await dispatch(updateField({ id: fieldModal.field._id, payload, tableId: table._id })).unwrap();
        toast.success('Field updated');
      } else {
        saved = await dispatch(createField({ ...payload, tableId: table._id })).unwrap();
        toast.success('Field created');
      }
      setFieldModal(null);
      // a new / changed formula, or a field moved to / from an activity form (read-only column
      // of the latest entry's value), needs its values reloaded for the rows already on screen
      const movedShowIn = fieldModal.mode === 'edit' && (saved?.appliesTo || 'lead') !== (fieldModal.field?.appliesTo || 'lead');
      if (saved?.type === 'formula' || movedShowIn) refreshRecordValues(leadsRef.current.map((l) => l._id));
    } catch (err) {
      if (err?.details?.options) {
        throw { ...err, message: `${err.message}: ${err.details.options.join(', ')}` };
      }
      throw err; // the modal stays open and shows it
    }
  };

  const confirmFieldDelete = async () => {
    setConfirmBusy(true);
    try {
      await dispatch(deleteField({ id: confirm.field._id, force: confirm.force, tableId: table._id })).unwrap();
      toast.success('Field deleted');
      setConfirm(null);
    } catch (err) {
      if (err?.status === 409 && err.details?.valueCount) {
        // Backend refused: the field has stored values. Ask again, explicitly.
        setConfirm((c) => ({ ...c, force: true, valueCount: err.details.valueCount }));
      } else {
        toast.error(errMessage(err, 'Failed to delete field'));
      }
    } finally {
      setConfirmBusy(false);
    }
  };

  /* --------------------------- field modal helpers ------------------------ */

  const roleOptions = useMemo(
    () => [...new Set(Object.values(userLookup || {}).map((u) => u?.role).filter(Boolean))].sort(),
    [userLookup]
  );
  const numericFieldKeys = useMemo(
    () => fields.filter((f) => isLeadField(f) && NUMERIC_FIELD_TYPES.includes(f.type)).map((f) => f.key),
    [fields]
  );

  /* --------------------------- sticky pin offsets ------------------------- */

  const thRefs = useRef({});
  const [pinnedLeftByKey, setPinnedLeftByKey] = useState({});
  const lastPinnedKey = useMemo(() => {
    const pinned = columns.filter((c) => pinnedSet.has(c.key));
    return pinned.length ? pinned[pinned.length - 1].key : null;
  }, [columns, pinnedSet]);

  useLayoutEffect(() => {
    const offsets = {};
    let running = selectable ? SELECT_COL_WIDTH : 0; // pinned columns start after the checkbox column
    columns.forEach((col) => {
      if (!pinnedSet.has(col.key)) return;
      offsets[col.key] = running;
      running += thRefs.current[col.key]?.offsetWidth || col.width;
    });
    setPinnedLeftByKey((prev) => (shallowEqual(prev, offsets) ? prev : offsets));
  }, [columns, pinnedSet, loading, tableStatus, fieldsStatus, leads.length, selectable]);

  /* -------------------------------- render -------------------------------- */

  if ((tableStatus === 'idle' || tableStatus === 'loading') && !table) {
    return <div className="border border-violet-100 rounded-xl p-6 text-xs text-violet-400">Loading table…</div>;
  }

  if (tableStatus === 'failed') {
    return (
      <div className="border border-red-100 bg-red-50 rounded-xl p-6 text-xs text-red-700 flex items-center justify-between">
        <span>{tableError || 'Failed to load the lead table'}</span>
        <button type="button" onClick={() => dispatch(tableId ? fetchTableById(tableId) : fetchLeadTable())} className="px-3 py-1 rounded-lg border border-red-200 hover:bg-red-100">Retry</button>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="border border-violet-100 rounded-xl py-10">
        <EmptyState
          icon={<span className="text-4xl">▦</span>}
          title="No lead table configured"
          message="An admin needs to set up the Global Table for leads before custom fields can be used."
          action={{
            label: 'Set up lead table',
            onClick: async () => {
              try { await dispatch(createLeadTable()).unwrap(); toast.success('Lead table created'); }
              catch (err) { toast.error(errMessage(err, 'Failed to create the table')); }
            },
          }}
        />
      </div>
    );
  }

  const colCount = columns.length + 1 + (selectable ? 1 : 0);
  const firstCol = columns[0];
  const firstPinned = firstCol && pinnedSet.has(firstCol.key);
  const showSkeleton = loading || (fieldsStatus === 'loading' && fields.length === 0);
  const canCreate = !locationPicker && !readOnly;
  const drawerOpen = Boolean(editRecordId) || (canCreate && createDrawerOpen);

  return (
    <div className="border border-violet-100 rounded-xl overflow-hidden">
      {showViews && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-violet-100 bg-white">
          <span className="text-xs text-gray-500">
            {VIEW_OPTIONS.find((v) => v.value === view)?.label} view · {leads.length} lead{leads.length !== 1 ? 's' : ''}{view !== 'table' ? ' on this page' : ''}
          </span>
          <ViewSwitcher value={view} onChange={setView} />
        </div>
      )}
      {/* Template / Import / Export: Mandal tables only (not "All my leads") */}
      {view === 'table' && table.product && table.location && !locationPicker && (
        <GlobalTableExcelActions
          tableId={table._id}
          selectMode={selectMode}
          onToggleSelectMode={readOnly ? undefined : () => (selectMode ? exitSelectMode() : setSelectMode(true))}
          canImport={!readOnly}
          onImported={() => {
            onRefreshLeads?.();
            refreshRecordValues(leadsRef.current.map((l) => l._id));
          }}
        />
      )}
      {selectable && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-violet-100 bg-violet-600 text-white text-xs" role="status">
          <span className="font-semibold">
            {selected.size ? `${selected.size} selected` : 'Select the rows to delete'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => setConfirm({ type: 'rows', ids: [...selected] })}
              className="rounded-lg bg-white/15 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-white/15 px-2.5 py-1 font-semibold transition-colors"
            >
              Delete selected
            </button>
            <button type="button" onClick={exitSelectMode} className="rounded-lg hover:bg-white/15 px-2.5 py-1">
              Cancel
            </button>
          </div>
        </div>
      )}
      {(fieldsStatus === 'failed' || valuesStatus === 'failed') && (
        <div role="alert" className="px-3 py-2 text-xs bg-red-50 text-red-700 border-b border-red-100">
          {fieldsStatus === 'failed' ? fieldsError : valuesError} — custom field data may be missing.
        </div>
      )}

      {view !== 'table' && (
        showSkeleton ? (
          <div className="p-6 text-xs text-violet-400">Loading leads…</div>
        ) : view === 'kanban' ? (
          <StageKanban
            leads={leads}
            userLookup={userLookup}
            selectedId={editRecordId}
            onOpen={openRecord}
            onMove={kanbanDrag && !readOnly ? requestStageMove : undefined}
          />
        ) : (
          <LeadCalendarPanel leads={leads} mode={view} userLookup={userLookup} onOpen={openRecord} noun="lead" />
        )
      )}

      {view === 'table' && (
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="overflow-auto max-h-[70vh] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-300"
      >
        <table className="data-table min-w-full" aria-label="Leads">
          <thead>
            <tr>
              {selectable && (
                <th scope="col" className="sticky top-0 left-0 z-40 bg-violet-50 text-center" style={{ width: SELECT_COL_WIDTH }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    disabled={!leads.length}
                    aria-label="Select all rows on this page"
                    className="w-4 h-4 accent-violet-600 cursor-pointer"
                  />
                </th>
              )}
              {columns.map((col) => (
                <GlobalTableHeader
                  key={col.key}
                  col={col}
                  innerRef={(el) => { thRefs.current[col.key] = el; }}
                  pinned={pinnedSet.has(col.key)}
                  leftOffset={pinnedLeftByKey[col.key]}
                  isLastPinned={col.key === lastPinnedKey}
                  canMoveLeft={canMove(col.key, -1)}
                  canMoveRight={canMove(col.key, 1)}
                  onTogglePin={togglePin}
                  onMove={moveColumn}
                  onEdit={readOnly ? undefined : openEditField}
                  onDelete={readOnly ? undefined : requestFieldDelete}
                />
              ))}
              {/* Top-right + : ADD FIELD (column) */}
              <th scope="col" className={`sticky top-0 right-0 bg-violet-50 z-40 text-center ${rowAction ? 'w-20' : 'w-12'}`}>
                {!locationPicker && !readOnly && <button
                  type="button"
                  onClick={() => setFieldModal({ mode: 'create' })}
                  title="Add field"
                  aria-label="Add field"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-violet-500 hover:bg-violet-100 hover:text-violet-700 transition-colors"
                >
                  <Plus size={16} />
                </button>}
              </th>
            </tr>
          </thead>

          {showSkeleton ? (
            <TableSkeleton colCount={colCount} />
          ) : (
            <tbody>
              {leads.map((lead) => (
                <GlobalTableRow
                  key={lead._id}
                  lead={lead}
                  columns={columns}
                  entries={valuesByRecord[lead._id] || EMPTY}
                  activeColKey={active?.rowId === lead._id ? active.colKey : null}
                  editingColKey={editing && active?.rowId === lead._id ? active.colKey : null}
                  statuses={statuses[lead._id] || EMPTY}
                  pinnedSet={pinnedSet}
                  pinnedLeftByKey={pinnedLeftByKey}
                  lastPinnedKey={lastPinnedKey}
                  userLookup={userLookup}
                  h={handlers}
                  onDeleteRequest={readOnly ? undefined : requestRowDelete}
                  deleting={confirmBusy && confirm?.type === 'row' && confirm.lead._id === lead._id}
                  rowAction={rowAction}
                  selectable={selectable}
                  selected={selected.has(lead._id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
              {canCreate && showInlineAddRow && (
                <GlobalTableInlineAddRow
                  key={table._id}
                  tableId={table._id}
                  columns={columns}
                  pinnedSet={pinnedSet}
                  pinnedLeftByKey={pinnedLeftByKey}
                  lastPinnedKey={lastPinnedKey}
                  userLookup={userLookup}
                  onCancel={() => setShowInlineAddRow(false)}
                  onCreated={(record) => {
                    onLeadCreated?.(record);
                    onRefreshLeads?.();
                  }}
                  onOpenFullForm={onOpenCreateDrawer ? () => { setShowInlineAddRow(false); onOpenCreateDrawer(); } : undefined}
                  onRefreshLeads={onRefreshLeads}
                  leadingCell={selectable}
                />
              )}
              {/* Bottom-left + : ADD ROW (inline) */}
              {canCreate && <tr>
                {selectable && <td className="sticky left-0 z-20" style={{ isolation: 'isolate', backgroundColor: '#ffffff' }} />}
                <td
                  style={firstPinned ? { position: 'sticky', left: selectable ? SELECT_COL_WIDTH : 0, zIndex: 20, isolation: 'isolate', backgroundColor: '#ffffff' } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => setShowInlineAddRow(true)}
                    title="Add row (create a lead)"
                    aria-label="Add row"
                    className="inline-flex items-center gap-1 px-1.5 h-7 rounded-lg text-xs text-violet-400 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </td>
                <td colSpan={columns.length} />
              </tr>}
            </tbody>
          )}
        </table>
      </div>
      )}

      {view === 'table' && !showSkeleton && leads.length === 0 && (
        <div className="py-10">
          <EmptyState
            icon={<span className="text-4xl">◎</span>}
            title="No Leads Yet"
            message={canCreate
              ? 'Create your first lead to start tracking your sales pipeline.'
              : readOnly ? 'There are no leads here yet.' : "Leads are created inside a Mandal's table — open one on the left."}
            action={canCreate ? { label: '+ Create Lead', onClick: onOpenCreateDrawer } : undefined}
          />
        </div>
      )}

      {drawerOpen && (
        <GlobalDrawer
          key={editRecordId || 'create'}
          isOpen
          mode={editRecordId ? 'edit' : 'create'}
          tableId={table._id}
          recordId={editRecordId || undefined}
          columns={columns}
          userLookup={userLookup}
          onClose={closeDrawer}
          onSaved={handleDrawerSaved}
          onPartial={handleDrawerPartial}
          activityTypes={drawerActivities}
          readOnly={readOnly}
        />
      )}

      {fieldModal && (
        <GlobalTableFieldModal
          mode={fieldModal.mode}
          field={fieldModal.field}
          roleOptions={roleOptions}
          numericFieldKeys={numericFieldKeys}
          onSubmit={submitField}
          onClose={() => setFieldModal(null)}
        />
      )}

      {/* Into Visit ... Feedback: ask for Assign To + Next Follow-up and save them with the stage */}
      {stageChange && needsFollowUpDialog(stageChange.to) && (
        <StageChangeDialog
          lead={leadsRef.current.find((l) => l._id === stageChange.rowId) || { _id: stageChange.rowId, name: stageChange.leadName }}
          from={stageChange.from}
          to={stageChange.to}
          onCancel={cancelStageChange}
          onSaved={(updated) => {
            onLeadUpdatedRef.current?.(updated);
            setStatus(stageChange.rowId, stageChange.colKey, { s: 'saved' });
            setStageChange(null);
            focusGrid();
          }}
        />
      )}

      {stageChange && !needsFollowUpDialog(stageChange.to) && (
        <ConfirmDialog
          title={stageChange.direction === 'promotion' ? 'Promote this lead?' : stageChange.direction === 'demotion' ? 'Demote this lead?' : 'Change pipeline stage?'}
          confirmLabel={stageChange.direction === 'promotion' ? 'Promote' : stageChange.direction === 'demotion' ? 'Demote' : 'Change stage'}
          busy={stageBusy}
          onConfirm={confirmStageChange}
          onCancel={cancelStageChange}
        >
          <p>
            <strong>{stageChange.leadName}</strong> will be {stageChange.direction === 'demotion' ? 'demoted' : stageChange.direction === 'promotion' ? 'promoted' : 'moved'} from{' '}
            <strong>{stageLabel(stageChange.from)}</strong> to <strong>{stageLabel(stageChange.to)}</strong>.
          </p>
          {isStageLocked(stageChange.to) && (
            <p>{stageLabel(stageChange.to)} is a final stage: the stage cannot be changed afterwards.</p>
          )}
        </ConfirmDialog>
      )}

      {confirm?.type === 'row' && (
        <ConfirmDialog
          title="Delete this lead?"
          confirmLabel="Delete lead"
          busy={confirmBusy}
          onConfirm={confirmRowDelete}
          onCancel={() => setConfirm(null)}
        >
          <p>
            <strong>{confirm.lead.name}</strong> will be permanently deleted. This removes the lead itself,
            not just a cell, together with its custom field values and linked visits, deals and quotations. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}

      {confirm?.type === 'rows' && (
        <ConfirmDialog
          title={`Delete ${confirm.ids.length} lead${confirm.ids.length !== 1 ? 's' : ''}?`}
          confirmLabel={`Delete ${confirm.ids.length} lead${confirm.ids.length !== 1 ? 's' : ''}`}
          busy={confirmBusy}
          onConfirm={confirmRowsDelete}
          onCancel={() => setConfirm(null)}
        >
          <p>
            The selected leads will be permanently deleted with their custom field values and linked visits,
            deals and quotations. If any of them cannot be deleted, none are. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}

      {confirm?.type === 'field' && (
        <ConfirmDialog
          title={confirm.force ? 'Delete field and its values?' : 'Delete field?'}
          confirmLabel={confirm.force ? 'Delete field and values' : 'Delete field'}
          busy={confirmBusy}
          onConfirm={confirmFieldDelete}
          onCancel={() => setConfirm(null)}
        >
          {confirm.force ? (
            <p>
              <strong>{confirm.field.label}</strong> has {confirm.valueCount} stored value{confirm.valueCount === 1 ? '' : 's'}.
              Deleting it permanently removes the field and all of those values. Leads are not affected.
            </p>
          ) : (
            <p>
              The field <strong>{confirm.field.label}</strong> will be removed from the table. If it already has
              stored values you will be asked to confirm again before they are deleted. Leads are not affected.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
};

export default GlobalTable;