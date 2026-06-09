const Deal = require('../models/Deal');
const Lead = require('../models/Lead');
const Client = require('../models/Client');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

const ownerFilter = (user) => user.role === 'admin' || user.role === 'hr' ? {} : { assignedTo: user._id };

// Create a deal linked to a lead
exports.createDeal = async (req, res) => {
  const { leadId, serviceType, quotedAmount, finalDealAmount, annualRevenue, probability, expectedCloseDate, notes } = req.body;
  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (lead.status === 'converted') return res.status(400).json({ message: 'Lead is already converted' });

    const existingDeal = await Deal.findOne({ lead: leadId });
    if (existingDeal) return res.status(400).json({ message: 'A deal already exists for this lead' });

    const assignedUser = await User.findById(lead.assignedTo).select('department');

    const deal = await Deal.create({
      lead: lead._id,
      assignedTo: lead.assignedTo,
      department: assignedUser?.department || null,
      name: lead.name,
      serviceType,
      quotedAmount: quotedAmount || 0,
      finalDealAmount: finalDealAmount || 0,
      annualRevenue: annualRevenue || 0,
      probability: probability || 0,
      expectedCloseDate: expectedCloseDate || null,
      notes: notes || '',
    });

    // Sync service type back to lead
    if (serviceType) {
      lead.serviceType = serviceType;
      if (finalDealAmount) lead.dealValue = finalDealAmount;
      if (probability) lead.probability = probability;
      if (expectedCloseDate) lead.expectedCloseDate = expectedCloseDate;
      await lead.save();
    }

    const populated = await Deal.findById(deal._id)
      .populate('lead', 'name phone email status pipelineStage')
      .populate('assignedTo', 'name employeeId')
      .populate('department', 'name');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// List deals with filters
exports.getDeals = async (req, res) => {
  const { status, serviceType, assignedTo, dateFrom, dateTo } = req.query;
  try {
    let filter = ownerFilter(req.user);
    if (status) filter.status = status;
    if (serviceType) filter.serviceType = serviceType;
    if (assignedTo && (req.user.role === 'admin' || req.user.role === 'hr')) filter.assignedTo = assignedTo;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const deals = await Deal.find(filter)
      .populate('lead', 'name phone email status pipelineStage')
      .populate('assignedTo', 'name employeeId')
      .populate('department', 'name')
      .sort({ createdAt: -1 });

    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single deal
exports.getDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
      .populate('lead')
      .populate('assignedTo', 'name employeeId commissionRate')
      .populate('department', 'name');
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    if (req.user.role === 'sales' && deal.assignedTo._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(deal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update deal
exports.updateDeal = async (req, res) => {
  const { serviceType, quotedAmount, finalDealAmount, annualRevenue, probability, expectedCloseDate, notes } = req.body;
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    if (req.user.role === 'sales' && deal.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (deal.status !== 'open') return res.status(400).json({ message: 'Cannot update a closed deal' });

    if (serviceType) deal.serviceType = serviceType;
    if (quotedAmount !== undefined) deal.quotedAmount = quotedAmount;
    if (finalDealAmount !== undefined) deal.finalDealAmount = finalDealAmount;
    if (annualRevenue !== undefined) deal.annualRevenue = annualRevenue;
    if (probability !== undefined) deal.probability = probability;
    if (expectedCloseDate !== undefined) deal.expectedCloseDate = expectedCloseDate || null;
    if (notes !== undefined) deal.notes = notes;

    await deal.save();

    // Sync back to lead
    const lead = await Lead.findById(deal.lead);
    if (lead) {
      if (finalDealAmount !== undefined) lead.dealValue = finalDealAmount;
      if (probability !== undefined) lead.probability = probability;
      if (expectedCloseDate !== undefined) lead.expectedCloseDate = expectedCloseDate || null;
      if (serviceType) lead.serviceType = serviceType;
      await lead.save();
    }

    const populated = await Deal.findById(deal._id)
      .populate('lead', 'name phone email status pipelineStage')
      .populate('assignedTo', 'name employeeId')
      .populate('department', 'name');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Close deal as won or lost
exports.closeDeal = async (req, res) => {
  const { status } = req.body; // 'won' or 'lost'
  try {
    if (!['won', 'lost'].includes(status)) return res.status(400).json({ message: 'Status must be won or lost' });

    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    if (req.user.role === 'sales' && deal.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (deal.status !== 'open') return res.status(400).json({ message: 'Deal is already closed' });

    deal.status = status;
    deal.closedDate = new Date();

    if (status === 'won') {
      // Calculate commission
      const assignedUser = await User.findById(deal.assignedTo).select('commissionRate');
      const rate = assignedUser?.commissionRate || 0;
      deal.commission = Math.round((deal.finalDealAmount || 0) * rate / 100);

      // Update linked lead
      const lead = await Lead.findById(deal.lead);
      if (lead) {
        lead.status = 'converted';
        lead.convertedDate = new Date();
        lead.pipelineStage = 'closed-won';
        lead.dealValue = deal.finalDealAmount;
        lead.commission = deal.commission;
        await lead.save();
      }

      // Upsert client
      await Client.findOneAndUpdate(
        { lead: deal.lead },
        {
          lead: deal.lead,
          assignedTo: deal.assignedTo,
          name: deal.name,
          phone: lead?.phone || '',
          email: lead?.email || '',
          dealValue: deal.finalDealAmount,
          convertedDate: new Date(),
        },
        { upsert: true, new: true }
      );

      // Notify sales person
      await notificationService.notify(deal.assignedTo, {
        title: 'Deal Won!',
        message: `${deal.name} closed for ₹${(deal.finalDealAmount || 0).toLocaleString('en-IN')}. Commission: ₹${deal.commission.toLocaleString('en-IN')}.`,
        type: 'crm',
        link: '/crm/deals',
      });

      // Sync to Finance: Create income record
      const Income = require('../models/Income');
      await Income.create({
        type: 'deal',
        amount: deal.finalDealAmount,
        date: new Date(),
        description: `Revenue from deal: ${deal.name}`,
        dealId: deal._id,
        serviceType: deal.serviceType,
        syncedAt: new Date(),
        createdBy: deal.assignedTo,
      });
    }

    if (status === 'lost') {
      const lead = await Lead.findById(deal.lead);
      if (lead && !['converted'].includes(lead.status)) {
        lead.pipelineStage = 'closed-lost';
        lead.status = 'not-interested';
        await lead.save();
      }
    }

    await deal.save();

    const populated = await Deal.findById(deal._id)
      .populate('lead', 'name phone email status pipelineStage')
      .populate('assignedTo', 'name employeeId')
      .populate('department', 'name');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deal stats and aggregations
exports.getDealStats = async (req, res) => {
  try {
    const base = ownerFilter(req.user);

    const [counts, revenueAgg, byService, bySalesperson, byDepartment, forecastAgg] = await Promise.all([
      // Counts
      Promise.all([
        Deal.countDocuments({ ...base }),
        Deal.countDocuments({ ...base, status: 'open' }),
        Deal.countDocuments({ ...base, status: 'won' }),
        Deal.countDocuments({ ...base, status: 'lost' }),
      ]),
      // Total revenue
      Deal.aggregate([
        { $match: { ...base, status: 'won' } },
        { $group: { _id: null, totalRevenue: { $sum: '$finalDealAmount' }, totalCommission: { $sum: '$commission' }, totalAnnualRevenue: { $sum: '$annualRevenue' } } },
      ]),
      // Revenue by service type
      Deal.aggregate([
        { $match: { ...base, status: 'won' } },
        { $group: { _id: '$serviceType', revenue: { $sum: '$finalDealAmount' }, count: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
      ]),
      // Revenue by salesperson
      Deal.aggregate([
        { $match: { ...base, status: 'won' } },
        { $group: { _id: '$assignedTo', revenue: { $sum: '$finalDealAmount' }, commission: { $sum: '$commission' }, count: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { _id: 1, revenue: 1, commission: 1, count: 1, name: '$user.name', employeeId: '$user.employeeId' } },
        { $sort: { revenue: -1 } },
      ]),
      // Revenue by department
      Deal.aggregate([
        { $match: { ...base, status: 'won', department: { $ne: null } } },
        { $group: { _id: '$department', revenue: { $sum: '$finalDealAmount' }, count: { $sum: 1 } } },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
        { $unwind: '$dept' },
        { $project: { _id: 1, revenue: 1, count: 1, name: '$dept.name' } },
        { $sort: { revenue: -1 } },
      ]),
      // Forecast (open deals)
      Deal.aggregate([
        { $match: { ...base, status: 'open' } },
        { $group: { _id: null, forecast: { $sum: { $multiply: ['$finalDealAmount', { $divide: ['$probability', 100] }] } }, pipelineValue: { $sum: '$finalDealAmount' } } },
      ]),
    ]);

    const rev = revenueAgg[0] || { totalRevenue: 0, totalCommission: 0, totalAnnualRevenue: 0 };
    const fc = forecastAgg[0] || { forecast: 0, pipelineValue: 0 };

    res.json({
      total: counts[0],
      open: counts[1],
      won: counts[2],
      lost: counts[3],
      totalRevenue: rev.totalRevenue,
      totalCommission: rev.totalCommission,
      totalAnnualRevenue: rev.totalAnnualRevenue,
      avgDealSize: counts[2] > 0 ? Math.round(rev.totalRevenue / counts[2]) : 0,
      forecast: Math.round(fc.forecast),
      pipelineValue: fc.pipelineValue,
      revenueByService: byService,
      revenueBySalesperson: bySalesperson,
      revenueByDepartment: byDepartment,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Commission preview for payslip generation
exports.getCommissionPreview = async (req, res) => {
  const { month, year } = req.query;
  try {
    const employeeId = req.params.employeeId;
    if (!month || !year) return res.status(400).json({ message: 'month and year are required' });

    const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const unpaidDeals = await Deal.find({
      assignedTo: employeeId,
      status: 'won',
      commissionPaid: false,
      closedDate: { $gte: monthStart, $lt: monthEnd },
    }).select('name commission finalDealAmount serviceType closedDate');

    const totalCommission = unpaidDeals.reduce((sum, d) => sum + (d.commission || 0), 0);

    res.json({
      totalCommission,
      dealCount: unpaidDeals.length,
      deals: unpaidDeals,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
