const mongoose = require("mongoose");

/**
 * Field types.
 *
 * Original types are all kept (backward compatible with stored documents):
 *   text, number, currency, date, boolean, single-select, multi-select,
 *   reference, formula
 * Added:
 *   datetime, checkbox, person, email
 *
 * `reference` is the legacy generic ObjectId type (shape-checked only).
 * `person` is the user-picker type (array of User ids).
 * Exposed as GlobalTableField.FIELD_TYPES so validators/services read ONE list
 * (same pattern as Lead.PIPELINE_STAGES).
 */
const FIELD_TYPES = [
    "text",
    "number",
    "currency",
    "date",
    "datetime",
    "checkbox",
    "boolean",
    "single-select",
    "multi-select",
    "person",
    "email",
    "reference",
    "formula",
];

/**
 * Where a field is shown (`appliesTo`):
 *   lead          a column of the lead table (default; also every older field)
 *   visit, demo, data-update, registration, feedback
 *                 a field of that activity's form for the leads of this table.
 *                 Its values are stored on the activity entry (customValues),
 *                 never in GlobalTableValue, and it is not a lead column.
 */
const APPLIES_TO = ["lead", "visit", "demo", "data-update", "registration", "feedback"];
// Types an activity form field may have (no formula / reference / person).
const ACTIVITY_FIELD_TYPES = ["text", "number", "currency", "date", "datetime", "checkbox", "boolean", "single-select", "multi-select", "email"];
// Matches lead-table fields, including older documents without appliesTo.
const LEAD_FIELD_FILTER = { appliesTo: { $in: ["lead", null] } };

const globalTableFieldSchema = new mongoose.Schema(
    {
        tableId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GlobalTable",
            required: true,
            index: true,
        },

        key: {
            type: String,
            required: true,
            trim: true,
        },

        label: {
            type: String,
            required: true,
            trim: true,
        },

        type: {
            type: String,
            required: true,
            enum: FIELD_TYPES,
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        options: {
            type: [
                {
                    label: String,
                    value: String,
                },
            ],
            default: [],
        },

        /**
         * Type-specific configuration. Absent on every existing document.
         *   formula -> expression : arithmetic expression (see formulas/formulaEngine.js)
         *   person  -> role       : OPTIONAL hint for the frontend user picker only.
         *                           The backend never validates a user's role against it.
         */
        config: {
            type: new mongoose.Schema(
                {
                    expression: { type: String, trim: true, maxlength: 500 },
                    role: { type: String, trim: true, maxlength: 50 },
                },
                { _id: false }
            ),
            default: undefined,
        },

        appliesTo: {
            type: String,
            enum: APPLIES_TO,
            default: "lead",
        },

        required: {
            type: Boolean,
            default: false,
        },

        systemManaged: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        position: {
            type: Number,
            default: 0,
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

globalTableFieldSchema.index(
    { tableId: 1, key: 1 },
    { unique: true }
);

const GlobalTableField = mongoose.model(
    "GlobalTableField",
    globalTableFieldSchema
);

GlobalTableField.FIELD_TYPES = FIELD_TYPES;
GlobalTableField.APPLIES_TO = APPLIES_TO;
GlobalTableField.ACTIVITY_FIELD_TYPES = ACTIVITY_FIELD_TYPES;
GlobalTableField.LEAD_FIELD_FILTER = LEAD_FIELD_FILTER;
GlobalTableField.isLeadField = (field) => !field.appliesTo || field.appliesTo === "lead";

module.exports = GlobalTableField;