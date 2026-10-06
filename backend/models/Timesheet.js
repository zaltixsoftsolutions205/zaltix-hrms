const mongoose = require('mongoose');

// One timesheet per employee per day. Entries are the individual task lines worked
// that day; totalHours is the sum of entry hours (kept denormalised for fast reporting).
//
// Approval routing is resolved at submission time and stored on `routedTo` so the
// timesheet still shows who it went to even if the org structure later changes.
// Routing rules (see timesheetController.resolveApprover):
//   - HR              -> Admin
//   - Marketing/Sales -> HR
//   - Technical       -> Technical department head (tech lead); tech lead -> Admin
//   - everyone is additionally visible to Admin
const entrySchema = new mongoose.Schema({
  // Structured project ref (new). `projectLabel` keeps a denormalised name for
  // display without a populate, and is also where old free-text values live for
  // entries created before this field existed (project stays null for those).
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  projectLabel: { type: String, default: '' },
  task: { type: String, required: true },
  description: { type: String, default: '' },
  // `hours` doubles as "Actual Hours" in the UI/reports — kept singular to avoid
  // a second source of truth for totalHours. It is derived from startTime/endTime
  // by services/taskIntelligence, never typed in.
  hours: { type: Number, required: true, min: 0, max: 24 },
  // System-decided (not user input): median time this kind of work has taken so far.
  estimatedHours: { type: Number, default: null },
  // Coaching feedback comparing actual vs system estimate.
  insight: {
    verdict: { type: String, enum: ['on-target', 'over', 'under', 'in-progress', null], default: null },
    message: { type: String, default: '' },
    basis: { type: String, enum: ['task', 'category', 'default', null], default: null },
    sampleSize: { type: Number, default: 0 },
  },
  workCategory: {
    type: String,
    enum: ['Development', 'Testing', 'Meeting', 'Client Work', 'Support', 'Documentation', 'Research', 'Training', 'Administrative', 'Other'],
    default: 'Other',
  },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  dueDate: { type: Date, default: null },
  completionPercentage: { type: Number, min: 0, max: 100, default: null },
  // Work status of this task line — distinct from the day-level approval `status` below.
  status: { type: String, enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'], default: 'Not Started' },
  blocker: { type: String, default: '' },
  remarks: { type: String, default: '' },
});

const timesheetSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    entries: { type: [entrySchema], default: [] },
    totalHours: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },

    // Who this timesheet is routed to for approval (resolved at submit time).
    routedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    routedRole: { type: String, enum: ['admin', 'hr', 'lead'], default: null },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewDate: { type: Date, default: null },
    reviewerComments: { type: String, default: '' },

    // Daily update — free-standing per day, no approval. `savedAt` is the signal
    // the calendar color-coding and the missing-update reminder key off.
    dailyUpdate: {
      completedToday: { type: String, default: '' },
      continuingTomorrow: { type: String, default: '' },
      blockers: { type: String, default: '' },
      dayStatus: { type: String, enum: ['Productive', 'Partially Productive', 'Blocked', null], default: null },
      savedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// One timesheet per employee per calendar day.
timesheetSchema.index({ employee: 1, date: 1 }, { unique: true });

timesheetSchema.pre('save', function (next) {
  this.totalHours = (this.entries || []).reduce((sum, e) => sum + (e.hours || 0), 0);
  next();
});

module.exports = mongoose.model('Timesheet', timesheetSchema);
