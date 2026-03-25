const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true },
  content:   { type: String, required: true },
  priority:  { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
