/**
 * globalTableImportService.js
 * ---------------------------------------------------------------------------
 * Excel Template / Import / Export for product/location (Mandal) lead tables.
 *
 * Columns are built from the table itself every time (`buildColumns`):
 *   - Lead ID                 empty -> create a new lead, filled -> update it
 *   - Name, Assign To (Employee ID), Pipeline Stage, Next Follow-up
 *   - every active custom field of THIS table (formula / reference /
 *     system-managed fields are export-only)
 *   - Address, Mandal, Product: export-only; the table sets them from where it
 *     sits in the product tree, so an import never carries them
 *
 * Import rules
 *   - a header that matches no column of the table fails the import; table
 *     columns missing from the file are simply not touched
 *   - a required column missing from the file fails the import
 *   - every cell of every row is validated by type before anything is written;
 *     ONE bad cell fails the whole import and every problem is reported as
 *     { row, column, field, value, message }
 *   - all rows are then written in ONE MongoDB transaction (all or nothing)
 *   - at most MAX_ROWS rows per file; duplicates are allowed
 *   - Assign To: an employee ID. Empty -> the importer on create, unchanged on
 *     update. Sales roles may only assign themselves or a colleague on the Mandal.
 *   - Pipeline Stage: any stage; empty -> "Lead" on create, unchanged on update.
 *     Updates follow the normal stage rules (won / lost leads are locked).
 *   - Dates are DD-MM-YYYY.
 *
 * Writes go to the Lead / GlobalTableValue models directly (one insertMany and
 * a few bulkWrites) instead of one leadController call per row: 1,000 rows of
 * per-row handlers would not fit in a transaction. The checks createLead and
 * updateLead apply are re-done here, row by row, before the transaction.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableField = require('../models/GlobalTableField');
const GlobalTableValue = require('../models/GlobalTableValue');
const crmScope = require('./crmScopeService');
const { isLeadAssigneeRole } = require('./leadAssigneeService');
const tableService = require('./globalTableService');

const { ServiceError } = tableService;

const MAX_ROWS = 1000;
const MAX_REPORTED_ERRORS = 500;
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const NOT_IMPORTABLE_TYPES = ['formula', 'reference'];

const STAGE_LABELS = {
  lead: 'Lead',
  visit: 'Visit',
  demo: 'Demo',
  'data-update': 'Data Update',
  registration: 'Registration',
  feedback: 'Feedback',
  'lead-won': 'Lead Won',
  'lead-lost': 'Lead Lost',
};

const normHeader = (h) => String(h ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const asText = (v) => (typeof v === 'string' ? v.trim() : String(v));

/* ------------------------------- dates ---------------------------------- */

/** 'DD-MM-YYYY' (also / or .) -> 'YYYY-MM-DD', or null when not a real day. */
const parseDayMonthYear = (value) => {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(asText(value));
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
};

/**
 * 'DD-MM-YYYY HH:mm' -> Date (local server time), or null. A plain 'DD-MM-YYYY'
 * means 00:00: Excel date cells at midnight reach the server without a time.
 */
const parseDayMonthYearTime = (value) => {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(asText(value));
  if (!m) return null;
  if (m[4] === undefined) { m[4] = '0'; m[5] = '00'; }
  const iso = parseDayMonthYear(`${m[1]}-${m[2]}-${m[3]}`);
  const h = Number(m[4]);
  const min = Number(m[5]);
  if (!iso || h > 23 || min > 59) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, min);
};

const pad = (n) => String(n).padStart(2, '0');
const formatDay = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
};
const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ------------------------------- columns -------------------------------- */

const TYPE_HELP = {
  text: 'Text',
  email: 'Email address',
  number: 'Number',
  currency: 'Amount (2 decimals)',
  date: 'Date as DD-MM-YYYY',
  datetime: 'Date and time as DD-MM-YYYY HH:mm',
  boolean: 'Yes or No',
  checkbox: 'Yes or No',
  'single-select': 'One of the options',
  'multi-select': 'Options separated by commas',
  person: 'Employee IDs separated by commas',
};

/**
 * Every column of a table, in order. `importable: false` columns appear in
 * exports and are skipped (not rejected) when an exported file is imported.
 */
const buildColumns = (fields) => {
  const columns = [
    { header: 'Lead ID', key: '_id', kind: 'id', importable: true, help: 'Leave empty to create a new lead; keep the exported ID to update that lead' },
    { header: 'Name', key: 'name', kind: 'name', importable: true, required: true, help: 'Text, 2–100 characters' },
    { header: 'Assign To (Employee ID)', key: 'assignedTo', kind: 'assignee', importable: true, aliases: ['assign to', 'assigned to', 'employee id'], help: 'Employee ID of a sales employee. Empty: not assigned (new leads) / unchanged (updates)' },
    { header: 'Pipeline Stage', key: 'pipelineStage', kind: 'stage', importable: true, aliases: ['stage'], options: Object.values(STAGE_LABELS), help: 'Empty: Lead (new leads) / unchanged (updates)' },
    { header: 'Next Follow-up', key: 'followUpDate', kind: 'followUp', importable: true, aliases: ['follow-up', 'follow up date', 'next follow-up date'], help: 'Date as DD-MM-YYYY' },
    { header: 'Address', key: 'district', kind: 'system', importable: false, help: 'Filled from the Mandal' },
    { header: 'Mandal', key: 'mandal', kind: 'system', importable: false, help: 'Filled from the table' },
    { header: 'Product', key: 'product', kind: 'system', importable: false, help: 'Filled from the table' },
  ];

  const active = fields.filter((f) => f.isActive);
  const labelCount = new Map();
  active.forEach((f) => labelCount.set(normHeader(f.label), (labelCount.get(normHeader(f.label)) || 0) + 1));
  const taken = new Set(columns.flatMap((c) => [normHeader(c.header), ...(c.aliases || [])]));

  active.forEach((field) => {
    // Two fields with the same label (or a label equal to a main column) get their key appended.
    const clash = labelCount.get(normHeader(field.label)) > 1 || taken.has(normHeader(field.label));
    const header = clash ? `${field.label} [${field.key}]` : field.label;
    const importable = !field.systemManaged && !NOT_IMPORTABLE_TYPES.includes(field.type);
    columns.push({
      header,
      key: field.key,
      kind: 'custom',
      field,
      importable,
      required: importable && Boolean(field.required) && !['checkbox', 'formula'].includes(field.type),
      options: ['single-select', 'multi-select'].includes(field.type) ? (field.options || []).map((o) => o.label || o.value) : undefined,
      help: importable ? TYPE_HELP[field.type] || field.type : 'Calculated / managed by the system (export only)',
    });
    taken.add(normHeader(header));
  });
  return columns;
};

/** Loads the table, checks access and that it is a Mandal (product/location) table. */
const loadContext = async (tableId, user, mode) => {
  const { table, cfg } = await tableService.resolveTableContext(tableId, user, mode, { requireActive: mode === 'edit' });
  if (!table.product || !table.location || table.entity !== 'lead') {
    throw new ServiceError(400, "Import and export are available on a Mandal's tables only");
  }
  const scope = await tableService.resolveTableScope(table);
  // Activity form fields are not lead columns, so they are not imported / exported.
  const fields = await GlobalTableField.find({ tableId: table._id, ...GlobalTableField.LEAD_FIELD_FILTER }).sort({ position: 1, createdAt: 1 }).lean();
  return { table, cfg, scope, fields, columns: buildColumns(fields) };
};

/* -------------------------------- spec ---------------------------------- */

/**
 * Active employees for the template's dropdowns:
 *   employees  -> person fields (any active employee)
 *   assignable -> Employee IDs the importer may put in "Assign To" (same rule as the import:
 *                 yourself, anyone when you are admin / HR / a manager, else colleagues
 *                 whose territory covers this Mandal)
 */
const templateEmployees = async (user, scope) => {
  const users = await User.find({ isActive: { $ne: false }, employeeId: { $nin: [null, ''] } })
    .select('_id employeeId name role isActive productLocationAssignments')
    .sort({ employeeId: 1 })
    .lean();
  const assignable = [];
  for (const u of users) {
    // eslint-disable-next-line no-await-in-loop
    const ok = crmScope.hasFullScope(user) || String(u._id) === String(user._id) || await crmScope.canBeAssignedAt(u, scope.product, scope.productLocation);
    if (ok) assignable.push(u.employeeId);
  }
  return {
    employees: users.map((u) => ({ employeeId: u.employeeId, name: u.name, role: u.role })),
    assignable,
  };
};

const getImportSpec = async (tableId, user) => {
  await crmScope.getScope(user);
  const { table, scope, columns } = await loadContext(tableId, user, 'view');
  const { employees, assignable } = await templateEmployees(user, scope);
  return {
    fileName: table.name,
    maxRows: MAX_ROWS,
    dateFormat: 'DD-MM-YYYY',
    employees,
    columns: columns.filter((c) => c.importable).map((c) => ({
      header: c.header,
      type: c.kind === 'custom' ? c.field.type : c.kind,
      required: Boolean(c.required),
      // Dropdown values: select options, stages, Yes/No, or Employee IDs.
      options: c.kind === 'assignee' ? assignable
        : c.kind === 'custom' && c.field.type === 'person' ? employees.map((e) => e.employeeId)
          : c.kind === 'custom' && ['boolean', 'checkbox'].includes(c.field.type) ? ['Yes', 'No']
            : c.options,
      multiple: c.kind === 'custom' && ['multi-select', 'person'].includes(c.field.type),
      help: c.help,
    })),
  };
};

/* ------------------------------- export --------------------------------- */

const exportRecords = async (tableId, user) => {
  await crmScope.getScope(user);
  const { table, cfg, scope, columns } = await loadContext(tableId, user, 'view');

  const leads = await Lead.find({
    $and: [
      { globalTableId: table._id, product: scope.product, productLocation: scope.productLocation },
      crmScope.leadFilter(user),
    ],
  })
    .select(Lead.SELECT_FIELDS)
    .populate('assignedTo', 'employeeId name')
    .populate('product', 'name')
    .sort({ createdAt: 1 })
    .lean();

  const withValues = await tableService.attachValues(table, cfg, leads, user);

  // Person values are user ids: show employee IDs.
  const personIds = new Set();
  withValues.forEach(({ customValues }) => Object.values(customValues || {}).forEach((v) => {
    (Array.isArray(v) ? v : [v]).forEach((x) => { if (x && OBJECT_ID_RE.test(String(x))) personIds.add(String(x)); });
  }));
  const people = new Map((await User.find({ _id: { $in: [...personIds] } }).select('employeeId').lean())
    .map((u) => [String(u._id), u.employeeId]));

  const optionLabel = (field, value) => (field.options || []).find((o) => o.value === value)?.label || value;

  const cell = (column, { record, customValues, computedValues }) => {
    switch (column.kind) {
      case 'id': return String(record._id);
      case 'name': return record.name || '';
      case 'assignee': return record.assignedTo?.employeeId || '';
      case 'stage': return STAGE_LABELS[Lead.normalizeStage(record.pipelineStage)] || record.pipelineStage || '';
      case 'followUp': return formatDay(record.followUpDate);
      case 'system':
        if (column.key === 'product') return record.product?.name || '';
        return (column.key === 'district' ? scope.district : scope.mandal) || '';
      default: break;
    }
    const { field } = column;
    const value = field.type === 'formula' ? computedValues?.[field.key] : customValues?.[field.key];
    if (value === null || value === undefined || value === '') return '';
    switch (field.type) {
      case 'date': return formatDay(value);
      case 'datetime': return formatDateTime(value);
      case 'boolean':
      case 'checkbox': return value === true ? 'Yes' : value === false ? 'No' : '';
      case 'single-select': return optionLabel(field, value);
      case 'multi-select': return (Array.isArray(value) ? value : [value]).map((v) => optionLabel(field, v)).join(', ');
      case 'person': return (Array.isArray(value) ? value : [value]).map((v) => people.get(String(v)) || '').filter(Boolean).join(', ');
      default: return typeof value === 'object' ? JSON.stringify(value) : value;
    }
  };

  return {
    fileName: table.name,
    headers: columns.map((c) => c.header),
    rows: withValues.map((item) => columns.map((c) => cell(c, item))),
  };
};

/* ------------------------------- import --------------------------------- */

// normalizeValue's message names the field key; the report names the column already.
const reasonOf = (err) => String(err?.message || 'Invalid value').replace(/^Invalid value for field "[^"]*" \([^)]*\): /, '');

/**
 * payload: { headers: [string], rows: [{ rowNumber, cells: [value] }] }
 * Cells are strings / numbers / booleans as read from the sheet (the browser
 * turns real Excel date cells into DD-MM-YYYY text first).
 */
const importRecords = async (tableId, payload, user) => {
  await crmScope.getScope(user);
  const { table, scope, columns } = await loadContext(tableId, user, 'edit');

  const headers = Array.isArray(payload?.headers) ? payload.headers : null;
  const rows = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!headers || !rows) throw new ServiceError(400, 'Send the sheet as { headers, rows }');
  if (!rows.length) throw new ServiceError(400, 'The file has no data rows');
  if (rows.length > MAX_ROWS) throw new ServiceError(400, `An import can have at most ${MAX_ROWS} rows (this file has ${rows.length})`);

  /* ---- 1. headers -> columns (file-level problems fail before any cell) ---- */
  const byHeader = new Map();
  columns.forEach((c) => {
    byHeader.set(normHeader(c.header), c);
    (c.aliases || []).forEach((a) => { if (!byHeader.has(a)) byHeader.set(a, c); });
    if (c.kind === 'custom') {
      if (!byHeader.has(normHeader(c.field.key))) byHeader.set(normHeader(c.field.key), c);
      if (!byHeader.has(normHeader(c.field.label))) byHeader.set(normHeader(c.field.label), c);
    }
  });

  const fileErrors = [];
  const mapped = []; // { index, column }
  const seen = new Map();
  headers.forEach((raw, index) => {
    const name = normHeader(raw);
    const hasData = rows.some((r) => !isBlank(r?.cells?.[index]));
    if (!name) {
      if (hasData) fileErrors.push({ row: 1, column: `Column ${index + 1}`, field: null, value: '', message: 'This column has data but no header' });
      return;
    }
    const column = byHeader.get(name);
    if (!column) {
      fileErrors.push({ row: 1, column: String(raw), field: null, value: String(raw), message: `"${raw}" is not a column of table "${table.name}"` });
      return;
    }
    if (seen.has(column.key)) {
      fileErrors.push({ row: 1, column: String(raw), field: column.key, value: String(raw), message: `Duplicate column (also in column ${seen.get(column.key) + 1})` });
      return;
    }
    seen.set(column.key, index);
    if (column.importable) mapped.push({ index, column });
  });
  const present = new Set(mapped.map((m) => m.column.key));
  if (!present.has('name') && !present.has('_id')) {
    fileErrors.push({ row: 1, column: 'Name', field: 'name', value: '', message: 'The "Name" column is required' });
  }
  if (fileErrors.length) {
    throw new ServiceError(422, 'Import failed: fix the file headers', { errors: fileErrors, totalErrors: fileErrors.length });
  }

  /* ---- 2. batched lookups ---- */
  const cellOf = (row, key) => {
    const m = mapped.find((x) => x.column.key === key);
    return m ? row.cells?.[m.index] : undefined;
  };
  const employeeIds = new Set();
  const leadIds = new Set();
  rows.forEach((row) => {
    const a = cellOf(row, 'assignedTo');
    if (!isBlank(a)) employeeIds.add(asText(a).toLowerCase());
    mapped.filter((m) => m.column.kind === 'custom' && m.column.field.type === 'person').forEach((m) => {
      const v = row.cells?.[m.index];
      if (!isBlank(v)) asText(v).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((id) => employeeIds.add(id));
    });
    const id = cellOf(row, '_id');
    if (!isBlank(id) && OBJECT_ID_RE.test(asText(id))) leadIds.add(asText(id).toLowerCase());
  });

  const users = employeeIds.size
    ? await User.find({ $expr: { $in: [{ $toLower: '$employeeId' }, [...employeeIds]] } })
      .select('_id employeeId isActive role productLocationAssignments').lean()
    : [];
  const userByEmpId = new Map(users.map((u) => [String(u.employeeId).toLowerCase(), u]));

  const existing = leadIds.size
    ? await Lead.find({
      $and: [
        { _id: { $in: [...leadIds] }, globalTableId: table._id, product: scope.product, productLocation: scope.productLocation },
        crmScope.leadFilter(user),
      ],
    }).select('_id pipelineStage assignedTo').lean()
    : [];
  const existingById = new Map(existing.map((l) => [String(l._id), l]));

  // Who may hold a lead on this Mandal (cached per user).
  const assignable = new Map();
  const canHold = async (assignee) => {
    const key = String(assignee._id);
    if (crmScope.hasFullScope(user) || key === String(user._id)) return true;
    if (!assignable.has(key)) assignable.set(key, await crmScope.canBeAssignedAt(assignee, scope.product, scope.productLocation));
    return assignable.get(key);
  };

  /* ---- 3. validate every cell ---- */
  const errors = [];
  const report = (row, column, value, message) => {
    errors.push({ row: row.rowNumber, column: column.header, field: column.key, value: isBlank(value) ? '' : String(value), message });
  };
  const creates = [];
  const updates = [];
  const seenIds = new Set();
  const stageHistory = new Map(); // row -> stageHistory entry for a stage change

  for (const row of rows) {
    const rowErrorsBefore = errors.length;
    const idRaw = cellOf(row, '_id');
    let current = null;
    if (!isBlank(idRaw)) {
      const id = asText(idRaw).toLowerCase();
      const idColumn = mapped.find((m) => m.column.key === '_id').column;
      if (!OBJECT_ID_RE.test(id)) report(row, idColumn, idRaw, 'Not a valid Lead ID');
      else if (!existingById.has(id)) report(row, idColumn, idRaw, 'No lead with this ID in this table (or you cannot access it)');
      else if (seenIds.has(id)) report(row, idColumn, idRaw, 'This Lead ID appears more than once in the file');
      else { current = existingById.get(id); seenIds.add(id); }
    }
    const isUpdate = !isBlank(idRaw);
    const native = {};
    const custom = []; // { field, value }

    for (const { index, column } of mapped) {
      if (column.kind === 'id') continue;
      const raw = row.cells?.[index];
      const blank = isBlank(raw);

      if (column.kind === 'name') {
        if (blank) { report(row, column, raw, 'Name is required'); continue; }
        const v = asText(raw);
        if (v.length < 2 || v.length > 100) report(row, column, raw, 'Name must be 2–100 characters');
        else native.name = v;
      } else if (column.kind === 'assignee') {
        if (blank) continue; // create: not assigned; update: unchanged
        const assignee = userByEmpId.get(asText(raw).toLowerCase());
        if (!assignee) report(row, column, raw, 'No employee with this Employee ID');
        else if (assignee.isActive === false) report(row, column, raw, 'This employee is inactive');
        // A new assignee must be a sales employee (an unchanged assignee is kept).
        else if (!isLeadAssigneeRole(assignee.role)
          && !(current && String(current.assignedTo) === String(assignee._id))) {
          report(row, column, raw, 'Leads can only be assigned to sales employees (Sales, Inside Sales or Product Executive)');
        }
        // eslint-disable-next-line no-await-in-loop
        else if (!(await canHold(assignee))) report(row, column, raw, 'You can only assign yourself or a colleague assigned to this Mandal');
        else native.assignedTo = assignee._id;
      } else if (column.kind === 'stage') {
        if (blank) continue; // create: Lead; update: unchanged
        const v = normHeader(raw);
        const stage = Object.keys(STAGE_LABELS).find((s) => s === v || normHeader(STAGE_LABELS[s]) === v);
        if (!stage) { report(row, column, raw, `Use one of: ${Object.values(STAGE_LABELS).join(', ')}`); continue; }
        if (current) {
          const check = Lead.checkStageTransition(current.pipelineStage, stage);
          if (!check.ok) { report(row, column, raw, check.message); continue; }
          // Convert (won -> lost) and rework (lost -> open) need a reason: CRM › Clients only.
          if (check.direction === 'convert' || check.direction === 'rework') {
            report(row, column, raw, 'Won and lost leads are changed from CRM › Clients, not by import');
            continue;
          }
          if (check.direction !== 'none') {
            Object.assign(native, Lead.stageSideEffects(stage, { by: user._id }));
            stageHistory.set(row, { from: check.from, to: stage, action: 'move', reason: 'Excel import', by: user._id, at: new Date() });
          }
        }
        native.pipelineStage = stage;
      } else if (column.kind === 'followUp') {
        if (blank) { native.followUpDate = null; continue; }
        const iso = parseDayMonthYear(raw);
        if (!iso) report(row, column, raw, 'Use a real date as DD-MM-YYYY');
        else native.followUpDate = new Date(`${iso}T00:00:00.000Z`);
      } else if (column.kind === 'custom') {
        const { field } = column;
        let value = raw;
        let problem = null;
        if (!blank) {
          switch (field.type) {
            case 'text':
            case 'email':
              value = asText(raw);
              break;
            case 'number':
            case 'currency':
              value = typeof raw === 'number' ? raw : asText(raw).replace(/,/g, '');
              break;
            case 'date': {
              const iso = parseDayMonthYear(raw);
              if (!iso) problem = 'Use a real date as DD-MM-YYYY';
              value = iso;
              break;
            }
            case 'datetime': {
              const d = parseDayMonthYearTime(raw);
              if (!d) problem = 'Use DD-MM-YYYY HH:mm (or DD-MM-YYYY for 00:00)';
              value = d;
              break;
            }
            case 'boolean':
            case 'checkbox': {
              const v = normHeader(raw);
              if (['yes', 'true', '1', 'y'].includes(v)) value = true;
              else if (['no', 'false', '0', 'n'].includes(v)) value = false;
              else problem = 'Use Yes or No';
              break;
            }
            case 'single-select': {
              const v = normHeader(raw);
              const option = (field.options || []).find((o) => normHeader(o.value) === v || normHeader(o.label) === v);
              if (!option) problem = `Use one of: ${(field.options || []).map((o) => o.label || o.value).join(', ')}`;
              value = option?.value;
              break;
            }
            case 'multi-select': {
              const parts = asText(raw).split(',').map((s) => s.trim()).filter(Boolean);
              const values = [];
              const bad = [];
              parts.forEach((p) => {
                const option = (field.options || []).find((o) => normHeader(o.value) === normHeader(p) || normHeader(o.label) === normHeader(p));
                if (option) values.push(option.value); else bad.push(p);
              });
              if (bad.length) problem = `Not an option: ${bad.join(', ')}`;
              value = values;
              break;
            }
            case 'person': {
              const parts = asText(raw).split(',').map((s) => s.trim()).filter(Boolean);
              const bad = parts.filter((p) => !userByEmpId.has(p.toLowerCase()));
              if (bad.length) problem = `No employee with Employee ID: ${bad.join(', ')}`;
              else if (parts.length > 50) problem = 'At most 50 employees';
              // Validated here (one batched lookup), so normalizeValue is skipped below.
              value = [...new Set(parts.map((p) => String(userByEmpId.get(p.toLowerCase())._id)))].map((id) => new mongoose.Types.ObjectId(id));
              break;
            }
            default:
              break;
          }
        }
        if (problem) { report(row, column, raw, problem); continue; }
        if (field.type === 'person' && !blank) { custom.push({ field, value }); continue; }
        try {
          // eslint-disable-next-line no-await-in-loop
          custom.push({ field, value: await tableService.normalizeValue(field, blank ? null : value) });
        } catch (err) {
          report(row, column, raw, blank ? 'This field is required' : reasonOf(err));
        }
      }
    }

    if (!isUpdate && !present.has('name')) {
      errors.push({ row: row.rowNumber, column: 'Name', field: 'name', value: '', message: 'Name is required for a new lead (add a Name column or a Lead ID)' });
    }
    if (errors.length > rowErrorsBefore) continue;
    if (isUpdate) {
      if (current) updates.push({ row, current, native, custom });
    } else {
      creates.push({
        row,
        native: {
          ...native,
          assignedTo: native.assignedTo || null, // never defaults to the importer (createdBy holds them)
          pipelineStage: native.pipelineStage || 'lead',
          followUpDate: native.followUpDate === undefined ? null : native.followUpDate,
        },
        custom,
      });
    }
  }

  // Required custom fields whose column is missing: every new row would break the rule.
  if (creates.length) {
    columns.filter((c) => c.kind === 'custom' && c.required && !present.has(c.key)).forEach((c) => {
      errors.push({ row: 1, column: c.header, field: c.key, value: '', message: 'This required column is missing from the file' });
    });
  }

  if (errors.length) {
    errors.sort((a, b) => a.row - b.row);
    throw new ServiceError(422, `Import failed: ${errors.length} problem${errors.length === 1 ? '' : 's'} found, nothing was saved`, {
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
      totalErrors: errors.length,
    });
  }

  /* ---- 4. write everything in one transaction ---- */
  const location = {
    product: scope.product,
    productLocation: scope.productLocation,
    district: scope.district,
    mandal: scope.mandal,
    globalTableId: table._id,
  };
  const actor = user._id;

  const result = await tableService.withTransaction(async (session) => {
    const touched = await GlobalTable.findOneAndUpdate(
      { _id: table._id, isActive: true },
      { $inc: { writeVersion: 1 } },
      { new: true, session }
    );
    if (!touched) throw new ServiceError(404, 'Active table not found');

    const createdDocs = creates.length
      ? await Lead.insertMany(creates.map((c) => ({ ...c.native, ...location, createdBy: actor })), { session, ordered: true })
      : [];

    for (const u of updates) {
      const filter = { _id: u.current._id, globalTableId: table._id };
      // Compare-and-set: a stage change only applies if nobody moved the lead meanwhile.
      if (u.native.pipelineStage !== undefined) {
        filter.pipelineStage = u.current.pipelineStage === undefined ? { $exists: false } : u.current.pipelineStage;
      }
      // eslint-disable-next-line no-await-in-loop
      const history = stageHistory.get(u.row);
      const update = { $set: { ...u.native, ...location }, ...(history ? { $push: { stageHistory: history } } : {}) };
      // eslint-disable-next-line no-await-in-loop
      const res = await Lead.updateOne(filter, update, { session, runValidators: true });
      if (!res.matchedCount) {
        throw new ServiceError(409, `Row ${u.row.rowNumber}: this lead was changed by someone else during the import. Nothing was saved; export again and retry.`);
      }
    }

    const valueOps = [];
    const pushValues = (recordId, custom) => custom.forEach(({ field, value }) => {
      valueOps.push({
        updateOne: {
          filter: { tableId: table._id, fieldId: field._id, recordId },
          update: { $set: { value, updatedBy: actor }, $setOnInsert: { createdBy: actor } },
          upsert: true,
        },
      });
    });
    createdDocs.forEach((doc, i) => pushValues(doc._id, creates[i].custom.filter((c) => c.value !== null)));
    updates.forEach((u) => pushValues(u.current._id, u.custom));
    if (valueOps.length) await GlobalTableValue.bulkWrite(valueOps, { ordered: true, session });

    return { created: createdDocs.length, updated: updates.length };
  });

  return { ...result, total: rows.length };
};

module.exports = {
  MAX_ROWS,
  buildColumns,
  parseDayMonthYear,
  getImportSpec,
  exportRecords,
  importRecords,
};
