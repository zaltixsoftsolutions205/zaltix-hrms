const Lead = require('../models/Lead');
const Client = require('../models/Client');
const Deal = require('../models/Deal');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

const ownerFilter = (user) => user.role === 'admin' || user.role === 'hr' ? {} : { assignedTo: user._id };

// Sales: Create lead
exports.createLead = async (req, res) => {
  const { name, phone, email, source, notes, followUpDate, dealValue, probability, expectedCloseDate, pipelineStage, serviceType } = req.body;
  try {
    const lead = await Lead.create({
      name, phone, email, source, notes, assignedTo: req.user._id,
      followUpDate: followUpDate || null,
      dealValue: dealValue || 0,
      probability: probability || 0,
      expectedCloseDate: expectedCloseDate || null,
      pipelineStage: pipelineStage || 'prospect',
      serviceType: serviceType || '',
    });
    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name').populate('activities.by', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Sales: Get own leads (HR/Admin gets all)
exports.getLeads = async (req, res) => {
  const { status, source, filter, assignedTo, month, year } = req.query;
  try {
    let base = ownerFilter(req.user);
    if (assignedTo && (req.user.role === 'admin' || req.user.role === 'hr')) base.assignedTo = assignedTo;
    if (status) base.status = status;
    if (source) base.source = source;

    // Month/year filter for commission hint in payslips
    if (month && year) {
      const start = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      base.convertedDate = { $gte: start, $lt: end };
    }

    // Overdue / aging quick filters
    if (filter === 'overdue') {
      base.followUpDate = { $lt: new Date() };
      base.status = { $nin: ['converted', 'not-interested'] };
    }
    if (filter === 'aging') {
      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      base.status = { $nin: ['converted', 'not-interested'] };
      base.$or = [
        { 'activities.0': { $exists: false } },
        { activities: { $not: { $elemMatch: { date: { $gte: threshold } } } } },
      ];
    }

    const leads = await Lead.find(base).populate('assignedTo', 'name').sort({ createdAt: -1 });

    // Add computed fields
    const now = Date.now();
    const leadsWithMeta = leads.map(l => {
      const obj = l.toObject();
      obj.ageDays = Math.floor((now - new Date(l.createdAt).getTime()) / 86400000);
      obj.isOverdue = l.followUpDate && l.followUpDate < new Date() && !['converted', 'not-interested'].includes(l.status);
      const lastActivity = l.activities.length > 0 ? l.activities[l.activities.length - 1].date : null;
      obj.isAging = !lastActivity ? obj.ageDays > 7 : Math.floor((now - new Date(lastActivity).getTime()) / 86400000) > 7;
      obj.forecast = (l.dealValue || 0) * (l.probability || 0) / 100;
      return obj;
    });

    const countBase = ownerFilter(req.user);
    const stats = {
      total: await Lead.countDocuments(countBase),
      new: await Lead.countDocuments({ ...countBase, status: 'new' }),
      interested: await Lead.countDocuments({ ...countBase, status: 'interested' }),
      converted: await Lead.countDocuments({ ...countBase, status: 'converted' }),
      notInterested: await Lead.countDocuments({ ...countBase, status: 'not-interested' }),
    };
    stats.conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

    // Revenue stats for sales CRM dashboard
    const revenueAgg = await Lead.aggregate([
      { $match: { ...countBase, status: 'converted' } },
      { $group: { _id: null, totalRevenue: { $sum: '$dealValue' }, totalCommission: { $sum: '$commission' } } },
    ]);
    stats.totalRevenue = revenueAgg[0]?.totalRevenue || 0;
    stats.totalCommission = revenueAgg[0]?.totalCommission || 0;

    const pipelineAgg = await Lead.aggregate([
      { $match: { ...countBase, status: { $nin: ['converted', 'not-interested'] } } },
      { $group: { _id: null, pipelineRevenue: { $sum: '$dealValue' }, weightedForecast: { $sum: { $multiply: ['$dealValue', { $divide: ['$probability', 100] }] } } } },
    ]);
    stats.pipelineRevenue = pipelineAgg[0]?.pipelineRevenue || 0;
    stats.weightedForecast = Math.round(pipelineAgg[0]?.weightedForecast || 0);

    // Next follow-up
    const nextFollowUp = await Lead.findOne({
      ...countBase,
      followUpDate: { $gte: new Date() },
      status: { $nin: ['converted', 'not-interested'] },
    }).sort({ followUpDate: 1 }).select('followUpDate name');
    stats.nextFollowUp = nextFollowUp ? { date: nextFollowUp.followUpDate, leadName: nextFollowUp.name } : null;

    res.json({ leads: leadsWithMeta, stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Sales: Get single lead
exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name').populate('activities.by', 'name');
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedTo._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Sales: Update lead status
exports.updateLeadStatus = async (req, res) => {
  const { status, notes } = req.body;
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    lead.status = status;
    if (notes !== undefined) lead.notes = notes;

    if (status === 'converted') {
      lead.convertedDate = new Date();
      lead.pipelineStage = 'closed-won';

      // Calculate commission
      const assignedUser = await User.findById(lead.assignedTo).select('commissionRate');
      const rate = assignedUser?.commissionRate || 0;
      lead.commission = Math.round((lead.dealValue || 0) * rate / 100);

      // Upsert client
      await Client.findOneAndUpdate(
        { lead: lead._id },
        {
          lead: lead._id,
          assignedTo: lead.assignedTo,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          dealValue: lead.dealValue,
          convertedDate: new Date(),
        },
        { upsert: true, new: true }
      );

      // Also update linked Deal if one exists
      const existingDeal = await Deal.findOne({ lead: lead._id });
      if (existingDeal && existingDeal.status === 'open') {
        existingDeal.status = 'won';
        existingDeal.closedDate = new Date();
        existingDeal.commission = lead.commission;
        if (lead.dealValue) existingDeal.finalDealAmount = lead.dealValue;
        await existingDeal.save();
      }

      // Notify the sales person
      await notificationService.notify(lead.assignedTo, {
        title: 'Lead Converted!',
        message: `${lead.name} has been converted. Commission earned: ₹${lead.commission.toLocaleString('en-IN')}.`,
        type: 'crm',
        link: '/crm',
      });
    }

    if (status === 'not-interested') {
      lead.pipelineStage = 'closed-lost';
    }

    await lead.save();
    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name').populate('activities.by', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Sales: Add activity to lead
exports.addActivity = async (req, res) => {
  const { type, note } = req.body;
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    lead.activities.push({ type, note, by: req.user._id, date: new Date() });
    await lead.save();

    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name').populate('activities.by', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Sales: Update lead info (extended with deal fields)
exports.updateLead = async (req, res) => {
  const { name, phone, email, source, notes, followUpDate, dealValue, probability, expectedCloseDate, pipelineStage, serviceType } = req.body;
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (name) lead.name = name;
    if (phone) lead.phone = phone;
    if (email !== undefined) lead.email = email;
    if (source) lead.source = source;
    if (notes !== undefined) lead.notes = notes;
    if (followUpDate !== undefined) lead.followUpDate = followUpDate || null;
    if (dealValue !== undefined) lead.dealValue = dealValue;
    if (probability !== undefined) lead.probability = probability;
    if (expectedCloseDate !== undefined) lead.expectedCloseDate = expectedCloseDate || null;
    if (pipelineStage) lead.pipelineStage = pipelineStage;
    if (serviceType !== undefined) lead.serviceType = serviceType;
    await lead.save();
    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name').populate('activities.by', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Sales: Delete lead
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    await lead.deleteOne();
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get pipeline grouped by stage
exports.getPipeline = async (req, res) => {
  try {
    const base = ownerFilter(req.user);
    const leads = await Lead.find({ ...base, status: { $nin: ['not-interested'] } })
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });

    const now = Date.now();
    const stages = ['prospect', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];
    const pipeline = {};
    stages.forEach(s => { pipeline[s] = []; });

    leads.forEach(l => {
      const stage = l.pipelineStage || 'prospect';
      if (pipeline[stage]) {
        pipeline[stage].push({
          _id: l._id,
          name: l.name,
          phone: l.phone,
          dealValue: l.dealValue,
          probability: l.probability,
          serviceType: l.serviceType,
          ageDays: Math.floor((now - new Date(l.createdAt).getTime()) / 86400000),
          followUpDate: l.followUpDate,
          isOverdue: l.followUpDate && l.followUpDate < new Date(),
          assignedTo: l.assignedTo,
          status: l.status,
        });
      }
    });

    res.json(pipeline);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update pipeline stage (Kanban move)
exports.updatePipelineStage = async (req, res) => {
  const { pipelineStage } = req.body;
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    lead.pipelineStage = pipelineStage;
    await lead.save();
    res.json({ _id: lead._id, pipelineStage: lead.pipelineStage });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get activities across all leads
exports.getActivities = async (req, res) => {
  const { type, dateFrom, dateTo } = req.query;
  try {
    const base = ownerFilter(req.user);
    const leads = await Lead.find(base).populate('activities.by', 'name').select('name activities assignedTo').lean();

    let activities = [];
    leads.forEach(lead => {
      (lead.activities || []).forEach(act => {
        if (type && act.type !== type) return;
        if (dateFrom && new Date(act.date) < new Date(dateFrom)) return;
        if (dateTo && new Date(act.date) > new Date(dateTo)) return;
        activities.push({
          ...act,
          leadId: lead._id,
          leadName: lead.name,
        });
      });
    });

    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get overdue + aging alerts
exports.getOverdueAlerts = async (req, res) => {
  try {
    const base = ownerFilter(req.user);
    const terminal = { $nin: ['converted', 'not-interested'] };
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const overdueFollowUps = await Lead.find({
      ...base,
      followUpDate: { $lt: new Date() },
      status: terminal,
    }).select('name followUpDate assignedTo').populate('assignedTo', 'name').lean();

    const agingLeads = await Lead.find({
      ...base,
      status: terminal,
      $or: [
        { 'activities.0': { $exists: false } },
        { activities: { $not: { $elemMatch: { date: { $gte: threshold } } } } },
      ],
    }).select('name createdAt activities assignedTo').populate('assignedTo', 'name').lean();

    const now = Date.now();
    const agingWithDays = agingLeads.map(l => ({
      ...l,
      ageDays: Math.floor((now - new Date(l.createdAt).getTime()) / 86400000),
    }));

    res.json({ overdueFollowUps, agingLeads: agingWithDays });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
