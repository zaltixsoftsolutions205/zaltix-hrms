const mongoose = require("mongoose");

/**
 * One visit to a Lead, with all of its fields. `customValues` holds the lead
 * table's Visit form fields ({ <GlobalTableField id>: value },
 * services/activityCustomFields.js).
 * The allowed select values are defined in services/activityTypes.js
 * (VISIT_DETAIL_FIELDS) and checked by the visits API.
 */
const visitSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },

    // Calendar day of the visit (UTC midnight).
    visitDate: {
      type: Date,
      required: true,
    },

    // The employee who made the visit: always the user who submitted it.
    visitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    timeIn: {
      type: Date,
      default: null,
    },

    timeOut: {
      type: Date,
      default: null,
    },

    visitType: { type: String, trim: true, default: "" },
    contactPerson: { type: String, trim: true, maxlength: 100, default: "" },
    contactNumber: { type: String, trim: true, maxlength: 10, default: "" }, // 10 digits
    location: { type: String, trim: true, maxlength: 200, default: "" },
    purpose: { type: String, trim: true, default: "" },
    // Shown as "Visit Outcome".
    leadFeedback: { type: String, trim: true, default: "" },
    leadFeedbackOther: { type: String, trim: true, maxlength: 5000, default: "" },
    salesComment: { type: String, trim: true, default: "" },
    salesCommentOther: { type: String, trim: true, maxlength: 5000, default: "" },
    salesNotes: { type: String, trim: true, maxlength: 5000, default: "" },
    customValues: { type: mongoose.Schema.Types.Mixed, default: {} },

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

visitSchema.index({ lead: 1, visitDate: -1 });
visitSchema.index({ visitedBy: 1, visitDate: -1 });

const Visit = mongoose.model("Visit", visitSchema);

// The fields the API returns.
Visit.SELECT_FIELDS = "lead visitDate visitedBy timeIn timeOut visitType contactPerson contactNumber location purpose leadFeedback leadFeedbackOther salesComment salesCommentOther salesNotes customValues createdBy updatedBy createdAt updatedAt";

module.exports = Visit;
