const mongoose = require('mongoose');

const applicantSchema = new mongoose.Schema({
  jobPosting:  { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  name:        { type: String, required: true, trim: true },
  yearsOfExperience: { type: Number, default: null },
  resumeUrl:   { type: String, default: '' },
  status:      {
    type: String,
    enum: ['interested', 'not-interested', 'shortlisted', 'processed', 'rejected', 'onboarded', 'joined'],
    default: 'interested',
  },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Applicant', applicantSchema);
