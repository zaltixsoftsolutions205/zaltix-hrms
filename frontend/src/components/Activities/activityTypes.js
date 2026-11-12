import { getActivityApi } from '../../services/ActivityService';

/**
 * The lead activity pages. Each one shows the leads in its pipeline stage
 * (placed by follow-up date) and records that stage's entries for a lead.
 * Main fields come from the backend (services/activityTypes.js); visits have
 * their own API, adapted in services/ActivityService.js.
 *
 *   module   module key of the page (constants/modules.js): view = open it, edit = add / change entries
 *   noun     lower-case singular used in sentences ("Add demo")
 *   single   one entry per lead (Data Update)
 *   layout   'table': every lead in the stage as a table; a row opens the add form
 *   wins     after a new entry, offer to mark the lead Lead Won (Registration)
 */
export const ACTIVITY_PAGES = {
  visit: { module: 'visits', key: 'visit', title: 'Visits', label: 'Visit', noun: 'visit', stage: 'visit', single: false },
  demo: { module: 'demos', key: 'demo', title: 'Demos', label: 'Demo', noun: 'demo', stage: 'demo', single: false },
  'data-update': { module: 'data_updation', key: 'data-update', title: 'Data Updation', label: 'Data Update', noun: 'data update', stage: 'data-update', single: true },
  registration: { module: 'registration', key: 'registration', title: 'Registration', label: 'Registration', noun: 'registration', stage: 'registration', single: false, layout: 'table', wins: true },
  feedback: { module: 'feedback', key: 'feedback', title: 'Feedback', label: 'Feedback', noun: 'feedback', stage: 'feedback', single: false },
};

export const ACTIVITY_ORDER = ['visit', 'demo', 'data-update', 'registration', 'feedback'];

export const getPage = (key) => ({ ...ACTIVITY_PAGES[key], api: getActivityApi(key) });

/** The entry's own date (the first date main field). */
export const entryDate = (mainFields, entry) => {
  const f = (mainFields || []).find((m) => m.type === 'date');
  return f ? entry[f.key] : null;
};
