const mongoose = require('mongoose');

const jobPostingSchema = new mongoose.Schema({
  title:        { type: String, required: true, trim: true },
  department:   { type: String, trim: true, default: '' },
  location:     { type: String, trim: true, default: '' },
  type:         { type: String, enum: ['full-time', 'part-time', 'contract', 'internship'], default: 'full-time' },
  description:  { type: String, default: '' },
  requirements: { type: String, default: '' },
  openings:     { type: Number, default: 1, min: 1 },
  status:       { type: String, enum: ['open', 'on-hold', 'closed'], default: 'open' },
  project:      { type: mongoose.Schema.Types.ObjectId, ref: 'RecruitProject', default: null },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('JobPosting', jobPostingSchema);
