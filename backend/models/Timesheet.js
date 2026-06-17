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
const entrySchema = new mongoose.Schema(
  {
    project: { type: String, default: '' },
    task: { type: String, required: true },
    hours: { type: Number, required: true, min: 0, max: 24 },
    description: { type: String, default: '' },
  },
  { _id: false }
);

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
