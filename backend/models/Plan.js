const mongoose = require("mongoose");

/**
 * A plan groups tasks inside a project module. Its progress is not stored:
 * it is computed from the tasks that point to it (Task.plan).
 */
const planSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    module: { type: mongoose.Schema.Types.ObjectId, ref: "ProjectModule", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

planSchema.pre("validate", function (next) {
  if (this.startDate && this.endDate && this.startDate > this.endDate) {
    return next(new Error("Plan end date must be after its start date."));
  }
  return next();
});

module.exports = mongoose.models.Plan || mongoose.model("Plan", planSchema);
