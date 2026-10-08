import api from '../utils/api';

export const getLeads = (params = {}) => api.get('/leads', { params }).then((r) => r.data);
export const getLead = (id) => api.get(`/leads/${id}`).then((r) => r.data);
export const createLead = (payload) => api.post('/leads', payload).then((r) => r.data);
export const updateLead = (id, payload) => api.put(`/leads/${id}`, payload).then((r) => r.data);
export const deleteLead = (id) => api.delete(`/leads/${id}`).then((r) => r.data);

// Preserved from the existing Lead detail modal in CRMPage.jsx — not part of
// the new custom-field system, reused as-is so status changes and activity
// logging keep working exactly like before.
export const updateLeadStatus = (id, status) => api.put(`/leads/${id}/status`, { status }).then((r) => r.data);
export const addLeadActivity = (id, activity) => api.post(`/leads/${id}/activity`, activity).then((r) => r.data);