const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    docType: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending_upload', 'uploaded', 'approved', 'rejected'],
      default: 'pending_upload',
    },
    filePath: { type: String, default: null },
    rejectionReason: { type: String, default: '' },
    uploadedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

documentSchema.index({ employee: 1, docType: 1 }, { unique: true });

module.exports = mongoose.model('Document', documentSchema);
