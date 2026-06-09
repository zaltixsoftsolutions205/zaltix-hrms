const mongoose = require('mongoose');

const prospectSchema = new mongoose.Schema({
  product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  companyName:  { type: String, required: true, trim: true },
  address:      { type: String, default: '' },
  website:      { type: String, default: '' },
  contactNumber:{ type: String, default: '' },
  emailId:      { type: String, default: '' },
  linkedinUrl:  { type: String, default: '' },
  companyType:  { type: String, default: '' },
  companySize:  { type: String, default: '' },
  remarks:      { type: String, default: '' },
  status:       { type: String, enum: ['new', 'contacted', 'interested', 'not-interested', 'converted'], default: 'new' },
  addedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  convertedToLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
}, { timestamps: true });

module.exports = mongoose.model('ProductProspect', prospectSchema);
