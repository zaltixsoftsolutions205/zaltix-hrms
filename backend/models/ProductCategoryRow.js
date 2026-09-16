const mongoose = require('mongoose');

// A single record inside a Category node (ProductLocation with
// kind: 'category'). Fields are freeform key/value pairs matching the
// category's own field list (ProductLocation.fields) rather than a fixed
// schema — different categories can have entirely different columns.
//
// Stored as an array of {key, value} pairs rather than a Mongoose Map:
// spreadsheet column headers routinely contain dots ("Sl.No") or other
// characters Mongo forbids in a Map/document field name, so a Map would
// reject perfectly normal column names.
const fieldEntrySchema = new mongoose.Schema({
  key:   { type: String, required: true },
  value: { type: String, default: '' },
}, { _id: false });

const productCategoryRowSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductLocation', required: true },
  fields:   { type: [fieldEntrySchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productCategoryRowSchema.index({ category: 1 });

module.exports = mongoose.model('ProductCategoryRow', productCategoryRowSchema);
