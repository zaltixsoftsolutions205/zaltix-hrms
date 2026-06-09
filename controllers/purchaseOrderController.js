const PurchaseOrder = require('../models/PurchaseOrder');

// GET all purchase orders
exports.getPurchaseOrders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const pos = await PurchaseOrder.find(filter)
      .populate('quotation', 'quotationNumber')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json(pos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET single purchase order
exports.getPurchaseOrder = async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id)
      .populate('quotation', 'quotationNumber')
      .populate('createdBy', 'name');
    if (!po) return res.status(404).json({ message: 'Purchase order not found' });
    res.json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST create purchase order
exports.createPurchaseOrder = async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, clientCompany, items, taxPercent, deliveryDate, paymentTerms, notes } = req.body;

    if (!clientName || !items || items.length === 0) {
      return res.status(400).json({ message: 'Client name and at least one item required' });
    }

    const computedItems = items.map(i => ({ ...i, amount: i.quantity * i.rate }));
    const subtotal = computedItems.reduce((s, i) => s + i.amount, 0);
    const tax = taxPercent || 18;
    const taxAmt = subtotal * (tax / 100);
    const total = subtotal + taxAmt;

    const po = await PurchaseOrder.create({
      clientName, clientEmail, clientPhone, clientCompany,
      items: computedItems,
      subtotal,
      taxPercent: tax,
      taxAmount: taxAmt,
      total,
      deliveryDate: deliveryDate || null,
      paymentTerms: paymentTerms || '',
      notes: notes || '',
      createdBy: req.user._id,
    });

    res.status(201).json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT update status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const po = await PurchaseOrder.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('quotation', 'quotationNumber')
      .populate('createdBy', 'name');
    if (!po) return res.status(404).json({ message: 'Not found' });
    res.json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE purchase order
exports.deletePurchaseOrder = async (req, res) => {
  try {
    await PurchaseOrder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
