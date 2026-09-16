const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category:    { type: String, default: '' },
  price:       { type: Number, default: 0 },
  unit:        { type: String, default: '' },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
  // Known location names for this product's prospects, including ones with
  // no prospects yet — lets a location be created before any customer exists.
  locations:   { type: [String], default: [] },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
