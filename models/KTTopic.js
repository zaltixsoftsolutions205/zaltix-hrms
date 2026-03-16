const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url:  { type: String, required: true },
  type: { type: String, enum: ['pdf', 'video', 'image', 'link', 'document'], default: 'link' },
}, { _id: false });

const ktTopicSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['company_overview', 'department_training', 'work_processes', 'tool_tutorials', 'product_training'],
    required: true,
  },
  content:     { type: String, default: '' },  // rich text / markdown
  attachments: [attachmentSchema],
  assignedRoles: [{
    type: String,
    enum: ['employee', 'sales', 'field_sales', 'hr', 'admin'],
  }],
  isRequired:          { type: Boolean, default: true },
  isActive:            { type: Boolean, default: true },
  order:               { type: Number,  default: 0 },
  estimatedDuration:   { type: Number,  default: 30 },  // minutes
  tags:                [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('KTTopic', ktTopicSchema);
