import api from '../utils/api';

// Field *definitions* (columns)
export const getLeadCustomFields = () => api.get('/lead-custom-fields').then((r) => r.data.data);
export const getLeadCustomField = (id) => api.get(`/lead-custom-fields/${id}`).then((r) => r.data.data);
export const createLeadCustomField = (payload) => api.post('/lead-custom-fields', payload).then((r) => r.data.data);
export const updateLeadCustomField = (id, payload) => api.patch(`/lead-custom-fields/${id}`, payload).then((r) => r.data.data);
export const deleteLeadCustomField = (id) => api.delete(`/lead-custom-fields/${id}`).then((r) => r.data);
export const reorderLeadCustomFields = (fields) =>
  api.patch('/lead-custom-fields/reorder', { fields }).then((r) => r.data.data);

// Cell values
export const getLeadCustomFieldValues = (leadId) => api.get(`/leads/${leadId}/custom-fields`).then((r) => r.data.data);
export const updateLeadCustomFieldValue = (leadId, fieldId, value) =>
  api.put(`/leads/${leadId}/custom-fields/${fieldId}`, { value }).then((r) => r.data.data);
export const deleteLeadCustomFieldValue = (leadId, fieldId) =>
  api.delete(`/leads/${leadId}/custom-fields/${fieldId}`).then((r) => r.data);