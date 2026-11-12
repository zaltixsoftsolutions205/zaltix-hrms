const mongoose = require("mongoose");

/**
 * Shared schema of the lead activity records (Demo, DataUpdate, Registration,
 * Feedback). Like Visit, each holds all of its fields (services/activityTypes.js),
 * plus `customValues`: the values of the lead table's form fields for this
 * activity ({ <GlobalTableField id>: value }, services/activityCustomFields.js).
 *
 *   dateKey  the activity's own calendar day (stored as UTC midnight)
 *   extra    type-specific main fields
 *   single   true -> at most one record per lead (unique index on lead)
 */
const makeActivitySchema = ({ dateKey, extra = {}, single = false }) => {
  const schema = new mongoose.Schema(
    {
      lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: !single },
      [dateKey]: { type: Date, required: true },
      startTime: { type: Date, default: null },
      endTime: { type: Date, default: null },
      // The employee who did it (picked in the form; defaults to the submitter).
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      ...extra,
      customValues: { type: mongoose.Schema.Types.Mixed, default: {} },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
  );
  if (single) schema.index({ lead: 1 }, { unique: true });
  else schema.index({ lead: 1, [dateKey]: -1 });
  schema.index({ assignedTo: 1, [dateKey]: -1 });
  return schema;
};

// Field helpers for the type-specific fields (validated by the API: services/activityTypes.js).
const text = (max) => ({ type: String, trim: true, maxlength: max, default: "" });
const notes = () => text(5000);
// A select value; "" = not chosen.
const choice = (values) => ({ type: String, enum: [...values, ""], default: "" });
const rating = (required = false) => (required
  ? { type: Number, required: true, min: 1, max: 5 }
  : { type: Number, min: 1, max: 5, default: null });

// An uploaded file (stored under private-uploads/activity-files, served only
// through GET /api/activities/<type>/entries/:id/file).
const fileField = () => ({
  type: new mongoose.Schema({
    fileName: String, // stored name on disk
    originalName: String,
    mimeType: String,
    size: Number,
    uploadedAt: Date,
  }, { _id: false }),
  default: null,
});

module.exports = { makeActivitySchema, text, notes, choice, rating, fileField };
