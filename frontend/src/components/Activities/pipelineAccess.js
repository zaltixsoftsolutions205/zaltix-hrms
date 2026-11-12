import { canAccessEdit, canAccessEditAny, canAccessView } from '../../constants/modules';
import { ACTIVITY_PAGES } from './activityTypes';

/**
 * Who sees what on the lead page and in the lead drawer (module access, see
 * constants/modules.js and the ModuleAccessPicker).
 *   lead fields (main + custom)  everyone who can open the lead; edit needs
 *                                edit on CRM or on the Leads page module
 *   pipeline stages              admin / HR / managers only; adding and editing a
 *                                stage's entries needs edit on that stage's page
 *                                (visits, demos, data_updation, registration, feedback)
 *   changing the stage           lead edit
 * The backend checks the same rules (routes/leads.js, routes/visits.js, routes/activities.js).
 */
export const PIPELINE_ROLES = ['admin', 'hr', 'manager'];
export const LEAD_MODULES = ['crm', 'lead'];

export const canEditLead = (user) => canAccessEditAny(user, LEAD_MODULES);
export const canSeePipeline = (user) => PIPELINE_ROLES.includes(user?.role) && LEAD_MODULES.some((m) => canAccessView(user, m));
export const canEditPipeline = (user) => canSeePipeline(user) && canEditLead(user);
/** May add / change entries of one stage (`type`: visit, demo, data-update, ...). */
export const canEditStage = (user, type) => canSeePipeline(user) && canAccessEdit(user, ACTIVITY_PAGES[type]?.module);
