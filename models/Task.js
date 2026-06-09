const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['not-started', 'in-progress', 'completed'], default: 'not-started' },
    remarks: { type: String, default: '' },
    proofUrl: { type: String, default: '' },
    completedDate: { type: Date, default: null },
    // Duration-based reminder fields (admin self-tasks)
    duration: { type: Number, default: null },          // minutes; null = no timer
    startedAt: { type: Date, default: null },           // when moved to in-progress
    lastReminderAt: { type: Date, default: null },      // last auto-reminder sent
    isSelfTask: { type: Boolean, default: false },      // assignedBy === assignedTo
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
