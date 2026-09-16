const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category:    { type: String, default: '' },
  price:       { type: Number, default: 0 },
  unit:        { type: String, default: '' },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
  // 'generic' products use the fixed customer schema (createProspect etc).
  // 'schools' products additionally support Category nodes in their
  // location tree, each holding rows with a custom, per-category field set
  // (see ProductLocation.kind and ProductCategoryRow).
  productType: { type: String, enum: ['generic', 'schools'], default: 'generic' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
