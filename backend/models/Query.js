const mongoose = require('mongoose');

/**
 * Query Management (Sales module).
 * A query is a question/issue raised against a product. It records what the
 * query is about, who is responsible for handling it, and its resolution.
 */
const querySchema = new mongoose.Schema({
  product:      { type: String, required: true, trim: true },   // product the query is about
  query:        { type: String, required: true, trim: true },   // the query / question itself
  resolution:   { type: String, default: '' },                  // how it was resolved
  responsible:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // responsible employee
  status:       { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Query', querySchema);
