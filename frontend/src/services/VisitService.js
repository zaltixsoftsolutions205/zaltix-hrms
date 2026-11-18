import api from '../utils/api';

/**
 * Visits API (backend/routes/visits.js).
 * Errors keep the backend shape: { message, details?: { errors: [{ fieldId|field, message }] } }.
 */

const unwrap = (promise, fallback) => promise.then((r) => r.data).catch((err) => {
  const body = err?.response?.data || {};
  const error = new Error(body.message || fallback);
  error.status = err?.response?.status;
  error.errors = body.details?.errors || body.errors || [];
  throw error;
});

// Leads in the Visit stage whose follow-up date falls in [from, to).
export const getVisitCalendar = (params) => unwrap(api.get('/visits/calendar', { params }), 'Failed to load the calendar');

// One lead: basic info, the visit detail fields and its visits.
export const getLeadVisits = (leadId) => unwrap(api.get(`/visits/leads/${leadId}`), 'Failed to load the visits');

export const createVisit = (leadId, body) => unwrap(api.post(`/visits/leads/${leadId}/visits`, body), 'Failed to save the visit');
export const updateVisit = (visitId, body) => unwrap(api.put(`/visits/${visitId}`, body), 'Failed to save the visit');
export const deleteVisit = (visitId) => unwrap(api.delete(`/visits/${visitId}`), 'Failed to delete the visit');

// Pipeline stage of the lead (lead rules: won / lost are final). expectedStage guards against stale screens.
export const updateLeadStage = (leadId, pipelineStage, expectedStage) => unwrap(
  api.put(`/leads/${leadId}/pipeline-stage`, { pipelineStage, expectedStage }),
  'Failed to change the stage'
);
