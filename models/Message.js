const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chatType: { type: String, enum: ['group', 'direct'], required: true },
    // group chat: 'all' | 'admin' | 'hr' | 'sales' | 'my_team'
    group: { type: String, default: null },
    // direct chat
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    content: { type: String, required: true, trim: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Index for efficient queries
messageSchema.index({ chatType: 1, group: 1, createdAt: -1 });
messageSchema.index({ chatType: 1, sender: 1, receiverId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
