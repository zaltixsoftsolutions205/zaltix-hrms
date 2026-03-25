const mongoose = require('mongoose');

const ktProgressSchema = new mongoose.Schema({
  employee:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  topic:       { type: mongoose.Schema.Types.ObjectId, ref: 'KTTopic', required: true },
  completed:   { type: Boolean, default: false },
  completedAt: { type: Date,    default: null },
  startedAt:   { type: Date,    default: Date.now },
}, { timestamps: true });

ktProgressSchema.index({ employee: 1, topic: 1 }, { unique: true });

module.exports = mongoose.model('KTProgress', ktProgressSchema);
