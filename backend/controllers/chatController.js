const Message = require('../models/Message');
const User = require('../models/User');

// Get all users for DM list (name, role, profilePicture)
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find(
      { _id: { $ne: req.user._id }, isActive: true },
      'name role profilePicture employeeId department'
    ).populate('department', 'name').sort('name');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get messages for a group channel
exports.getGroupMessages = async (req, res) => {
  try {
    const { group } = req.params;
    const validGroups = ['all', 'admin', 'hr', 'sales', 'my_team'];
    if (!validGroups.includes(group)) return res.status(400).json({ message: 'Invalid group' });

    const messages = await Message.find({ chatType: 'group', group })
      .populate('sender', 'name role profilePicture employeeId')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get direct messages between current user and another user
exports.getDirectMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      chatType: 'direct',
      $or: [
        { sender: myId, receiverId: userId },
        { sender: userId, receiverId: myId },
      ],
    })
      .populate('sender', 'name role profilePicture employeeId')
      .sort({ createdAt: 1 })
      .limit(100);

    // Mark messages sent to me as read
    await Message.updateMany(
      { chatType: 'direct', sender: userId, receiverId: myId, readBy: { $ne: myId } },
      { $addToSet: { readBy: myId } }
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get unread counts for current user
exports.getUnreadCounts = async (req, res) => {
  try {
    const myId = req.user._id;

    // Unread direct messages sent to me
    const directUnread = await Message.aggregate([
      {
        $match: {
          chatType: 'direct',
          receiverId: myId,
          readBy: { $ne: myId },
        },
      },
      { $group: { _id: '$sender', count: { $sum: 1 } } },
    ]);

    res.json({ directUnread });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
