const mongoose = require('mongoose');

const productivityScoreSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    week: { type: String, required: true }, // ISO week label e.g. "2026-W10"
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },

    // Component scores (0–100)
    taskScore: { type: Number, default: 0 },
    attendanceScore: { type: Number, default: 0 },
    crmScore: { type: Number, default: null }, // null for non-sales roles

    // Final weighted score
    totalScore: { type: Number, default: 0 },

    // Raw data used for calculation
    tasksCompleted: { type: Number, default: 0 },
    tasksTotal: { type: Number, default: 0 },
    tasksOverdue: { type: Number, default: 0 },
    attendanceDays: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    earlyLeaveDays: { type: Number, default: 0 },
    leadsConverted: { type: Number, default: 0 },
    leadsTotal: { type: Number, default: 0 },
    leadsWithActivity: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productivityScoreSchema.index({ employee: 1, week: 1 }, { unique: true });
productivityScoreSchema.index({ weekStart: -1 });

module.exports = mongoose.model('ProductivityScore', productivityScoreSchema);
