const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    checkIn: { type: String, default: null }, // HH:mm
    checkOut: { type: String, default: null },
    status: { type: String, enum: ['present', 'absent', 'half-day'], default: 'present' },
    workHours: { type: Number, default: 0 }, // in hours
    notes: { type: String, default: '' },
    // Late / early detection (office: 09:00 – 18:00)
    isLate: { type: Boolean, default: false },
    isEarlyLeave: { type: Boolean, default: false },
    // Location at check-in
    checkInLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    // HR regularization workflow
    regularizationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: null },
    regularizationReason: { type: String, default: '' },
    regularizedCheckIn: { type: String, default: null },
    regularizedCheckOut: {type: String, default: null},
    regularizationComment: { type: String, default: '' },
    // How many times regularization has been submitted for this record
    // (initial request + each resubmit after a rejection). Capped at 3.
    regularizationAttempts: { type: Number, default: 0 },
    // Snapshot of checkIn/checkOut/status/isLate/isEarlyLeave/workHours taken
    // right before an approval overwrites them — lets HR later reverse an
    // approval back to rejected and restore the original punch record.
    preApprovalSnapshot: {
      checkIn: { type: String, default: null },
      checkOut: { type: String, default: null },
      status: { type: String, default: null },
      isLate: { type: Boolean, default: null },
      isEarlyLeave: { type: Boolean, default: null },
      workHours: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
