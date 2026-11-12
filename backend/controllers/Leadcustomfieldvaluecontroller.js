const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const LeadCustomField = require('../models/LeadCustomField');
const LeadCustomFieldValue = require('../models/LeadCustomFieldValue');
const asyncHandler = require('../utils/asyncHandler');
const {
  validateCustomFieldValue,
  enforceRequired,
  FieldValidationError,
} = require('../utils/leadCustomFieldValueValidator');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/**
 * GET /api/leads/:leadId/custom-fields
 * Every active field for this Lead, paired with its current value.
 * This is what the frontend uses to render all custom-field cells in a row.
 */
const getLeadCustomFieldValues = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  if (!isValidObjectId(leadId)) return fail(res, 400, 'Invalid lead ID.');

  const lead = await Lead.findById(leadId).select('_id');
  if (!lead) return fail(res, 404, 'Lead not found.');

  const fields = await LeadCustomField.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
  const values = await LeadCustomFieldValue.find({ lead: leadId });
  const valueByField = new Map(values.map((v) => [String(v.field), v]));

  // Batch-populate person fields in a single query rather than one per field.
  const personUserIds = fields
    .filter((f) => f.type === 'person')
    .map((f) => valueByField.get(String(f._id))?.value)
    .filter(Boolean);

  const users = personUserIds.length
    ? await User.find({ _id: { $in: personUserIds } }).select('name employeeId designation')
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const data = fields.map((field) => {
    const stored = valueByField.get(String(field._id));
    const value = stored ? stored.value : null;
    const entry = {
      field: {
        _id: field._id,
        name: field.name,
        key: field.key,
        type: field.type,
        entity: field.entity,
        options: field.options,
        required: field.required,
        order: field.order,
      },
      value,
    };
    if (field.type === 'person') {
      entry.user = value ? userById.get(String(value)) || null : null;
    }
    return entry;
  });

  return res.status(200).json({ success: true, data });
});

/**
 * GET /api/leads/:leadId/custom-fields/:fieldId
 * Single-cell read.
 */
const getLeadCustomFieldValue = asyncHandler(async (req, res) => {
  const { leadId, fieldId } = req.params;
  if (!isValidObjectId(leadId)) return fail(res, 400, 'Invalid lead ID.');
  if (!isValidObjectId(fieldId)) return fail(res, 400, 'Invalid field ID.');

  const field = await LeadCustomField.findOne({ _id: fieldId, isActive: true });
  if (!field) return fail(res, 404, 'Custom field not found.');

  const stored = await LeadCustomFieldValue.findOne({ lead: leadId, field: fieldId });
  return res.status(200).json({ success: true, data: { field, value: stored ? stored.value : null } });
});

/**
 * PUT /api/leads/:leadId/custom-fields/:fieldId
 * Body: { value: <anything, validated against field.type> }
 * Creates or updates the single value document for (lead, field).
 */
const upsertLeadCustomFieldValue = asyncHandler(async (req, res) => {
  if (!req.user) return fail(res, 401, 'Authentication required.');

  const { leadId, fieldId } = req.params;
  if (!isValidObjectId(leadId)) return fail(res, 400, 'Invalid lead ID.');
  if (!isValidObjectId(fieldId)) return fail(res, 400, 'Invalid field ID.');

  const lead = await Lead.findById(leadId).select('_id');
  if (!lead) return fail(res, 404, 'Lead not found.');

  const field = await LeadCustomField.findById(fieldId);
  if (!field) return fail(res, 404, 'Custom field not found.');
  if (!field.isActive) return fail(res, 400, 'This custom field has been deleted and no longer accepts values.');

  let normalizedValue;
  try {
    const result = await validateCustomFieldValue(field, req.body?.value);
    enforceRequired(field, result.value);
    normalizedValue = result.value;
  } catch (err) {
    if (err instanceof FieldValidationError) return fail(res, 400, err.message);
    throw err;
  }

  try {
    const updated = await LeadCustomFieldValue.findOneAndUpdate(
      { lead: leadId, field: fieldId },
      { $set: { value: normalizedValue } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.status(200).json({
      success: true,
      message: 'Custom field value updated successfully',
      data: updated,
    });
  } catch (err) {
    if (err?.code === 11000) {
      // Two concurrent upserts raced — the unique (lead, field) index means
      // the document now exists; a plain update finishes the job safely.
      const existing = await LeadCustomFieldValue.findOneAndUpdate(
        { lead: leadId, field: fieldId },
        { $set: { value: normalizedValue } },
        { new: true }
      );
      return res.status(200).json({
        success: true,
        message: 'Custom field value updated successfully',
        data: existing,
      });
    }
    throw err;
  }
});

/**
 * DELETE /api/leads/:leadId/custom-fields/:fieldId
 * Clears this Lead's value for the field. Does NOT touch the field definition.
 */
const deleteLeadCustomFieldValue = asyncHandler(async (req, res) => {
  const { leadId, fieldId } = req.params;
  if (!isValidObjectId(leadId)) return fail(res, 400, 'Invalid lead ID.');
  if (!isValidObjectId(fieldId)) return fail(res, 400, 'Invalid field ID.');

  const lead = await Lead.findById(leadId).select('_id');
  if (!lead) return fail(res, 404, 'Lead not found.');

  const field = await LeadCustomField.findById(fieldId).select('_id');
  if (!field) return fail(res, 404, 'Custom field not found.');

  await LeadCustomFieldValue.findOneAndDelete({ lead: leadId, field: fieldId });
  return res.status(200).json({ success: true, message: 'Custom field value cleared successfully' });
});

module.exports = {
  getLeadCustomFieldValues,
  getLeadCustomFieldValue,
  upsertLeadCustomFieldValue,
  deleteLeadCustomFieldValue,
};