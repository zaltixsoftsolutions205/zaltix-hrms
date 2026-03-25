const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  type: { type: String, enum: ['national', 'company', 'optional'], default: 'national' },
  year: { type: Number, required: true },
}, { timestamps: true });

holidaySchema.index({ date: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);
