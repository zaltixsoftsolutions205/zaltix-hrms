import { useCallback, useEffect, useMemo, useState } from 'react';
import { appliesToLabel, isLeadField } from '../components/GlobalTable/fieldTypes';

/**
 * Builds the grid's column list from:
 *   - native Lead columns (read/written through the Lead API)
 *   - Global Table custom fields (read/written through the Global Table API)
 *
 * Order and pinning are UI state, persisted per browser in localStorage.
 * (Native Lead columns have no backend `position`, so one combined order can
 * only live on the client.) Pinned columns are always rendered first.
 */

const STORAGE_KEY = 'myspace.globalTable.lead.layout.v1';

/* ---------------------------------------------------------------------------
 * Pipeline stages. The ORDER mirrors the backend (models/Lead.js PIPELINE_STAGES): a later
 * position is a promotion, an earlier one a demotion. The values are what the API receives;
 * the labels are display only. The backend stays authoritative: it validates the value, refuses
 * to leave a terminal stage, and rejects a stale change (409). This copy only decides what the
 * UI offers and how the confirmation dialog is worded.
 * ------------------------------------------------------------------------- */
export const PIPELINE_STAGES = ['lead', 'visit', 'demo', 'data-update', 'registration', 'feedback', 'lead-won', 'lead-lost'];
export const TERMINAL_STAGES = ['lead-won', 'lead-lost'];

export const STAGE_LABELS = {
  lead: 'Lead',
  visit: 'Visit',
  demo: 'Demo',
  'data-update': 'Data Update',
  registration: 'Registration',
  feedback: 'Feedback',
  'lead-won': 'Lead Won',
  'lead-lost': 'Lead Lost',
};

export const PIPELINE_STAGE_OPTIONS = PIPELINE_STAGES.map((value) => ({ value, label: STAGE_LABELS[value] }));

// Names used before the 8-stage pipeline; the backend reads them as the new stage until migrated.
const LEGACY_STAGES = { converted: 'lead-won', 'closed-won': 'lead-won', 'closed-lost': 'lead-lost' };
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export const normalizeStage = (stage) => {
  if (!stage) return 'lead';
  return has(LEGACY_STAGES, stage) ? LEGACY_STAGES[stage] : stage;
};

export const stageLabel = (stage) => {
  const s = normalizeStage(stage);
  return has(STAGE_LABELS, s) ? STAGE_LABELS[s] : String(stage || '');
};

export const isStageLocked = (stage) => TERMINAL_STAGES.includes(normalizeStage(stage));

// Mirrors backend models/Lead.js. A won lead is a client: CRM › Clients can send it to an
// activity page (wonActivityStage) while its pipelineStage stays lead-won.
export const OPEN_STAGES = PIPELINE_STAGES.filter((s) => !TERMINAL_STAGES.includes(s));
export const ACTIVITY_STAGES = ['visit', 'demo', 'data-update', 'registration', 'feedback'];
// Where a lost lead can be reworked to: an open stage, or straight back to Lead Won.
export const REWORK_STAGES = [...OPEN_STAGES, 'lead-won'];
export const isClient = (lead) => normalizeStage(lead?.pipelineStage) === 'lead-won';
export const isLostLead = (lead) => normalizeStage(lead?.pipelineStage) === 'lead-lost';

/** The activity page a lead is on: its stage while open, wonActivityStage while won, none while lost. */
export const activityStageOf = (lead) => {
  const stage = normalizeStage(lead?.pipelineStage);
  if (stage === 'lead-won') return lead?.wonActivityStage || null;
  if (stage === 'lead-lost') return null;
  return stage;
};

/**
 * { allowed, direction: 'promotion' | 'demotion' | 'none' | 'change', reason? }
 *   none      same stage (nothing to save)
 *   change    the current stage is not a known one, so there is no order to compare
 * Any number of steps is allowed; only leaving a terminal stage is not.
 */
export const classifyStageChange = (from, to) => {
  if (typeof to !== 'string' || !PIPELINE_STAGES.includes(to)) {
    return { allowed: false, direction: 'none', reason: 'Choose a valid pipeline stage.' };
  }
  const current = normalizeStage(from);
  if (current === to) return { allowed: true, direction: 'none' };
  if (TERMINAL_STAGES.includes(current)) {
    return {
      allowed: false,
      direction: 'none',
      reason: current === 'lead-won'
        ? 'This lead is a client (Lead Won). Convert it to Lead Lost from CRM › Clients.'
        : 'This lead is Lead Lost. Rework it from CRM › Clients › Lost Clients.',
    };
  }
  const fromIndex = PIPELINE_STAGES.indexOf(current);
  if (fromIndex === -1) return { allowed: true, direction: 'change' };
  return { allowed: true, direction: PIPELINE_STAGES.indexOf(to) > fromIndex ? 'promotion' : 'demotion' };
};

// Native Lead columns, in the backend's field order: name, assignedTo, district, mandal, product,
// pipelineStage, followUpDate. (createdAt / updatedAt exist on the model but are intentionally not
// grid columns.) This list is the ONE definition of the Lead columns: nothing else adds or hides them.
export const NATIVE_COLUMNS = [
  {
    key: 'name',
    label: 'Name',
    type: 'name',
    createType: 'text',
    requiredOnCreate: true,
    editable: true, // in the drawer and the Add Row
    cellEditable: false, // not in a table cell: clicking it opens the drawer
    clearable: false,
    width: 220,
  },
  {
    key: 'assignedTo',
    label: 'Assign To',
    type: 'assignee',
    createType: 'assignee',
    editable: true,
    clearable: true, // optional: a sales user picked later; empty = "not assigned"
    width: 170,
  },
  {
    key: 'district',
    label: 'District',
    type: 'text',
    createType: 'text',
    editable: true,
    clearable: true,
    width: 140,
  },
  {
    key: 'mandal',
    label: 'Mandal',
    type: 'text',
    createType: 'text',
    editable: true,
    clearable: true,
    width: 140,
  },
  {
    key: 'product',
    label: 'Product',
    type: 'product', // reference to a Product: shows its name, saves its _id (see productRef.js)
    createType: 'product',
    editable: true,
    clearable: true, // product is optional on the Lead
    width: 180,
  },
  {
    key: 'pipelineStage',
    label: 'Pipeline Stage',
    type: 'stage',
    createType: 'stage',
    options: PIPELINE_STAGE_OPTIONS, // the 8 stages, in pipeline order (value = API value)
    editable: true, // a change goes through the Promote / Demote confirmation in GlobalTable
    clearable: false, // a lead always has a stage
    width: 160,
  },
  {
    key: 'followUpDate',
    label: 'Next Follow-up',
    type: 'followup', // date + optional time
    createType: 'followup',
    editable: true,
    clearable: true,
    width: 160,
  },
].map((c) => ({
  source: 'lead',
  editable: false,
  clearable: false,
  ...c,
}));


const NON_EDITABLE_CUSTOM = ['formula', 'reference'];

export const SYSTEM_MANAGED_LEAD_FIELDS = ['product', 'district', 'mandal'];

// A field shown in an activity form (Show in: Visits, Demos, ...): a READ-ONLY
// column holding the value of the lead's latest entry (set by the backend).
const toActivityColumn = (field) => ({
  key: field._id,
  label: `${field.label} (${appliesToLabel(field.appliesTo)})`,
  source: 'custom',
  type: field.type,
  field,
  editable: false,
  clearable: false,
  activityOnly: true,
  systemManaged: false,
  width: field.type === 'multi-select' ? 200 : 160,
});

const toCustomColumn = (field) => (!isLeadField(field) ? toActivityColumn(field) : {
  key: field._id,
  label: field.label,
  source: 'custom',
  type: field.type,
  field,
  editable: !field.systemManaged && !NON_EDITABLE_CUSTOM.includes(field.type),
  clearable: !field.systemManaged && !field.required,
  systemManaged: Boolean(field.systemManaged),
  width: field.type === 'multi-select' ? 200 : 160,
});

const readLayout = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      order: Array.isArray(raw?.order) ? raw.order : [],
      pinned: Array.isArray(raw?.pinned) ? raw.pinned : ['name'],
    };
  } catch {
    return { order: [], pinned: ['name'] };
  }
};

/**
 * `product` = { options: [{ value: id, label: name }], status: 'loading' | 'ready' | 'failed' }
 * from useProducts(). It is attached to the product column only; other entities and all other
 * columns are unaffected, and omitting it keeps the previous behaviour.
 */
/**
 * `options.lockLocation`: Product / Address / Mandal come from a picked Mandal
 * (Leads page), so Product and Address are read-only like in a
 * product/location table.
 * `options.mandalOptions` ([{ value, label, title }]): with lockLocation, the
 * Mandal column becomes a dropdown of these Mandals (saved as productLocation).
 * `options.nativeOnly`: only the Lead model's own fields, no custom columns
 * (Leads page "All my leads", which mixes leads from many tables).
 */
export const useGlobalTableColumns = (fields, product, table, { lockLocation = false, mandalOptions, nativeOnly = false } = {}) => {
  const [layout, setLayout] = useState(readLayout);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* storage unavailable: layout simply won't persist */
    }
  }, [layout]);

  const productOptions = product ? product.options : undefined;
  const productsState = product ? product.status : undefined;
  const scoped = Boolean(table?.product && table?.location);
  const locked = scoped || lockLocation;
  const baseColumns = useMemo(() => {
    const natives = NATIVE_COLUMNS.map((c) => {
      let column = c.key === 'product' && productOptions !== undefined ? { ...c, options: productOptions, productsState } : c;
      if (lockLocation && !scoped && mandalOptions && c.key === 'mandal') {
        return {
          ...c,
          key: 'productLocation',
          type: 'mandal',
          options: mandalOptions,
          createType: null, // picked in the create drawer
          editable: true,
          clearable: false,
        };
      }
      if (locked && SYSTEM_MANAGED_LEAD_FIELDS.includes(c.key)) {
        column = {
          ...column,
          label: c.key === 'district' ? 'Address' : column.label,
          createType: null,
          editable: false,
          clearable: false,
          systemManaged: true,
        };
      }
      return column;
    });
    // Activity form fields (Show in: Visits, Demos, ...) are read-only columns.
    return [...natives, ...(nativeOnly ? [] : fields.map(toCustomColumn))];
  }, [fields, productOptions, productsState, scoped, locked, lockLocation, mandalOptions, nativeOnly]);

  // Saved order, minus columns that no longer exist, plus the columns the saved order has never
  // seen. (Pruning is derived, never written back, so a slow field load can't wipe the layout.
  // This is also why a saved layout that still names removed columns such as phone or email is
  // harmless.)
  //
  // A saved order is the FULL list as it was when the user last moved a column. A native column
  // added later (Mandal, Product) is missing from it. It used to be appended at the very end,
  // behind every custom field, so it looked like the column did not exist. Now a missing native
  // column slots in right after its nearest earlier native neighbour (Mandal after District,
  // Product after Mandal). A new custom field still goes to the end.
  const orderedKeys = useMemo(() => {
    const existing = new Set(baseColumns.map((c) => c.key));
    const kept = layout.order.filter((k) => existing.has(k));
    const placed = [...kept];
    // The natives actually built (in NATIVE_COLUMNS order); on the Leads page the
    // Mandal column's key is productLocation, so the static list cannot be used.
    const nativeKeys = baseColumns.filter((c) => c.source === 'lead').map((c) => c.key);
    nativeKeys.forEach((key, index) => {
      if (placed.includes(key)) return;
      let at = 0; // no earlier native placed: front
      for (let i = index - 1; i >= 0; i -= 1) {
        const p = placed.indexOf(nativeKeys[i]);
        if (p !== -1) { at = p + 1; break; }
      }
      placed.splice(at, 0, key);
    });
    const placedSet = new Set(placed);
    return [...placed, ...baseColumns.map((c) => c.key).filter((k) => !placedSet.has(k))];
  }, [baseColumns, layout.order]);

  const pinnedSet = useMemo(() => {
    const existing = new Set(baseColumns.map((c) => c.key));
    return new Set(layout.pinned.filter((k) => existing.has(k)));
  }, [baseColumns, layout.pinned]);

  // Pinned columns first (keeps sticky offsets contiguous), then the rest.
  const columns = useMemo(() => {
    const byKey = Object.fromEntries(baseColumns.map((c) => [c.key, c]));
    const ordered = orderedKeys.map((k) => byKey[k]).filter(Boolean);
    return [...ordered.filter((c) => pinnedSet.has(c.key)), ...ordered.filter((c) => !pinnedSet.has(c.key))];
  }, [baseColumns, orderedKeys, pinnedSet]);

  const togglePin = useCallback((key) => {
    setLayout((prev) => {
      const pinned = prev.pinned.includes(key) ? prev.pinned.filter((k) => k !== key) : [...prev.pinned, key];
      return { ...prev, pinned };
    });
  }, []);

  // Neighbour within the same group (pinned / unpinned) in the given direction
  const neighbourOf = useCallback(
    (key, dir) => {
      const isPinned = pinnedSet.has(key);
      const group = orderedKeys.filter((k) => pinnedSet.has(k) === isPinned);
      const idx = group.indexOf(key);
      return group[idx + dir];
    },
    [orderedKeys, pinnedSet]
  );

  const canMove = useCallback((key, dir) => neighbourOf(key, dir) !== undefined, [neighbourOf]);

  const moveColumn = useCallback(
    (key, dir) => {
      const other = neighbourOf(key, dir);
      if (other === undefined) return;
      const next = [...orderedKeys];
      const i = next.indexOf(key);
      const j = next.indexOf(other);
      [next[i], next[j]] = [next[j], next[i]];
      setLayout((prev) => ({ ...prev, order: next }));
    },
    [neighbourOf, orderedKeys]
  );

  return { columns, pinnedSet, togglePin, moveColumn, canMove };
};