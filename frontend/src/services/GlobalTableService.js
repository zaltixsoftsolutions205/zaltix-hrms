import api from '../utils/api';

// ============================================================
// GLOBAL TABLES
// ============================================================

export const getGlobalTables = (params = {}) =>
    api.get('/global-tables', { params }).then((r) => r.data);

export const getGlobalTable = (id) =>
    api.get(`/global-tables/${id}`).then((r) => r.data);

export const createGlobalTable = (payload) =>
    api.post('/global-tables', payload).then((r) => r.data);

export const updateGlobalTable = (id, payload) =>
    api.put(`/global-tables/${id}`, payload).then((r) => r.data);

export const deleteGlobalTable = (id, params = {}) =>
    api.delete(`/global-tables/${id}`, { params }).then((r) => r.data);



// ============================================================
// GLOBAL TABLE FIELDS
// ============================================================

export const getGlobalTableFields = (params = {}) =>
    api.get('/global-table-fields', { params }).then((r) => r.data);

export const getGlobalTableField = (id) =>
    api.get(`/global-table-fields/${id}`).then((r) => r.data);

export const createGlobalTableField = (payload) =>
    api.post('/global-table-fields', payload).then((r) => r.data);

export const updateGlobalTableField = (id, payload) =>
    api.put(`/global-table-fields/${id}`, payload).then((r) => r.data);

export const deleteGlobalTableField = (id, params = {}) =>
    api.delete(`/global-table-fields/${id}`, { params }).then((r) => r.data);


// ============================================================
// GLOBAL TABLE VALUES
// GET accepts includeComputed=true together with recordId / recordIds; the response then also
// carries `computed: [{ recordId, fieldId, value }]` (calculated formula results).
// ============================================================

export const getGlobalTableValues = (params = {}) =>
    api.get('/global-table-values', { params }).then((r) => r.data);

export const getGlobalTableValue = (id) =>
    api.get(`/global-table-values/${id}`).then((r) => r.data);

export const createGlobalTableValue = (payload) =>
    api.post('/global-table-values', payload).then((r) => r.data);

export const upsertGlobalTableValue = (payload) =>
    api.put('/global-table-values/upsert', payload).then((r) => r.data);

export const updateGlobalTableValue = (id, payload) =>
    api.put(`/global-table-values/${id}`, payload).then((r) => r.data);

export const deleteGlobalTableValue = (id) =>
    api.delete(`/global-table-values/${id}`).then((r) => r.data);


// ============================================================
// GLOBAL TABLE RECORDS (native entity row + its custom values, saved together by the backend)
//
// POST /global-tables/:id/records             body: { native, customValues }
//   -> 201 { record, customValues, computedValues }
// GET  /global-tables/:id/records/:recordId
//   -> 200 { record, customValues, computedValues }
// PUT  /global-tables/:id/records/:recordId   body: { native, customValues }
//   -> 200 { record, customValues, computedValues }
//
// customValues / computedValues are keyed by the custom field KEY (not its id).
// ============================================================

export const createGlobalTableRecord = (tableId, payload) =>
    api.post(`/global-tables/${tableId}/records`, payload).then((r) => r.data);

export const getGlobalTableRecord = (tableId, recordId) =>
    api.get(`/global-tables/${tableId}/records/${recordId}`).then((r) => r.data);

export const updateGlobalTableRecord = (tableId, recordId, payload) =>
    api.put(`/global-tables/${tableId}/records/${recordId}`, payload).then((r) => r.data);

export const deleteGlobalTableRecord = (tableId, recordId) =>
    api.delete(`/global-tables/${tableId}/records/${recordId}`).then((r) => r.data);

// Deletes several rows of one table at once (all or nothing, max 500).
export const bulkDeleteGlobalTableRecords = (tableId, recordIds) =>
    api.post(`/global-tables/${tableId}/records/bulk-delete`, { recordIds }).then((r) => r.data);