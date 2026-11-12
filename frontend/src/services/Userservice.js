import api from '../utils/api';

// ASSUMPTION — please confirm/fix this path.
// No "list users/employees" endpoint was provided anywhere in this project,
// but the "Assign To" field and "person"-type custom fields both need one.
// This guesses the conventional HRMS route. Every place in the Leads UI that
// needs assignable users goes through this single function, so fixing the
// path here (if it's wrong) fixes the whole feature.
export const getAssignableUsers = (params = {}) =>
  api.get('/employees', { params }).then((r) => r.data.employees || r.data.data || r.data);

/**
 * "Assign To" choices for a lead: active sales employees only (Sales, Inside Sales,
 * Product Executive), each { _id, name, employeeId, role, mandals: [name] }.
 * Cached for a minute: every table cell editor asks for the same list.
 */
let assigneeCache = null; // { at, promise }
export const getLeadAssigneeOptions = () => {
  if (assigneeCache && Date.now() - assigneeCache.at < 60 * 1000) return assigneeCache.promise;
  const promise = api.get('/leads/assignee-options').then((r) => r.data.assignees || []);
  assigneeCache = { at: Date.now(), promise };
  promise.catch(() => { assigneeCache = null; });
  return promise;
};

const ROLE_LABELS = { sales: 'Sales', 'inside-sales': 'Inside Sales', 'product-executive': 'Product Executive' };
export const roleLabel = (role) => ROLE_LABELS[role] || String(role || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** "Name (Role · Mandal, Mandal)" for an assignee option. */
export const assigneeLabel = (u) => {
  if (!u) return '';
  const mandals = u.mandals || [];
  const where = mandals.length === 0 ? 'no Mandal'
    : mandals.length <= 2 ? mandals.join(', ') : `${mandals.slice(0, 2).join(', ')} +${mandals.length - 2}`;
  return `${u.name} (${[u.role ? roleLabel(u.role) : null, where].filter(Boolean).join(' · ')})`;
};