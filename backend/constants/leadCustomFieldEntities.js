/**
 * Registry mapping a "person" custom field's `entity` key to how eligible
 * Users are filtered.
 *
 * ASSUMPTION — please review:
 * The existing User model (models/User.js) has no dedicated "entity" or
 * department-type field. The closest usable signals are:
 *   - `role`        (free string; middleware/roleCheck.js treats
 *                     employee / team-lead / manager / admin as a hierarchy)
 *   - `designation`  (free-text job title, e.g. "Sales Executive")
 *   - `department`   (ObjectId ref -> Department)
 *
 * Until the project has a real entity/department registry, this file
 * matches on `designation` (and falls back to `role` where sensible)
 * because that's the only field that can express domain concepts like
 * "sales_employee" beyond the 4-level role hierarchy. Add/adjust entries
 * here as real entities are defined — nothing else in the custom-field
 * system needs to change when you do.
 */

const LEAD_ENTITY_REGISTRY = {
    sales_employee: {
        label: 'Sales Employee',
        match: (user) => /sales/i.test(user.designation || '') || user.role === 'employee',
    },
    team_lead: {
        label: 'Team Lead',
        match: (user) => user.role === 'team-lead',
    },
    manager: {
        label: 'Manager',
        match: (user) => user.role === 'manager',
    },
};

function isSupportedEntity(entity) {
    return Object.prototype.hasOwnProperty.call(LEAD_ENTITY_REGISTRY, entity);
}

function userMatchesEntity(user, entity) {
    const def = LEAD_ENTITY_REGISTRY[entity];
    if (!def) return false;
    return Boolean(def.match(user));
}

module.exports = { LEAD_ENTITY_REGISTRY, isSupportedEntity, userMatchesEntity };