const Lead = require('../models/Lead');
const mongoose = require('mongoose');
const Client = require('../models/Client');
const Deal = require('../models/Deal');
const Visit = require('../models/Visit');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

// const Lead = require('../models/Lead');
const allowedPipelineStages = Lead.PIPELINE_STAGES; // one list, shared with the schema

// const allowedPipelineStages = ['lead', 'visit', 'registration', 'demo', 'data-update', 'feedback', 'converted', 'closed-lost',];

const ownerFilter = (user) => user.role === 'admin' || user.role === 'hr' ? {} : { assignedTo: user._id };

// Sales: Create lead
// Sales: Create lead
// Sales: Create lead
exports.createLead = async (req, res) => {
  const { name, phone, email, city, district, state, source, notes, followUpDate, dealValue, probability, expectedCloseDate, pipelineStage, serviceType, assignedTo, } = req.body;
  try {
    /* =========================================================
       1. REQUIRED FIELDS
    ========================================================= */
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Lead name is required', });
    }
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ message: 'Phone number is required', });
    }
    /* =========================================================
       2. NAME VALIDATION
    ========================================================= */
    const cleanName = String(name).trim();
    if (cleanName.length < 2) {
      return res.status(400).json({ message: 'Lead name must be at least 2 characters', });
    }
    if (cleanName.length > 100) {
      return res.status(400).json({ message: 'Lead name cannot exceed 100 characters', });
    }
    /* =========================================================
       3. PHONE VALIDATION
    ========================================================= */
    const cleanPhone = String(phone).trim();
    // Allows Indian numbers such as:
    // 9876543210
    // +919876543210
    // 09876543210
    const phoneRegex = /^(?:\+91[\s-]?)?[6-9]\d{9}$/;
    const normalizedPhone = cleanPhone.replace(/[\s-]/g, '');
    if (!phoneRegex.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Please enter a valid Indian phone number', });
    }
    /* =========================================================
       4. EMAIL VALIDATION
  ========================================================= */
    const cleanEmail = email ? String(email).trim() : '';
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ message: 'Please enter a valid email address', });
      }
    }
    /* =========================================================
       5. PIPELINE STAGE
    ========================================================= */
    if (pipelineStage !== undefined && !allowedPipelineStages.includes(pipelineStage)) {
      return res.status(400).json({ message: `Invalid pipeline stage: ${pipelineStage}`, });
    }
    /* =========================================================
       6. SOURCE
    ========================================================= */
    const allowedSources = ['website', 'referral', 'social', 'cold-call', 'other',];
    if (source !== undefined && source !== '' && !allowedSources.includes(source)) {
      return res.status(400).json({ message: `Invalid lead source: ${source}`, });
    }
    /* =========================================================
       7. SERVICE TYPE
    ========================================================= */
    const allowedServiceTypes = ['automated-systems', 'web-mobile-apps', 'digital-marketing', 'outsourcing', 'eshcul', '',];
    if (serviceType !== undefined && !allowedServiceTypes.includes(serviceType)) {
      return res.status(400).json({ message: `Invalid service type: ${serviceType}`, });
    }
    /* =========================================================
       8. PROBABILITY
    ========================================================= */
    if (probability !== undefined && probability !== null && probability !== '') {
      const numericProbability = Number(probability);
      if (!Number.isFinite(numericProbability)) {
        return res.status(400).json({ message: 'Probability must be a number', });
      }
      if (numericProbability < 0 || numericProbability > 100) {
        return res.status(400).json({ message: 'Probability must be between 0 and 100', });
      }
    }
    /* =========================================================
       9. DEAL VALUE
    ======================================================== */
    if (dealValue !== undefined && dealValue !== null && dealValue !== '') {
      const numericDealValue = Number(dealValue);
      if (!Number.isFinite(numericDealValue)) {
        return res.status(400).json({ message: 'Deal value must be a number', });
      }
      if (numericDealValue < 0) {
        return res.status(400).json({ message: 'Deal value cannot be negative', });
      }
    }
    /* =========================================================
       10. FOLLOW-UP DATE
    ========================================================= */
    if (followUpDate) {
      const parsedFollowUpDate = new Date(followUpDate);
      if (Number.isNaN(parsedFollowUpDate.getTime())) {
        return res.status(400).json({ message: 'Invalid follow-up date', });
      }
    }
    /* =========================================================
       11. EXPECTED CLOSE DATE
    ========================================================= */
    if (expectedCloseDate) {
      const parsedExpectedCloseDate = new Date(expectedCloseDate);
      if (Number.isNaN(parsedExpectedCloseDate.getTime())) {
        return res.status(400).json({ message: 'Invalid expected close date', });
      }
    }
    /* =========================================================
       12. ASSIGNED USER
    ========================================================= */
    const finalAssignedTo = assignedTo || req.user._id;
    if (!mongoose.Types.ObjectId.isValid(finalAssignedTo)) {
      return res.status(400).json({ message: 'Invalid assigned user', });
    }
    /* =========================================================
       13. CREATE LEAD
    ========================================================= */
    const lead = await Lead.create({
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      // Location
      city: city ? String(city).trim() : '',
      district: district ? String(district).trim() : '',
      state: state ? String(state).trim() : '',
      source: source || 'other',
      notes: notes ? String(notes).trim() : '',
      assignedTo: finalAssignedTo,
      followUpDate: followUpDate || null,
      dealValue: dealValue !== undefined && dealValue !== null && dealValue !== '' ? Number(dealValue) : 0,
      probability: probability !== undefined && probability !== null && probability !== '' ? Number(probability) : 0,
      expectedCloseDate: expectedCloseDate || null,
      pipelineStage: pipelineStage || 'lead',
      serviceType: serviceType || '',
    });
    /* =========================================================
       14. RETURN POPULATED LEAD
    ========================================================= */
    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name').populate('activities.by', 'name');
    return res.status(201).json(populated);
  } catch (err) {
    /* =========================================================
       MONGOOSE VALIDATION ERROR
    ========================================================= */
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map((error) => ({ field: error.path, message: error.message, }));
      return res.status(400).json({ message: 'Validation failed', errors, });
    }
    /* =========================================================
       INVALID OBJECT ID
    ========================================================= */
    if (err.name === 'CastError') {
      return res.status(400).json({ message: `Invalid value for ${err.path}`, });
    }
    /* =========================================================
       SERVER ERROR
    ========================================================= */
    console.error('createLead error:', err);
    return res.status(500).json({ message: 'Failed to create lead', });
  }
};
// Sales: Get own leads (HR/Admin gets all)
// ============================================================
// GET LEADS
// ============================================================

exports.getLeads = async (req, res) => {
  try {
    const {
      // Search
      search,
      // Existing Lead filters
      status,
      source,
      filter,
      // Relationship
      assignedTo,
      // Location
      state,
      district,
      city,
      // Sales pipeline
      pipelineStage,
      // Date filtering
      dateField = "createdAt",
      dateFrom,
      dateTo,
      // Calendar filtering
      day,
      month,
      year,
      datePreset,
      // Sorting
      sortBy = "createdAt",
      sortOrder = "desc",
      // Pagination
      page = 1,
      limit = 20,
    } = req.query;
    /* ========================================================
       1. BASE PERMISSION FILTER
     ======================================================== */
    const base = ownerFilter(req.user);
    /* ========================================================
       2. BUILD QUERY FILTER
       ======================================================== */
    const query = { ...base, };
    /* ========================================================
       3. SEARCH
       --------------------------------------------------------
       Searches:
       - name
       - phone
       - email
    ======================================================== */
    if (search && search.trim()) {
      const searchText = search.trim();
      // Escape regex special characters
      const escapedSearch = searchText.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      const searchRegex = new RegExp(escapedSearch, "i");
      query.$or = [{ name: searchRegex, }, { phone: searchRegex, }, { email: searchRegex, },];
    }
    /* ========================================================
       4. EXISTING STATUS FILTER
    ======================================================== */
    if (status) { query.status = status; }
    /* ========================================================
       5. SOURCE FILTER
  ======================================================== */
    if (source) { query.source = source; }
    /* ========================================================
       6. ASSIGNED TO
    ======================================================== */
    if (assignedTo) { query.assignedTo = assignedTo; }
    /* ========================================================
       7. LOCATION FILTERS
       --------------------------------------------------------
       Case-insensitive exact matching.
    ======================================================== */
    if (state && state.trim()) {
      query.state = new RegExp(`^${state.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    }
    if (district && district.trim()) {
      query.district = new RegExp(`^${district.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    }
    if (city && city.trim()) {
      query.city = new RegExp(`^${city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    }
    /* ========================================================
       8. PIPELINE STAGE
    ======================================================== */
    if (pipelineStage && allowedPipelineStages.includes(pipelineStage)) {
      query.pipelineStage = pipelineStage;
    }
    /* ========================================================
   9. DATE FIELD VALIDATION
   --------------------------------------------------------
   Only allow actual Lead date fields.
======================================================== */
    const allowedDateFields = ["createdAt", "updatedAt", "followUpDate", "convertedDate",];
    const selectedDateField = allowedDateFields.includes(dateField) ? dateField : "createdAt";
    /* ========================================================
       10. DATE RANGE
    ======================================================== */
    const applyDateRange = (start, end) => {
      query[selectedDateField] = { $gte: start, $lt: end, };
    };
    /* ========================================================
       11. CUSTOM DATE RANGE
       --------------------------------------------------------
       dateFrom + dateTo
    ======================================================== */
    if (dateFrom || dateTo) {
      const dateQuery = {};
      if (dateFrom) {
        const start = new Date(`${dateFrom}T00:00:00`);
        if (!Number.isNaN(start.getTime())) { dateQuery.$gte = start; }
      }
      if (dateTo) {
        const end = new Date(`${dateTo}T23:59:59.999`);
        if (!Number.isNaN(end.getTime())) { dateQuery.$lte = end; }
      }
      if (Object.keys(dateQuery).length > 0) { query[selectedDateField] = dateQuery; }
    }
    /* ========================================================
       12. DAY FILTER
       --------------------------------------------------------
       day + month + year
    ======================================================== */
    if (day && month && year) {
      const numericDay = Number(day);
      const numericMonth = Number(month);
      const numericYear = Number(year);
      if (Number.isInteger(numericDay) && Number.isInteger(numericMonth) && Number.isInteger(numericYear)) {
        const start = new Date(numericYear, numericMonth - 1, numericDay, 0, 0, 0, 0);
        const end = new Date(numericYear, numericMonth - 1, numericDay + 1, 0, 0, 0, 0);
        applyDateRange(start, end);
      }
    }
    /* ========================================================
       13. MONTH + YEAR FILTER
       --------------------------------------------------------
       month = 1-12
    ======================================================== */
    else if (month && year) {
      const numericMonth = Number(month); const numericYear = Number(year);
      if (numericMonth >= 1 && numericMonth <= 12 && Number.isInteger(numericYear)) {
        const start = new Date(numericYear, numericMonth - 1, 1);
        const end = new Date(numericYear, numericMonth, 1);
        applyDateRange(start, end);
      }
    }
    /* ========================================================
       14. YEAR FILTER
    ======================================================== */
    else if (year) {
      const numericYear = Number(year);
      if (Number.isInteger(numericYear)) {
        const start = new Date(numericYear, 0, 1);
        const end = new Date(numericYear + 1, 0, 1);
        applyDateRange(start, end);
      }
    }
    /* ========================================================
       15. DATE PRESETS
       --------------------------------------------------------
       today
       yesterday
       this-week
       last-week
       this-month
       last-month
       this-year
    ======================================================== */
    if (datePreset && !dateFrom && !dateTo && !day && !month && !year) {
      const now = new Date();
      let start = null;
      let end = null;
      switch (datePreset) {
        /* ----------------------------------------------------
           TODAY
        ---------------------------------------------------- */
        case "today": {
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
          break;
        }
        /* ----------------------------------------------------
           YESTERDAY
        ---------------------------------------------------- */
        case "yesterday": {
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
        }
        /* ----------------------------------------------------
           THIS WEEK
        ---------------------------------------------------- */
        case "this-week": {
          const dayOfWeek = now.getDay();
          // Monday = first day
          const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
          end = new Date(start);
          end.setDate(start.getDate() + 7);
          break;
        }
        /* ----------------------------------------------------
           LAST WEEK
        ---------------------------------------------------- */
        case "last-week": {
          const dayOfWeek = now.getDay();
          const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday - 7, 0, 0, 0, 0);
          end = new Date(start);
          end.setDate(start.getDate() + 7);
          break;
        }
        /* ----------------------------------------------------
           THIS MONTH
        ---------------------------------------------------- */
        case "this-month": {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        }
        /* ----------------------------------------------------
           LAST MONTH
        ---------------------------------------------------- */
        case "last-month": {
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        }
        /* ----------------------------------------------------
           THIS YEAR
        ---------------------------------------------------- */
        case "this-year": {
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear() + 1, 0, 1);
          break;
        }
        default:
          break;
      }
      if (start && end) {
        applyDateRange(start, end);
      }
    }
    /* ========================================================
       16. EXISTING OVERDUE FILTER
    ======================================================== */

    if (filter === "overdue") {
      query.followUpDate = { $lt: new Date(), };
      query.status = { $nin: ["converted", "not-interested",], };
    }
    /* ========================================================
       17. EXISTING AGING FILTER
    ======================================================== */
    if (filter === "aging") {
      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.status = { $nin: ["converted", "not-interested",], };
      query.$or = [
        { "activities.0": { $exists: false, }, },
        { activities: { $not: { $elemMatch: { date: { $gte: threshold, }, }, }, }, },
      ];
    }
    /* ========================================================
       18. PAGINATION
    ======================================================== */
    let pageNumber = Number(page);
    let limitNumber = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      pageNumber = 1;
    }
    if (!Number.isInteger(limitNumber) || limitNumber < 1) {
      limitNumber = 20;
    }
    // Prevent accidentally requesting huge datasets
    if (limitNumber > 100) {
      limitNumber = 100;
    }
    const skip = (pageNumber - 1) * limitNumber;
    /* ========================================================
       19. SORTING
       --------------------------------------------------------
       Whitelist fields so arbitrary MongoDB fields cannot
       be supplied through the URL.
    ======================================================== */
    const allowedSortFields = ["name", "createdAt", "updatedAt", "followUpDate", "convertedDate", "dealValue", "probability", "commission", "pipelineStage", "status",];

    const selectedSortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const selectedSortOrder = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    const sort = { [selectedSortField]: selectedSortOrder, };
    /* ========================================================
       20. TOTAL COUNT
    ======================================================== */
    const total = await Lead.countDocuments(query);
    /* ========================================================
       21. FETCH LEADS
    ======================================================== */
    const leads = await Lead.find(query).populate("assignedTo", "name email role").populate("activities.by", "name email").sort(sort).skip(skip).limit(limitNumber).lean();
    /* ========================================================
       22. VISIT COUNT
       --------------------------------------------------------
       One aggregation for all returned Leads.
       We do NOT store visitCount inside Lead.
    ======================================================== */
    const leadIds = leads.map((lead) => lead._id);
    let visitCounts = [];
    if (leadIds.length > 0) {
      visitCounts = await Visit.aggregate([
        { $match: { lead: { $in: leadIds, }, }, },
        { $group: { _id: "$lead", count: { $sum: 1, }, }, },
      ]);
    }
    const visitCountMap = new Map(visitCounts.map((item) => [item._id.toString(), item.count,]));
    /* ========================================================
       23. ADD COMPUTED DATA
    ======================================================== */
    const now = Date.now();
    const leadsWithMeta = leads.map(
      (lead) => {
        const ageDays = lead.createdAt ? Math.floor((now - new Date(lead.createdAt).getTime()) / 86400000) : 0;
        const isOverdue = lead.followUpDate && new Date(lead.followUpDate) < new Date() && !["converted", "not-interested",].includes(lead.status);
        const lastActivity = lead.activities && lead.activities.length > 0 ? lead.activities[lead.activities.length - 1].date : null;
        const isAging = !lastActivity ? ageDays > 7 : Math.floor((now - new Date(lastActivity).getTime()) / 86400000) > 7;
        const forecast = (lead.dealValue || 0) * (lead.probability || 0) / 100;
        return {
          ...lead, ageDays, isOverdue, isAging, forecast, visitCount: visitCountMap.get(lead._id.toString()) || 0, pipelineStage: lead.pipelineStage || "lead",
        };
      }
    );
    /* ========================================================
       24. STATS
    ======================================================== */
    const statsBase = ownerFilter(req.user);
    const stats = {
      total: await Lead.countDocuments(statsBase),
      new: await Lead.countDocuments({ ...statsBase, status: "new", }),
      interested: await Lead.countDocuments({ ...statsBase, status: "interested", }),
      converted: await Lead.countDocuments({ ...statsBase, status: "converted", }),
      notInterested: await Lead.countDocuments({ ...statsBase, status: "not-interested", }),
    };
    /* ========================================================
       25. CONVERSION RATE
    ======================================================== */
    stats.conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

    /* ========================================================
       26. REVENUE
    ======================================================== */

    const revenueAgg =
      await Lead.aggregate([
        { $match: { ...statsBase, status: "converted", }, },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$dealValue", },
            totalCommission: { $sum: "$commission", },
          },
        },
      ]);
    stats.totalRevenue = revenueAgg[0]?.totalRevenue || 0;
    stats.totalCommission = revenueAgg[0]?.totalCommission || 0;
    /* ========================================================
       27. PIPELINE REVENUE
    ======================================================== */
    const pipelineAgg = await Lead.aggregate([
      {
        $match: { ...statsBase, status: { $nin: ["converted", "not-interested",], }, },
      },
      {
        $group: {
          _id: null,
          pipelineRevenue: { $sum: "$dealValue", },
          weightedForecast: {
            $sum: {
              $multiply: ["$dealValue", { $divide: ["$probability", 100,], },],
            },
          },
        },
      },
    ]);

    stats.pipelineRevenue = pipelineAgg[0]?.pipelineRevenue || 0;
    stats.weightedForecast = Math.round(pipelineAgg[0]?.weightedForecast || 0);
    /* ========================================================
       28. NEXT FOLLOW-UP
    ======================================================== */
    const nextFollowUp = await Lead.findOne({
      ...statsBase,
      followUpDate: { $gte: new Date(), },
      status: { $nin: ["converted", "not-interested",], },
    }).sort({ followUpDate: 1, }).select("followUpDate name").lean();
    stats.nextFollowUp = nextFollowUp ? { date: nextFollowUp.followUpDate, leadName: nextFollowUp.name, } : null;
    /* ========================================================
       29. PAGINATION INFORMATION
    ======================================================== */
    const totalPages = Math.ceil(total / limitNumber);
    /* ========================================================
       30. RESPONSE
    ======================================================== */
    return res.json({
      leads: leadsWithMeta,
      stats,
      pagination: { page: pageNumber, limit: limitNumber, total, totalPages, hasNextPage: pageNumber < totalPages, hasPreviousPage: pageNumber > 1, },
    });
  } catch (err) {
    console.error("getLeads error:", err);
    return res.status(500).json({ message: err.message || "Failed to fetch leads", });
  }
};
// Sales: Get single lead
// ============================================================
// GET SINGLE LEAD
// Includes complete Lead information + all Visits
// ============================================================

exports.getLead = async (req, res) => {
  try {
    const { id } = req.params;
    /* ========================================================
       1. GET LEAD
    ======================================================== */
    const lead = await Lead.findOne({ _id: id, ...ownerFilter(req.user), }).populate("assignedTo", "name email role").populate("activities.by", "name email role").lean();
    if (!lead) {
      return res.status(404).json({ message: "Lead not found", });
    }
    /* ========================================================
       2. GET ALL VISITS FOR THIS LEAD
       ======================================================== */
    const visits = await Visit.find({ lead: lead._id, }).populate("assignedTo", "name email role").populate("createdBy", "name email role").sort({ visitDate: -1, createdAt: -1, }).lean();
    /* ========================================================
       3. VISIT COUNT
      ======================================================== */
    const visitCount = visits.length;
    /* ========================================================
       4. RETURN LEAD + VISITS
       ======================================================== */
    return res.json({
      ...lead,
      // Lead pipeline information
      pipelineStage: lead.pipelineStage || "lead",
      // Location
      city: lead.city || "",
      district: lead.district || "",
      state: lead.state || "",
      // Visit information
      visitCount,
      visits,
    });
  } catch (err) {
    console.error("getLead error:", err);
    return res.status(500).json({ message: err.message || "Failed to fetch lead", });
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
      lead.pipelineStage = 'converted';

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
// Sales: Update lead
exports.updateLead = async (req, res) => {
  const { name, phone, email, city, district, state, source, notes, followUpDate, dealValue, probability, expectedCloseDate, pipelineStage, serviceType, assignedTo, } = req.body;
  try {
    // =========================================================
    // FIND LEAD
    // =========================================================
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found', });
    }
    // =========================================================
    // SALES ACCESS CHECK
    // =========================================================
    if (req.user.role === 'sales' && lead.assignedTo && lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied', });
    }
    // =========================================================
    // BASIC VALIDATION
    // =========================================================
    // Name
    if (name !== undefined) {
      if (!String(name).trim()) { return res.status(400).json({ message: 'Name is required', }); }
      lead.name = String(name).trim();
    }
    // Phone
    // =========================================================
    // PHONE VALIDATION
    // =========================================================

    if (phone !== undefined) {
      const cleanPhone = String(phone).trim();

      if (!cleanPhone) {
        return res.status(400).json({
          message: 'Phone number is required',
        });
      }

      // Indian mobile number: exactly 10 digits, starting with 6-9
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({
          message: 'Please enter a valid 10-digit Indian mobile number',
        });
      }

      lead.phone = cleanPhone;
    }
    // Email
    if (email !== undefined) {
      const cleanEmail = String(email).trim();
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ message: 'Please enter a valid email address', });
      }
      lead.email = cleanEmail;
    }
    // =========================================================
    // LOCATION VALIDATION
    // =========================================================
    if (state !== undefined) {
      if (!String(state).trim()) {
        return res.status(400).json({ message: 'State is required', });
      }
      lead.state = String(state).trim();
    }
    if (district !== undefined) {
      if (!String(district).trim()) {
        return res.status(400).json({ message: 'District is required', });
      }
      lead.district = String(district).trim();
    }
    if (city !== undefined) {
      if (!String(city).trim()) {
        return res.status(400).json({ message: 'City is required', });
      }
      lead.city = String(city).trim();
    }
    // =========================================================
    // SOURCE
    // =========================================================
    if (source !== undefined) {
      const allowedSources = ['website', 'referral', 'social', 'cold-call', 'other',];
      if (!allowedSources.includes(source)) {
        return res.status(400).json({ message: `Invalid source: ${source}`, });
      }
      lead.source = source;
    }
    // =========================================================
    // NOTES
    // =========================================================
    if (notes !== undefined) { lead.notes = String(notes); }
    // =========================================================
    // FOLLOW-UP DATE
    // =========================================================
    if (followUpDate !== undefined) {
      if (followUpDate === '') {
        lead.followUpDate = null;
      } else {
        const date = new Date(followUpDate);
        if (Number.isNaN(date.getTime())) {
          return res.status(400).json({ message: 'Invalid follow-up date', });
        }
        lead.followUpDate = date;
      }
    }
    // =========================================================
    // DEAL VALUE
    // =========================================================
    if (dealValue !== undefined) {
      if (dealValue === '') {
        lead.dealValue = 0;
      } else {
        const value = Number(dealValue);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ message: 'Deal value must be a valid positive number', });
        }
        lead.dealValue = value;
      }
    }
    // =========================================================
    // PROBABILITY
    // =========================================================
    if (probability !== undefined) {
      if (probability === '') {
        lead.probability = 0;
      } else {
        const value = Number(probability);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          return res.status(400).json({ message: 'Probability must be between 0 and 100', });
        }
        lead.probability = value;
      }
    }
    // =========================================================
    // EXPECTED CLOSE DATE
    // =========================================================
    if (expectedCloseDate !== undefined) {
      if (expectedCloseDate === '') {
        lead.expectedCloseDate = null;
      } else {
        const date = new Date(expectedCloseDate);
        if (Number.isNaN(date.getTime())) {
          return res.status(400).json({ message: 'Invalid expected close date' });
        }
        lead.expectedCloseDate = date;
      }
    }
    // =========================================================
    // PIPELINE STAGE
    // =========================================================
    if (pipelineStage !== undefined) {
      if (!allowedPipelineStages.includes(pipelineStage)) {
        return res.status(400).json({
          message: `Invalid pipeline stage: ${pipelineStage}`,
        });
      }

      lead.pipelineStage = pipelineStage;
    }

    // =========================================================
    // SERVICE TYPE
    // =========================================================

    if (serviceType !== undefined) {
      const allowedServiceTypes = [
        'automated-systems',
        'web-mobile-apps',
        'digital-marketing',
        'outsourcing',
        'eshcul',
        '',
      ];

      if (!allowedServiceTypes.includes(serviceType)) {
        return res.status(400).json({
          message: `Invalid service type: ${serviceType}`,
        });
      }

      lead.serviceType = serviceType;
    }

    // =========================================================
    // ASSIGNED TO
    // =========================================================

    if (
      assignedTo !== undefined &&
      assignedTo !== null &&
      assignedTo !== ''
    ) {
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({
          message: 'Invalid assigned employee',
        });
      }

      lead.assignedTo = assignedTo;
    }

    // =========================================================
    // SAVE
    // =========================================================

    await lead.save();

    // =========================================================
    // POPULATE RESPONSE
    // =========================================================

    const populated = await Lead.findById(lead._id)
      .populate('assignedTo', 'name')
      .populate('activities.by', 'name');

    return res.json(populated);

  } catch (err) {
    console.error('UPDATE LEAD ERROR:', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Lead validation failed',
        errors: Object.fromEntries(
          Object.entries(err.errors).map(([key, value]) => [
            key,
            value.message,
          ])
        ),
      });
    }

    // Invalid ObjectId
    if (err.name === 'CastError') {
      return res.status(400).json({
        message: `Invalid value for ${err.path}: ${err.value}`,
      });
    }

    return res.status(500).json({
      message: err.message || 'Failed to update lead',
    });
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

    const leads = await Lead.find({
      ...base,
      status: { $nin: ['not-interested'] },
    })
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });

    const now = Date.now();

    const pipeline = {};

    // Use the single source of truth
    allowedPipelineStages.forEach((stage) => {
      pipeline[stage] = [];
    });

    leads.forEach((lead) => {
      const stage = lead.pipelineStage || 'lead';

      if (pipeline[stage]) {
        pipeline[stage].push({
          _id: lead._id,
          name: lead.name,
          phone: lead.phone,
          dealValue: lead.dealValue,
          probability: lead.probability,
          serviceType: lead.serviceType,

          ageDays: Math.floor(
            (now - new Date(lead.createdAt).getTime()) / 86400000
          ),

          followUpDate: lead.followUpDate,

          isOverdue:
            lead.followUpDate &&
            lead.followUpDate < new Date(),

          assignedTo: lead.assignedTo,
          status: lead.status,
          pipelineStage: lead.pipelineStage || 'lead',
        });
      }
    });

    res.json(pipeline);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

// Update pipeline stage (Kanban move)
exports.updatePipelineStage = async (req, res) => {
  const { pipelineStage } = req.body;

  try {
    if (!allowedPipelineStages.includes(pipelineStage)) {
      return res.status(400).json({
        message: `Invalid pipeline stage: ${pipelineStage}`,
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: 'Lead not found',
      });
    }

    if (
      req.user.role === 'sales' &&
      lead.assignedTo.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: 'Access denied',
      });
    }

    lead.pipelineStage = pipelineStage;

    await lead.save();

    res.json({
      _id: lead._id,
      pipelineStage: lead.pipelineStage,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
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
