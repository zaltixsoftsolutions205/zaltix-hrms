const Quotation = require('../models/Quotation');
const PurchaseOrder = require('../models/PurchaseOrder');
const generateQuotationPDF = require('../utils/generateQuotationPDF');

// GET all quotations
exports.getQuotations = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const quotations = await Quotation.find(filter)
      .populate('lead', 'name phone email')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json(quotations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET single quotation
exports.getQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id)
      .populate('lead', 'name phone email')
      .populate('createdBy', 'name');
    if (!q) return res.status(404).json({ message: 'Quotation not found' });
    res.json(q);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST create quotation
exports.createQuotation = async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, clientCompany, lead, items, discountPercent, taxPercent, validUntil, notes } = req.body;

    if (!clientName || !items || items.length === 0) {
      return res.status(400).json({ message: 'Client name and at least one item required' });
    }

    // Calculate totals
    const computedItems = items.map(i => ({ ...i, amount: i.quantity * i.rate }));
    const subtotal = computedItems.reduce((s, i) => s + i.amount, 0);
    const discAmt = subtotal * ((discountPercent || 0) / 100);
    const taxable = subtotal - discAmt;
    const taxAmt = taxable * ((taxPercent || 18) / 100);
    const total = taxable + taxAmt;

    const q = await Quotation.create({
      lead: lead || null,
      clientName, clientEmail, clientPhone, clientCompany,
      items: computedItems,
      subtotal,
      discountPercent: discountPercent || 0,
      discountAmount: discAmt,
      taxPercent: taxPercent || 18,
      taxAmount: taxAmt,
      total,
      validUntil: validUntil || null,
      notes: notes || '',
      createdBy: req.user._id,
    });

    res.status(201).json(q);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT update status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const q = await Quotation.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('lead', 'name phone email')
      .populate('createdBy', 'name');
    if (!q) return res.status(404).json({ message: 'Not found' });
    res.json(q);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST convert quotation to Purchase Order
exports.convertToPO = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q) return res.status(404).json({ message: 'Quotation not found' });

    const subtotal = q.subtotal - q.discountAmount;
    const taxAmt = subtotal * (q.taxPercent / 100);
    const total = subtotal + taxAmt;

    const po = await PurchaseOrder.create({
      quotation: q._id,
      clientName: q.clientName,
      clientEmail: q.clientEmail,
      clientPhone: q.clientPhone,
      clientCompany: q.clientCompany,
      items: q.items,
      subtotal,
      taxPercent: q.taxPercent,
      taxAmount: taxAmt,
      total,
      notes: q.notes,
      createdBy: req.user._id,
    });

    // Mark quotation as accepted
    await Quotation.findByIdAndUpdate(q._id, { status: 'accepted' });

    res.status(201).json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET PDF download
exports.downloadPDF = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id).populate('createdBy', 'name');
    if (!q) return res.status(404).json({ message: 'Quotation not found' });
    generateQuotationPDF(q, res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE quotation
exports.deleteQuotation = async (req, res) => {
  try {
    await Quotation.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
