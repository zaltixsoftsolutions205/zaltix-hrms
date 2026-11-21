const mongoose = require("mongoose");

/** A comment on a project module work item (task, bug or milestone). */
const workItemCommentSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

workItemCommentSchema.index({ task: 1, createdAt: 1 });

module.exports = mongoose.models.WorkItemComment || mongoose.model("WorkItemComment", workItemCommentSchema);
