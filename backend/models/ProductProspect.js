const mongoose = require('mongoose');

const prospectSchema = new mongoose.Schema({
  product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  companyName:  { type: String, required: true, trim: true },
  // The specific location node this prospect belongs to (any depth in the
  // tree). null = unassigned ("Unspecified"). The full breadcrumb path is
  // computed on read by walking ProductLocation.parent — not stored here,
  // so renaming an ancestor doesn't require touching every prospect.
  location:     { type: mongoose.Schema.Types.ObjectId, ref: 'ProductLocation', default: null },
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
