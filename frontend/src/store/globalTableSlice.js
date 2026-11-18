import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as api from '../services/GlobalTableService';

/**
 * Global Table slice (Lead table).
 *
 * Backend response shapes (verified against the Phase 1 backend, NOT
 * { success, data }):
 *   GET /global-tables             -> { tables, pagination }
 *   GET /global-table-fields       -> { fields }
 *   GET /global-table-values       -> { values, pagination, computed? }
 *   POST/PUT single resource       -> the raw document
 *   POST/PUT/GET .../records       -> { record, customValues, computedValues }
 *   errors                         -> { message, errors?, details? }
 *
 * valuesByRecord[recordId][fieldId] = { _id, value }
 *   Formula fields are never stored. Their calculated result (returned by the backend with
 *   includeComputed=true) is placed in the same map as { value, computed: true } (no _id), so the
 *   grid reads it exactly like a stored value and nothing in the frontend calculates it.
 */

const LEAD_ENTITY = 'lead';
const VALUES_CHUNK = 100; // recordIds per request (backend max is 200)

const errorPayload = (err, fallback) => ({
  status: err?.response?.status,
  message: err?.response?.data?.message || fallback,
  errors: err?.response?.data?.errors,
  details: err?.response?.data?.details,
});

/* ------------------------------ table ----------------------------------- */

export const fetchLeadTable = createAsyncThunk(
  'globalTable/fetchLeadTable',
  async (_, { rejectWithValue }) => {
    try {
      const { tables } = await api.getGlobalTables({ entity: LEAD_ENTITY, isActive: true, limit: 1 });
      return tables[0] || null;
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to load the lead table'));
    }
  }
);

export const fetchTableById = createAsyncThunk(
  'globalTable/fetchTableById',
  async (tableId, { rejectWithValue }) => {
    try {
      return await api.getGlobalTable(tableId);
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to load the table'));
    }
  }
);

// POST /global-tables/:id/records -> { record, customValues, computedValues }
// Native record and custom values are saved by the backend in one transaction.
// A rejection carries details.recordId when only the custom values failed (non-transactional fallback).
export const createRecord = createAsyncThunk(
  'globalTable/createRecord',
  async ({ tableId, native = {}, customValues = {} }, { rejectWithValue }) => {
    try {
      return await api.createGlobalTableRecord(tableId, { native, customValues });
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to create record'));
    }
  }
);

// PUT /global-tables/:id/records/:recordId -> { record, customValues, computedValues }
// A rejection carries details.nativeApplied when the native update was applied but the custom values failed.
export const updateRecord = createAsyncThunk(
  'globalTable/updateRecord',
  async ({ tableId, recordId, native = {}, customValues = {} }, { rejectWithValue }) => {
    try {
      return await api.updateGlobalTableRecord(tableId, recordId, { native, customValues });
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to update record'));
    }
  }
);


// Admin-only on the backend; non-admins receive a 403 message.
export const createLeadTable = createAsyncThunk(
  'globalTable/createLeadTable',
  async (_, { rejectWithValue }) => {
    try {
      return await api.createGlobalTable({ name: 'Leads', key: 'leads', entity: LEAD_ENTITY });
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to create the lead table'));
    }
  }
);

/* ------------------------------ fields ---------------------------------- */

export const fetchFields = createAsyncThunk(
  'globalTable/fetchFields',
  async ({ tableId }, { rejectWithValue }) => {
    try {
      const { fields } = await api.getGlobalTableFields({ tableId, isActive: true });
      return fields;
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to load fields'));
    }
  }
);

export const createField = createAsyncThunk(
  'globalTable/createField',
  async (payload, { rejectWithValue }) => {
    try {
      return await api.createGlobalTableField(payload);
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to create field'));
    }
  }
);

export const updateField = createAsyncThunk(
  'globalTable/updateField',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      return await api.updateGlobalTableField(id, payload);
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to update field'));
    }
  }
);

// First call without force; a 409 carries details.valueCount so the UI can
// ask for a second, explicit confirmation before calling with force: true.
export const deleteField = createAsyncThunk(
  'globalTable/deleteField',
  async ({ id, force = false }, { rejectWithValue }) => {
    try {
      await api.deleteGlobalTableField(id, force ? { force: true } : {});
      return id;
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to delete field'));
    }
  }
);

/* ------------------------------ values ---------------------------------- */

// Loads stored values AND the backend-calculated formula results (includeComputed).
// `computed` is the same for every page of a chunk, so it is read from the first page only.
export const fetchValues = createAsyncThunk(
  'globalTable/fetchValues',
  async ({ tableId, recordIds }, { rejectWithValue }) => {
    try {
      const values = [];
      const computed = [];
      for (let i = 0; i < recordIds.length; i += VALUES_CHUNK) {
        const chunk = recordIds.slice(i, i + VALUES_CHUNK).join(',');
        let page = 1;
        let hasNext = true;
        while (hasNext) {
          // eslint-disable-next-line no-await-in-loop
          const res = await api.getGlobalTableValues({ tableId, recordIds: chunk, page, limit: 500, includeComputed: true });
          values.push(...res.values);
          if (page === 1 && Array.isArray(res.computed)) computed.push(...res.computed);
          hasNext = res.pagination.hasNextPage;
          page += 1;
        }
      }
      return { recordIds, values, computed };
    } catch (err) {
      return rejectWithValue(errorPayload(err, 'Failed to load custom values'));
    }
  }
);

/**
 * Optimistic upsert of one cell. Rolls back to the previous entry on failure.
 */
export const saveCellValue = createAsyncThunk(
  'globalTable/saveCellValue',
  async ({ tableId, recordId, fieldId, value }, { dispatch, getState, rejectWithValue }) => {
    const prev = getState().globalTable.valuesByRecord[recordId]?.[fieldId] || null;
    dispatch(valueSetLocal({ tableId, recordId, fieldId, entry: { _id: prev?._id, value } }));
    try {
      const doc = await api.upsertGlobalTableValue({ tableId, fieldId, recordId, value });
      return { tableId, recordId, fieldId, entry: { _id: doc._id, value: doc.value } };
    } catch (err) {
      dispatch(valueSetLocal({ tableId, recordId, fieldId, entry: prev }));
      return rejectWithValue(errorPayload(err, 'Failed to save value'));
    }
  }
);

/**
 * Deletes ONLY the stored custom value (never the Lead).
 */
export const deleteCellValue = createAsyncThunk(
  'globalTable/deleteCellValue',
  async ({ tableId, recordId, fieldId, valueId }, { dispatch, getState, rejectWithValue }) => {
    const prev = getState().globalTable.valuesByRecord[recordId]?.[fieldId] || null;
    dispatch(valueSetLocal({ tableId, recordId, fieldId, entry: null }));
    try {
      await api.deleteGlobalTableValue(valueId);
      return { tableId, recordId, fieldId };
    } catch (err) {
      dispatch(valueSetLocal({ tableId, recordId, fieldId, entry: prev }));
      return rejectWithValue(errorPayload(err, 'Failed to delete value'));
    }
  }
);

/* ------------------------------ slice ----------------------------------- */

const initialState = {
  table: null,
  tableStatus: 'idle', // idle | loading | succeeded | failed
  tableError: null,
  tableRequestId: null,
  fields: [],
  fieldsStatus: 'idle',
  fieldsError: null,
  valuesByRecord: {},
  valuesStatus: 'idle',
  valuesError: null,
};

const byPosition = (a, b) => (a.position - b.position) || String(a.createdAt).localeCompare(String(b.createdAt));

const globalTableSlice = createSlice({
  name: 'globalTable',
  initialState,
  reducers: {
    // Local-only: used for optimistic updates and rollbacks
    valueSetLocal(state, { payload: { tableId, recordId, fieldId, entry } }) {
      if (tableId && String(state.table?._id || '') !== String(tableId)) return;
      if (!state.valuesByRecord[recordId]) state.valuesByRecord[recordId] = {};
      if (entry) state.valuesByRecord[recordId][fieldId] = entry;
      else delete state.valuesByRecord[recordId][fieldId];
    },
    // A Lead was deleted: drop its cached custom values
    recordRemoved(state, { payload: recordId }) {
      delete state.valuesByRecord[recordId];
    },
  },
  extraReducers: (builder) => {
    builder
      // table
      .addCase(fetchLeadTable.pending, (s, { meta }) => {
        s.tableStatus = 'loading'; s.tableError = null; s.tableRequestId = meta.requestId;
        s.table = null; s.fields = []; s.fieldsStatus = 'idle'; s.valuesByRecord = {}; s.valuesStatus = 'idle';
      })
      .addCase(fetchLeadTable.fulfilled, (s, { payload, meta }) => {
        if (s.tableRequestId !== meta.requestId) return;
        s.tableStatus = 'succeeded'; s.table = payload; s.tableRequestId = null;
      })
      .addCase(fetchLeadTable.rejected, (s, { payload, meta }) => {
        if (s.tableRequestId !== meta.requestId) return;
        s.tableStatus = 'failed'; s.tableError = payload?.message || 'Failed to load'; s.tableRequestId = null;
      })
      .addCase(fetchTableById.pending, (s, { meta }) => {
        s.tableStatus = 'loading'; s.tableError = null; s.tableRequestId = meta.requestId; s.table = null;
        s.fields = []; s.fieldsStatus = 'idle'; s.valuesByRecord = {}; s.valuesStatus = 'idle';
      })
      .addCase(fetchTableById.fulfilled, (s, { payload, meta }) => {
        if (s.tableRequestId !== meta.requestId) return;
        s.tableStatus = 'succeeded'; s.table = payload; s.tableRequestId = null;
      })
      .addCase(fetchTableById.rejected, (s, { payload, meta }) => {
        if (s.tableRequestId !== meta.requestId) return;
        s.tableStatus = 'failed'; s.tableError = payload?.message || 'Failed to load'; s.tableRequestId = null;
      })
      .addCase(createLeadTable.fulfilled, (s, { payload }) => { s.table = payload; s.tableStatus = 'succeeded'; })
      // fields
      .addCase(fetchFields.pending, (s, { meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.fieldsStatus = 'loading'; s.fieldsError = null;
      })
      .addCase(fetchFields.fulfilled, (s, { payload, meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.fieldsStatus = 'succeeded'; s.fields = [...payload].sort(byPosition);
      })
      .addCase(fetchFields.rejected, (s, { payload, meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.fieldsStatus = 'failed'; s.fieldsError = payload?.message || 'Failed to load fields';
      })
      .addCase(createField.fulfilled, (s, { payload }) => {
        if (String(s.table?._id || '') !== String(payload.tableId)) return;
        s.fields = [...s.fields, payload].sort(byPosition);
      })
      .addCase(updateField.fulfilled, (s, { payload, meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.fields = s.fields.map((f) => (f._id === payload._id ? payload : f));
      })
      .addCase(deleteField.fulfilled, (s, { payload: id, meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.fields = s.fields.filter((f) => f._id !== id);
        Object.values(s.valuesByRecord).forEach((rec) => { delete rec[id]; });
      })
      // values
      .addCase(fetchValues.pending, (s, { meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.valuesStatus = 'loading'; s.valuesError = null;
      })
      .addCase(fetchValues.fulfilled, (s, { payload: { recordIds, values, computed }, meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.valuesStatus = 'succeeded';
        recordIds.forEach((id) => { s.valuesByRecord[id] = {}; });
        values.forEach((v) => {
          if (!s.valuesByRecord[v.recordId]) s.valuesByRecord[v.recordId] = {};
          s.valuesByRecord[v.recordId][v.fieldId] = { _id: v._id, value: v.value };
        });
        // Formula results: calculated by the backend, never stored, never editable
        computed.forEach(({ recordId, fieldId, value }) => {
          if (!s.valuesByRecord[recordId]) s.valuesByRecord[recordId] = {};
          s.valuesByRecord[recordId][fieldId] = { value, computed: true };
        });
      })
      .addCase(fetchValues.rejected, (s, { payload, meta }) => {
        if (String(s.table?._id || '') !== String(meta.arg.tableId)) return;
        s.valuesStatus = 'failed'; s.valuesError = payload?.message || 'Failed to load values';
      })
      .addCase(saveCellValue.fulfilled, (s, { payload: { tableId, recordId, fieldId, entry } }) => {
        if (String(s.table?._id || '') !== String(tableId)) return;
        if (!s.valuesByRecord[recordId]) s.valuesByRecord[recordId] = {};
        s.valuesByRecord[recordId][fieldId] = entry;
      });
  },
});

export const { valueSetLocal, recordRemoved } = globalTableSlice.actions;
export default globalTableSlice.reducer;