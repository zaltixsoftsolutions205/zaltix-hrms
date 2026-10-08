import api from '../utils/api';

// ASSUMPTION — please confirm/fix this path.
// No "list users/employees" endpoint was provided anywhere in this project,
// but the "Assign To" field and "person"-type custom fields both need one.
// This guesses the conventional HRMS route. Every place in the Leads UI that
// needs assignable users goes through this single function, so fixing the
// path here (if it's wrong) fixes the whole feature.
export const getAssignableUsers = (params = {}) =>
  api.get('/employees', { params }).then((r) => r.data.employees || r.data.data || r.data);