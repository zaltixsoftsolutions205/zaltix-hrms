const mongoose = require('mongoose');

// A node in a product's location tree. `parent: null` is a top-level
// location; any node can have child locations via other documents
// referencing it as `parent`, and prospects can attach to a node at
// any depth (see ProductProspect.location).
//
// 'schools'-type products additionally allow `kind: 'category'` nodes:
// instead of holding sub-locations or prospects, a category holds rows
// (ProductCategoryRow) whose fields are whatever columns its first
// uploaded sheet had — `fields` tracks that column list, in order.
const productLocationSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  parent:  { type: mongoose.Schema.Types.ObjectId, ref: 'ProductLocation', default: null },
  name:    { type: String, required: true, trim: true },
  kind:    { type: String, enum: ['location', 'category'], default: 'location' },
  fields:  { type: [String], default: [] }, // category-only: ordered column names
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productLocationSchema.index({ product: 1, parent: 1 });

module.exports = mongoose.model('ProductLocation', productLocationSchema);
