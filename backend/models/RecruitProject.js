const mongoose = require('mongoose');

// HR recruitment projects (e.g. "lancesoft", "QA Tester intern resumes") that group
// job postings and their resumes. Stored in the `recruitprojects` collection.
// Separate from TimesheetProject (timesheet project list) and from the workspace
// Project model, so changes to those never hide HR's recruitment data.
const projectSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('RecruitProject', projectSchema);
