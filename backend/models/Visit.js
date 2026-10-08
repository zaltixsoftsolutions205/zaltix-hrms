const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema(
  {
    /* =========================================================
       LEAD
    ========================================================= */

    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
    /* =========================================================
       VISIT DETAILS
    ========================================================= */
    visitDate: {
      type: Date,
      required: true,
    },
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

    // status: {
    //   type: String,
    //   enum: [
    //     "scheduled",
    //     "in-progress",
    //     "completed",
    //     "cancelled",
    //     "rescheduled",
    //   ],
    //   default: "scheduled",
    //   index: true,
    // },

    visitType: {
      type: String,
      enum: [
        "field-visit",
        "office-visit",
        "customer-location",
        "other",
      ],
      default: "field-visit",
    },

    /* =========================================================
       FEEDBACK FROM LEAD / CONTACTED PERSON
    ========================================================= */

    leadFeedback: {
      type: String,
      enum: [
        "using-other-application",
        "not-interested",
        "not-now-but-interested",
        "interested",
        "not-affordable",
        "others",
        "",
      ],
      default: "",
    },

    leadFeedbackOther: {
      type: String,
      default: "",
      trim: true,
    },

    /* =========================================================
       SALES PERSON COMMENT
    ========================================================= */

    salesComment: {
      type: String,
      enum: [
        "interested",
        "needs-follow-up",
        "needs-to-revisit",
        "next-time",
        "others",
        "",
      ],
      default: "",
    },

    salesCommentOther: {
      type: String,
      default: "",
      trim: true,
    },

    salesNotes: {
      type: String,
      default: "",
      trim: true,
    },

    /* =========================================================
       FOLLOW-UP
    ========================================================= */

    nextFollowUpDate: {
      type: Date,
      default: null,
    },

    /* =========================================================
       AUDIT
    ========================================================= */

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   INDEXES
========================================================= */

visitSchema.index({ lead: 1, visitDate: -1 });
visitSchema.index({ visitedBy: 1, visitDate: -1 });
visitSchema.index({ status: 1, visitDate: 1 });

module.exports = mongoose.model("Visit", visitSchema);