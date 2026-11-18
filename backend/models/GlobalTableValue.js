const mongoose = require("mongoose");

/**
 * Stores ONE custom-field value for ONE record of the table's entity.
 *
 *   tableId  -> GlobalTable
 *   fieldId  -> GlobalTableField
 *   recordId -> _id of the NATIVE entity record (e.g. a Lead). Not a ref: the
 *               entity differs per table, the registry/adapter resolves it.
 *   value    -> already normalized by globalTableService.normalizeValue:
 *               text/email string | number | currency number (2 dp) |
 *               date/datetime Date | boolean | option string |
 *               array of option strings | array of User ObjectIds (person) |
 *               ObjectId (reference)
 *               null = empty. Formula fields are NEVER stored here.
 *
 * Native entity fields are never duplicated in this collection.
 */
const globalTableValueSchema = new mongoose.Schema(
    {
        tableId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GlobalTable",
            required: true,
            index: true,
        },

        fieldId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GlobalTableField",
            required: true,
            index: true,
        },

        recordId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        value: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// One value per (table, field, record): the basis of upsert behaviour
globalTableValueSchema.index(
    { tableId: 1, fieldId: 1, recordId: 1 },
    { unique: true }
);

// Loading all custom values of a page of records (attachValues / recordIds filter)
globalTableValueSchema.index({ tableId: 1, recordId: 1 });

module.exports = mongoose.model(
    "GlobalTableValue",
    globalTableValueSchema
);