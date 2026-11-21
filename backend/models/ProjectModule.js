const mongoose = require("mongoose");

/**
 * A card on a project's Module Tree canvas.
 * Links (arrows between cards) are stored on the source card.
 * Tasks & plans attach to a module in Phase 3.
 */
const MODULE_STATUSES = ["planning", "in-progress", "done"];

const linkSchema = new mongoose.Schema(
  {
    target: { type: mongoose.Schema.Types.ObjectId, ref: "ProjectModule", required: true },
    label: { type: String, default: "", trim: true, maxlength: 60 },
  },
  { _id: true }
);

const projectModuleSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    color: { type: String, default: "#7C3AED", trim: true, match: /^#[0-9a-fA-F]{6}$/ },
    status: { type: String, enum: MODULE_STATUSES, default: "planning" },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    links: { type: [linkSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

projectModuleSchema.index(
  { project: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
projectModuleSchema.index({ "links.target": 1 });

projectModuleSchema.statics.STATUSES = MODULE_STATUSES;

module.exports = mongoose.models.ProjectModule || mongoose.model("ProjectModule", projectModuleSchema);
