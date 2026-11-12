import api from '../utils/api';

/** Global Analytics API (backend/routes/analytics.js). */
const AnalyticsService = {
  catalog: () => api.get('/analytics/catalog').then((r) => r.data),
  options: (ref, { q, ids } = {}) => api.get(`/analytics/options/${ref}`, {
    params: { ...(q ? { q } : {}), ...(ids?.length ? { ids: ids.join(',') } : {}) },
  }).then((r) => r.data.options),
  preview: (config, { filters, page } = {}) => api.post('/analytics/preview', { config, filters, page }).then((r) => r.data),

  listWidgets: () => api.get('/analytics/widgets').then((r) => r.data.widgets),
  createWidget: (body) => api.post('/analytics/widgets', body).then((r) => r.data),
  updateWidget: (id, body) => api.put(`/analytics/widgets/${id}`, body).then((r) => r.data),
  deleteWidget: (id) => api.delete(`/analytics/widgets/${id}`).then((r) => r.data),
  runWidget: (id, { filters, page } = {}) => api.post(`/analytics/widgets/${id}/run`, { filters, page }).then((r) => r.data),

  listDashboards: () => api.get('/analytics/dashboards').then((r) => r.data.dashboards),
  getDashboard: (id) => api.get(`/analytics/dashboards/${id}`).then((r) => r.data),
  createDashboard: (body) => api.post('/analytics/dashboards', body).then((r) => r.data),
  /** body: any of { title, description, items: [{ widget, layout: { x, y, w, h } }], filters } */
  updateDashboard: (id, body) => api.put(`/analytics/dashboards/${id}`, body).then((r) => r.data),
  deleteDashboard: (id) => api.delete(`/analytics/dashboards/${id}`).then((r) => r.data),
};

/** The server's message, and the setting it is about (`path`), from a failed call. */
export const errorOf = (err) => ({
  message: err?.response?.data?.message || 'Something went wrong',
  path: err?.response?.data?.path || null,
  invalid: Boolean(err?.response?.data?.invalid),
});

export default AnalyticsService;
