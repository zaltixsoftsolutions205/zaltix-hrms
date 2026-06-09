const FieldLead = require('../models/FieldLead');

const STAGE_FLOW = ['lead', 'called', 'demo_booked', 'visit_scheduled', 'visit_done', 'converted'];

const NEXT_STAGE = {
  lead: 'called',
  called: 'demo_booked',
  demo_booked: 'visit_scheduled',
  visit_scheduled: 'visit_done',
  visit_done: 'converted',
};

const STAGE_LABEL = {
  lead: 'New Lead',
  called: 'Called',
  demo_booked: 'Demo Booked',
  visit_scheduled: 'Visit Scheduled',
  visit_done: 'Visit Done',
  converted: 'Converted',
};

// field_sales users see only their own; admin sees all
const ownerFilter = (user) =>
  user.role === 'admin' ? {} : { assignedTo: user._id };

exports.getFieldLeads = async (req, res) => {
  try {
    const { stage, search } = req.query;
    const filter = ownerFilter(req.user);
    if (stage && stage !== 'all') filter.stage = stage;
    if (search) {
      const re = { $regex: search, $options: 'i' };
      filter.$or = [{ name: re }, { phone: re }, { company: re }];
    }
    const leads = await FieldLead.find(filter)
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name employeeId')
      .populate('activities.by', 'name');
    res.json({ leads });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const matchFilter = ownerFilter(req.user);
    const counts = await FieldLead.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]);
    const stats = {};
    STAGE_FLOW.forEach(s => { stats[s] = 0; });
    counts.forEach(c => { stats[c._id] = c.count; });
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    res.json({ stats, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createFieldLead = async (req, res) => {
  try {
    const { name, phone, email, company, address, source, priority } = req.body;
    if (!name || !phone) return res.status(400).json({ message: 'Name and phone are required' });
    const lead = await FieldLead.create({
      name, phone, email, company, address, source, priority,
      assignedTo: req.user._id,
      stage: 'lead',
    });
    res.status(201).json({ lead });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateStage = async (req, res) => {
  try {
    const { stage } = req.body;
    if (!STAGE_FLOW.includes(stage)) return res.status(400).json({ message: 'Invalid stage' });
    const update = { stage };
    if (stage === 'converted') update.convertedDate = new Date();
    const lead = await FieldLead.findOneAndUpdate(
      { _id: req.params.id, ...ownerFilter(req.user) },
      update,
      { new: true }
    );
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ lead, stageLabel: STAGE_LABEL[stage] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addActivity = async (req, res) => {
  try {
    const { type, note, visitDate, demoDate } = req.body;
    if (!note || !type) return res.status(400).json({ message: 'Type and note required' });
    const lead = await FieldLead.findOne({ _id: req.params.id, ...ownerFilter(req.user) });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    lead.activities.push({ type, note, by: req.user._id });
    if (visitDate) lead.visitDate = visitDate;
    if (demoDate) lead.demoDate = demoDate;
    await lead.save();
    res.json({ lead });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFieldLead = async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'email', 'company', 'address', 'source', 'priority', 'callNotes', 'visitNotes', 'visitDate', 'demoDate'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const lead = await FieldLead.findOneAndUpdate(
      { _id: req.params.id, ...ownerFilter(req.user) },
      updates,
      { new: true }
    );
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ lead });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteFieldLead = async (req, res) => {
  try {
    const lead = await FieldLead.findOneAndDelete({ _id: req.params.id, ...ownerFilter(req.user) });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
