const Announcement = require('../models/Announcement');

exports.getAnnouncements = async (req, res) => {
  try {
    const now = new Date();
    const announcements = await Announcement.find({
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, priority, expiresAt } = req.body;
    if (!title || !content) return res.status(400).json({ message: 'Title and content are required' });
    const ann = await Announcement.create({
      title,
      content,
      priority: priority || 'normal',
      createdBy: req.user._id,
      expiresAt: expiresAt || null,
    });
    const populated = await Announcement.findById(ann._id).populate('createdBy', 'name role');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ message: 'Not found' });
    await ann.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
