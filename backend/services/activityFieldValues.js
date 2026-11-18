/**
 * activityFieldValues.js
 * ---------------------------------------------------------------------------
 * Lead-table view of the activity form fields (GlobalTableField with appliesTo
 * visit / demo / data-update / registration / feedback). The lead table shows
 * them as READ-ONLY columns: the value from the lead's latest entry of that
 * activity that has the field filled (latest by the entry's own date, then
 * creation time). Values are only ever set in the activity forms.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Visit = require('../models/Visit');
const { ACTIVITY_TYPES } = require('./activityTypes');

const SOURCES = {
  visit: { model: Visit, dateKey: 'visitDate' },
  ...Object.fromEntries(Object.values(ACTIVITY_TYPES).map((t) => [t.key, { model: t.model, dateKey: t.dateKey }])),
};

/**
 * `fields`: activity fields (lean docs), `leadIds`: ids the caller may see.
 * Returns Map<leadId, { <fieldId>: value }>.
 */
async function latestActivityValues(fields, leadIds) {
  const result = new Map();
  const ids = (leadIds || []).map(String).filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length || !fields.length) return result;
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  await Promise.all(fields.map(async (f) => {
    const source = SOURCES[f.appliesTo];
    if (!source) return;
    const path = `customValues.${f._id}`;
    const rows = await source.model.aggregate([
      { $match: { lead: { $in: objectIds }, [path]: { $exists: true, $ne: null } } },
      { $sort: { [source.dateKey]: -1, createdAt: -1 } },
      { $group: { _id: '$lead', value: { $first: `$${path}` } } },
    ]);
    rows.forEach((r) => {
      const key = String(r._id);
      if (!result.has(key)) result.set(key, {});
      result.get(key)[String(f._id)] = r.value;
    });
  }));
  return result;
}

module.exports = { latestActivityValues };
