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

// ---------------------------------------------------------------------------
// CRM › Clients. A won lead is a client; errors become Error(message) for toasts.
// ---------------------------------------------------------------------------
const withMessage = (promise, fallback) => promise
  .then((r) => r.data)
  .catch((err) => { throw new Error(err.response?.data?.message || fallback); });

/** Every lead in one stage the user may see (all pages). */
export const getAllLeadsInStage = async (pipelineStage) => {
  const byId = new Map(); // a lead returned on two pages is kept once
  for (let page = 1; ; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const data = await withMessage(api.get('/leads', { params: { pipelineStage, page, limit: 100, sortBy: 'updatedAt', sortOrder: 'desc' } }), 'Failed to load clients');
    (data.leads || []).forEach((lead) => byId.set(String(lead._id), lead));
    if (!data.pagination?.hasNextPage) break;
  }
  return [...byId.values()];
};

/** Sales employees this user may give the lead to. */
export const getLeadAssignees = (id) => withMessage(api.get(`/leads/${id}/assignees`), 'Failed to load employees').then((d) => d.assignees || []);

/** Send a client to an activity page (stage) or back to Clients (stage null). */
export const sendClientToActivity = (id, { stage, assignedTo, followUpDate, note }) => withMessage(
  api.put(`/leads/${id}/won-activity-stage`, { stage, assignedTo, followUpDate, note }),
  'Failed to update the client',
);

export const convertClientToLost = (id, reason) => withMessage(api.put(`/leads/${id}/convert-lost`, { reason }), 'Failed to convert the client');

export const reworkLead = (id, { toStage, assignedTo, followUpDate, reason }) => withMessage(
  api.put(`/leads/${id}/rework`, { toStage, assignedTo, followUpDate, reason }),
  'Failed to rework the lead',
);