import api from '../utils/api';
import * as visits from './VisitService';

/**
 * One API shape for every lead activity page:
 *   getCalendar(params), getDetail(leadId), create(leadId, body), update(id, body), remove(id)
 * getDetail -> { type, lead, mainFields, customFields, entries, canAdd, canEditPage, assignees }
 * customFields: the lead table's fields for this form (values in entry.customValues by field id).
 * mainFields with section: 'details' are drawn in the form's "Details" section.
 *
 * Demo / Data Update / Registration / Feedback use /api/activities/<type>.
 * Visits keep /api/visits; the adapter below gives them the same shape.
 */

const unwrap = (promise, fallback) => promise.then((r) => r.data).catch((err) => {
  const body = err?.response?.data || {};
  const error = new Error(body.message || fallback);
  error.status = err?.response?.status;
  error.errors = body.details?.errors || body.errors || [];
  throw error;
});

const activityApi = (type) => {
  const base = `/activities/${type}`;
  return {
    getCalendar: (params) => unwrap(api.get(`${base}/calendar`, { params }), 'Failed to load the calendar'),
    getDetail: (leadId) => unwrap(api.get(`${base}/leads/${leadId}`), 'Failed to load'),
    create: (leadId, body) => unwrap(api.post(`${base}/leads/${leadId}/entries`, body), 'Failed to save'),
    update: (id, body) => unwrap(api.put(`${base}/entries/${id}`, body), 'Failed to save'),
    remove: (id) => unwrap(api.delete(`${base}/entries/${id}`), 'Failed to delete'),
    // The lead's own follow-up date ('' clears it); needs edit access to this page.
    setFollowUp: (leadId, followUpDate) => unwrap(api.put(`${base}/leads/${leadId}/follow-up`, { followUpDate }), 'Failed to update the follow-up date'),
    // Attached file (registration invoice): upload / replace, and open in a new tab.
    uploadFile: (id, file) => {
      const form = new FormData();
      form.append('file', file);
      return unwrap(api.post(`${base}/entries/${id}/file`, form), 'Failed to upload the file');
    },
    openFile: async (id) => {
      const tab = window.open('', '_blank'); // opened now, so the popup blocker allows it
      try {
        const res = await api.get(`${base}/entries/${id}/file`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        if (tab) tab.location.href = url; else window.location.assign(url);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) {
        if (tab) tab.close();
        throw new Error(err?.response?.status === 404 ? 'File not found' : 'Failed to open the file');
      }
    },
  };
};

// Visit main fields, described like the other types' (see backend services/activityTypes.js).
export const VISIT_MAIN_FIELDS = [
  { key: 'visitDate', label: 'Date', type: 'date', required: true },
  { key: 'visitedBy', label: 'Visitor', type: 'actor' },
  { key: 'timeIn', label: 'Time in', type: 'time' },
  { key: 'timeOut', label: 'Time out', type: 'time' },
];

const VISIT_TYPE = { key: 'visit', label: 'Visit', plural: 'Visits', stage: 'visit', single: false, followUp: true, dateKey: 'visitDate' };

const visitApi = {
  getCalendar: visits.getVisitCalendar,
  getDetail: (leadId) => visits.getLeadVisits(leadId).then((d) => ({
    type: VISIT_TYPE,
    lead: d.lead,
    // Visit Type, Lead Feedback, ... come from the backend (services/activityTypes.js).
    mainFields: [...VISIT_MAIN_FIELDS, ...(d.detailFields || [])],
    // The lead table's Visit form fields (Show in: Visits).
    customFields: d.customFields || [],
    entries: d.visits,
    canAdd: d.canAddVisit,
    canEditPage: d.canEditPage,
    assignees: [],
  })),
  create: visits.createVisit,
  update: visits.updateVisit,
  remove: visits.deleteVisit,
  setFollowUp: (leadId, followUpDate) => unwrap(api.put(`/visits/leads/${leadId}/follow-up`, { followUpDate }), 'Failed to update the follow-up date'),
};

export const getActivityApi = (type) => (type === 'visit' ? visitApi : activityApi(type));

export { updateLeadStage } from './VisitService';
