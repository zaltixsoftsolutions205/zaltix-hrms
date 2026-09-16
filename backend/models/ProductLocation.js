const mongoose = require('mongoose');

// A node in a product's location tree. `parent: null` is a top-level
// location; any node can have child locations via other documents
// referencing it as `parent`, and prospects can attach to a node at
// any depth (see ProductProspect.location).
const productLocationSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  parent:  { type: mongoose.Schema.Types.ObjectId, ref: 'ProductLocation', default: null },
  name:    { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productLocationSchema.index({ product: 1, parent: 1 });

module.exports = mongoose.model('ProductLocation', productLocationSchema);
