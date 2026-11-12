const mongoose = require('mongoose');

// Lightweight project taxonomy that Timesheet entries reference, so time can be
// grouped/filtered cleanly by project instead of free text. Not a project-management
// system — just a referenceable, filterable list.
const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    description: { type: String, default: '' },
    // Soft-deactivate instead of delete so historical Timesheet entries referencing
    // this project still resolve a name.
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Informational "who's on this project" list — does NOT restrict the
    // task-entry dropdown, every employee can still log time against any
    // active project. Purely for visibility/reporting.
    assignedEmployees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

projectSchema.index({ name: 1, department: 1 }, { unique: true });
projectSchema.index({ isActive: 1, department: 1 });

// Separate from the full project-management Project model (workspace/CRM side).
module.exports = mongoose.model('TimesheetProject', projectSchema);
