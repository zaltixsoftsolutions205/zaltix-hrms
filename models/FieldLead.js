const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type: { type: String, enum: ['call', 'demo', 'visit', 'note'], required: true },
  note: { type: String, required: true },
  date: { type: Date, default: Date.now },
  by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const fieldLeadSchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, trim: true },
    phone:   { type: String, required: true, trim: true },
    email:   { type: String, default: '', trim: true },
    company: { type: String, default: '', trim: true },
    address: { type: String, default: '' },
    source:  { type: String, enum: ['walk-in', 'referral', 'cold-call', 'social', 'other'], default: 'other' },
    stage: {
      type: String,
      enum: ['lead', 'called', 'demo_booked', 'visit_scheduled', 'visit_done', 'converted'],
      default: 'lead',
    },
    priority:     { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    callNotes:    { type: String, default: '' },
    demoDate:     { type: Date, default: null },
    visitDate:    { type: Date, default: null },
    visitNotes:   { type: String, default: '' },
    convertedDate:{ type: Date, default: null },
    activities:   [activitySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('FieldLead', fieldLeadSchema);
