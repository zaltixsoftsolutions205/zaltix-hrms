const KTTopic    = require('../models/KTTopic');
const KTProgress = require('../models/KTProgress');
const User       = require('../models/User');

/* ─────────────────────────────────────────
   GET /api/kt
   List topics. Employees see only topics
   assigned to their role (or all roles).
   Admin/HR see everything.
───────────────────────────────────────── */
exports.getTopics = async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: true };

    if (!['admin', 'hr'].includes(req.user.role)) {
      filter.$or = [
        { assignedRoles: { $in: [req.user.role] } },
        { assignedRoles: { $size: 0 } },
      ];
    }
    if (category) filter.category = category;
    if (search)   filter.title    = { $regex: search, $options: 'i' };

    const topics = await KTTopic.find(filter)
      .sort({ category: 1, order: 1, createdAt: -1 })
      .populate('createdBy', 'name employeeId');

    // Attach progress for the calling user
    const progressRecords = await KTProgress.find({
      employee: req.user._id,
      topic: { $in: topics.map(t => t._id) },
    });
    const progressMap = {};
    progressRecords.forEach(p => { progressMap[p.topic.toString()] = p; });

    const data = topics.map(t => ({
      ...t.toObject(),
      progress: progressMap[t._id.toString()] || null,
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   GET /api/kt/:id
───────────────────────────────────────── */
exports.getTopic = async (req, res) => {
  try {
    const topic = await KTTopic.findById(req.params.id)
      .populate('createdBy', 'name employeeId');
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

    const progress = await KTProgress.findOne({
      employee: req.user._id,
      topic:    topic._id,
    });

    res.json({ success: true, data: { ...topic.toObject(), progress } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   POST /api/kt  (admin)
───────────────────────────────────────── */
exports.createTopic = async (req, res) => {
  try {
    const topic = await KTTopic.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: topic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   PUT /api/kt/:id  (admin)
───────────────────────────────────────── */
exports.updateTopic = async (req, res) => {
  try {
    const topic = await KTTopic.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });
    res.json({ success: true, data: topic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   DELETE /api/kt/:id  (admin)
───────────────────────────────────────── */
exports.deleteTopic = async (req, res) => {
  try {
    await KTTopic.findByIdAndDelete(req.params.id);
    await KTProgress.deleteMany({ topic: req.params.id });
    res.json({ success: true, message: 'Topic deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   POST /api/kt/:id/start
───────────────────────────────────────── */
exports.markStarted = async (req, res) => {
  try {
    await KTProgress.findOneAndUpdate(
      { employee: req.user._id, topic: req.params.id },
      { $setOnInsert: { startedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   POST /api/kt/:id/complete
───────────────────────────────────────── */
exports.markComplete = async (req, res) => {
  try {
    const progress = await KTProgress.findOneAndUpdate(
      { employee: req.user._id, topic: req.params.id },
      { completed: true, completedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: progress });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   GET /api/kt/progress/me
───────────────────────────────────────── */
exports.getMyProgress = async (req, res) => {
  try {
    const topics = await KTTopic.find({
      isActive: true,
      $or: [
        { assignedRoles: { $in: [req.user.role] } },
        { assignedRoles: { $size: 0 } },
      ],
    }).select('_id title category isRequired');

    const completedIds = await KTProgress.find({
      employee:  req.user._id,
      completed: true,
      topic:     { $in: topics.map(t => t._id) },
    }).distinct('topic');

    const completedSet = new Set(completedIds.map(id => id.toString()));

    res.json({
      success: true,
      data: {
        total:      topics.length,
        completed:  completedIds.length,
        percentage: topics.length
          ? Math.round((completedIds.length / topics.length) * 100)
          : 0,
        topics: topics.map(t => ({
          ...t.toObject(),
          completed: completedSet.has(t._id.toString()),
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────
   GET /api/kt/progress/report  (admin/hr)
───────────────────────────────────────── */
exports.getProgressReport = async (req, res) => {
  try {
    const allTopics = await KTTopic.find({ isActive: true })
      .select('title category isRequired estimatedDuration');

    const allEmployees = await User.find({ isActive: true, role: { $nin: ['admin'] } })
      .select('name employeeId role department')
      .populate('department', 'name');

    const allProgress = await KTProgress.find({ completed: true })
      .select('employee topic');

    const progressMap = {};
    allProgress.forEach(p => {
      const key = p.employee.toString();
      if (!progressMap[key]) progressMap[key] = new Set();
      progressMap[key].add(p.topic.toString());
    });

    const topicIds = new Set(allTopics.map(t => t._id.toString()));

    const report = allEmployees.map(emp => {
      const done = progressMap[emp._id.toString()] || new Set();
      const completedCount = [...done].filter(tid => topicIds.has(tid)).length;
      return {
        employee:   emp,
        total:      allTopics.length,
        completed:  completedCount,
        percentage: allTopics.length
          ? Math.round((completedCount / allTopics.length) * 100)
          : 0,
      };
    });

    res.json({ success: true, data: report, topics: allTopics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
