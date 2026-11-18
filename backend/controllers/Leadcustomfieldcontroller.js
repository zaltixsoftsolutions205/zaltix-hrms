const mongoose = require('mongoose');
const LeadCustomField = require('../models/LeadCustomField');
const LeadCustomFieldValue = require('../models/LeadCustomFieldValue');
const asyncHandler = require('../utils/asyncHandler');
const { generateFieldKey } = require('../utils/leadCustomFieldKey');
const { isSupportedEntity, LEAD_ENTITY_REGISTRY } = require('../constants/leadCustomFieldEntities');

const FIELD_TYPES = ['text', 'number', 'email', 'phone', 'date', 'datetime', 'single-select', 'multi-select', 'person', 'reference', 'checkbox', 'url', 'currency',];
const SELECT_TYPES = ['single-select', 'multi-select'];

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateName(name) {
    if (typeof name !== 'string') return { valid: false, message: 'Field name is required.' };
    const trimmed = name.trim();
    if (!trimmed) return { valid: false, message: 'Field name cannot be empty.' };
    if (trimmed.length < 2) return { valid: false, message: 'Field name is too short (min 2 characters).' };
    if (trimmed.length > 60) return { valid: false, message: 'Field name is too long (max 60 characters).' };
    return { valid: true, value: trimmed };
}

function validateType(type) {
    if (!type || !FIELD_TYPES.includes(type)) {
        return { valid: false, message: `Field type must be one of: ${FIELD_TYPES.join(', ')}` };
    }
    return { valid: true, value: type };
}

// Throws on invalid input — caller wraps in try/catch.
function validateOptions(options) {
    if (!Array.isArray(options) || options.length === 0) {
        throw new Error('At least one option is required for select-type fields.');
    }
    const seenValues = new Set();
    const seenLabels = new Set();
    return options.map((opt, index) => {
        const label = String(opt?.label ?? '').trim();
        const value = String(opt?.value ?? '').trim();
        if (!label) throw new Error(`Option at index ${index} is missing a label.`);
        if (!value) throw new Error(`Option at index ${index} is missing a value.`);
        if (seenValues.has(value)) throw new Error(`Duplicate option value "${value}".`);
        if (seenLabels.has(label.toLowerCase())) throw new Error(`Duplicate option label "${label}".`);
        seenValues.add(value);
        seenLabels.add(label.toLowerCase());
        return { label, value, order: Number.isFinite(opt?.order) ? opt.order : index };
    });
}

function validateEntity(type, entity) {
    if (type !== 'person') return { valid: true, value: null };
    if (!entity || typeof entity !== 'string' || !entity.trim()) {
        return { valid: false, message: 'entity is required when type is "person".' };
    }
    const trimmed = entity.trim();
    if (!isSupportedEntity(trimmed)) {
        return {
            valid: false,
            message: `Unsupported entity "${entity}". Supported entities: ${Object.keys(LEAD_ENTITY_REGISTRY).join(', ')}`,
        };
    }
    return { valid: true, value: trimmed };
}

async function nextFieldOrder() {
    const last = await LeadCustomField.findOne({ isActive: true }).sort({ order: -1 }).select('order');
    return last ? last.order + 1 : 0;
}

function parseOrder(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

// ---------------------------------------------------------------------------
// Controller functions
// ---------------------------------------------------------------------------

/**
 * POST /api/lead-custom-fields
 * Creates a new custom field (column) definition.
 */
const createLeadCustomField = asyncHandler(async (req, res) => {
    if (!req.user) return fail(res, 401, 'Authentication required.');

    const { name, type, entity, options, required, order: requestedOrder } = req.body || {};

    const nameCheck = validateName(name);
    if (!nameCheck.valid) return fail(res, 400, nameCheck.message);

    const typeCheck = validateType(type);
    if (!typeCheck.valid) return fail(res, 400, typeCheck.message);

    const entityCheck = validateEntity(typeCheck.value, entity);
    if (!entityCheck.valid) return fail(res, 400, entityCheck.message);

    let normalizedOptions = [];
    if (SELECT_TYPES.includes(typeCheck.value)) {
        try {
            normalizedOptions = validateOptions(options);
        } catch (err) {
            return fail(res, 400, err.message);
        }
    }

    const key = generateFieldKey(nameCheck.value);
    if (!key) return fail(res, 400, 'Could not generate a valid key from the provided name.');

    const existing = await LeadCustomField.findOne({ key, isActive: true });
    if (existing) return fail(res, 409, 'A custom field with this key already exists');

    let order;
    if (requestedOrder !== undefined) {
        const parsed = parseOrder(requestedOrder);
        if (parsed === null) return fail(res, 400, 'order must be a non-negative number.');
        order = parsed;
    } else {
        order = await nextFieldOrder();
    }

    try {
        const field = await LeadCustomField.create({
            name: nameCheck.value,
            key,
            type: typeCheck.value,
            entity: entityCheck.value,
            options: normalizedOptions,
            required: Boolean(required),
            order,
            createdBy: req.user._id || req.user.id,
        });
        return res.status(201).json({
            success: true,
            message: 'Custom field created successfully',
            data: field,
        });
    } catch (err) {
        if (err?.code === 11000) {
            return fail(res, 409, 'A custom field with this key already exists');
        }
        throw err;
    }
});

/**
 * GET /api/lead-custom-fields
 * Lists all active fields — used by the frontend to build Lead table columns.
 */
const getLeadCustomFields = asyncHandler(async (req, res) => {
    const fields = await LeadCustomField.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    return res.status(200).json({ success: true, data: fields });
});

/**
 * GET /api/lead-custom-fields/:id
 */
const getLeadCustomFieldById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return fail(res, 400, 'Invalid field ID.');
    const field = await LeadCustomField.findById(id);
    if (!field) return fail(res, 404, 'Custom field not found.');
    return res.status(200).json({ success: true, data: field });
});

/**
 * PATCH /api/lead-custom-fields/:id
 * `key` and `type` are immutable — existing LeadCustomFieldValue records
 * depend on both.
 */
const updateLeadCustomField = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return fail(res, 400, 'Invalid field ID.');

    const field = await LeadCustomField.findById(id);
    if (!field) return fail(res, 404, 'Custom field not found.');

    const { name, type, entity, options, required, order, isActive } = req.body || {};

    if (type !== undefined && type !== field.type) {
        return fail(res, 400, 'Field type cannot be changed after creation');
    }

    if (name !== undefined) {
        const nameCheck = validateName(name);
        if (!nameCheck.valid) return fail(res, 400, nameCheck.message);
        field.name = nameCheck.value; // key is intentionally left unchanged
    }

    if (entity !== undefined) {
        const entityCheck = validateEntity(field.type, entity);
        if (!entityCheck.valid) return fail(res, 400, entityCheck.message);
        field.entity = entityCheck.value;
    }

    if (options !== undefined) {
        if (!SELECT_TYPES.includes(field.type)) {
            return fail(res, 400, 'Options can only be set on select-type fields.');
        }
        let normalizedOptions;
        try {
            normalizedOptions = validateOptions(options);
        } catch (err) {
            return fail(res, 400, err.message);
        }

        const newValues = new Set(normalizedOptions.map((o) => o.value));
        const removedValues = (field.options || [])
            .map((o) => o.value)
            .filter((v) => !newValues.has(v));

        if (removedValues.length) {
            // Don't silently corrupt existing Lead data — block removal of an
            // option that's still in use, and tell the caller how many records.
            const inUse = await LeadCustomFieldValue.countDocuments({
                field: field._id,
                $or: [
                    { value: { $in: removedValues } },
                    { value: { $elemMatch: { $in: removedValues } } }, // multi-select
                ],
            });
            if (inUse > 0) {
                return fail(
                    res,
                    409,
                    `Cannot remove option(s) [${removedValues.join(', ')}] — still used by ${inUse} lead(s). ` +
                    'Existing values are left untouched; re-add the option or update those leads first.'
                );
            }
        }

        field.options = normalizedOptions;
    }

    if (required !== undefined) field.required = Boolean(required);
    if (isActive !== undefined) field.isActive = Boolean(isActive);

    if (order !== undefined) {
        const parsed = parseOrder(order);
        if (parsed === null) return fail(res, 400, 'order must be a non-negative number.');
        field.order = parsed;
    }

    await field.save();
    return res.status(200).json({ success: true, message: 'Custom field updated successfully', data: field });
});

/**
 * DELETE /api/lead-custom-fields/:id
 * Soft delete only — LeadCustomFieldValue history must survive.
 */
const deleteLeadCustomField = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return fail(res, 400, 'Invalid field ID.');
    const field = await LeadCustomField.findById(id);
    if (!field) return fail(res, 404, 'Custom field not found.');
    field.isActive = false;
    await field.save();
    return res.status(200).json({ success: true, message: 'Custom field deleted successfully' });
});

/**
 * PATCH /api/lead-custom-fields/reorder
 * Body: { fields: [{ id, order }, ...] }
 */
const reorderLeadCustomFields = asyncHandler(async (req, res) => {
    const { fields } = req.body || {};
    if (!Array.isArray(fields) || fields.length === 0) {
        return fail(res, 400, 'fields must be a non-empty array.');
    }

    const seenOrders = new Set();
    for (const item of fields) {
        if (!item || !isValidObjectId(item.id)) return fail(res, 400, `Invalid field ID: ${item?.id}`);
        const orderNum = parseOrder(item.order);
        if (orderNum === null) return fail(res, 400, `Invalid order for field ${item.id}`);
        if (seenOrders.has(orderNum)) return fail(res, 400, `Duplicate order value: ${orderNum}`);
        seenOrders.add(orderNum);
    }

    const ids = fields.map((f) => f.id);
    const count = await LeadCustomField.countDocuments({ _id: { $in: ids } });
    if (count !== ids.length) return fail(res, 400, 'One or more field IDs do not exist.');

    const ops = fields.map((f) => ({
        updateOne: {
            filter: { _id: f.id },
            update: { $set: { order: Number(f.order) } },
        },
    }));
    await LeadCustomField.bulkWrite(ops);

    const updated = await LeadCustomField.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    return res.status(200).json({ success: true, message: 'Custom fields reordered successfully', data: updated });
});

module.exports = {
    createLeadCustomField,
    getLeadCustomFields,
    getLeadCustomFieldById,
    updateLeadCustomField,
    deleteLeadCustomField,
    reorderLeadCustomFields,
};