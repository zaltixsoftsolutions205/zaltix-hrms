const Query = require('../models/Query');

const VALID_STATUS = ['open', 'in_progress', 'resolved'];

// List all queries (most recent first)
exports.getQueries = async (req, res) => {
  try {
    const queries = await Query.find()
      .populate('responsible', 'name employeeId')
      .populate('createdBy', 'name employeeId')
      .sort({ createdAt: -1 });
    res.json(queries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create a query
exports.createQuery = async (req, res) => {
  try {
    const { product, query, resolution, responsible, status } = req.body;
    if (!product?.trim()) return res.status(400).json({ message: 'Product is required' });
    if (!query?.trim())   return res.status(400).json({ message: 'Query is required' });

    const doc = await Query.create({
      product: product.trim(),
      query: query.trim(),
      resolution: resolution?.trim() || '',
      responsible: responsible || null,
      status: VALID_STATUS.includes(status) ? status : 'open',
      createdBy: req.user._id,
    });

    const populated = await Query.findById(doc._id)
      .populate('responsible', 'name employeeId')
      .populate('createdBy', 'name employeeId');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update a query
exports.updateQuery = async (req, res) => {
  try {
    const { product, query, resolution, responsible, status } = req.body;
    const update = {};
    if (product !== undefined)    update.product = String(product).trim();
    if (query !== undefined)      update.query = String(query).trim();
    if (resolution !== undefined) update.resolution = String(resolution).trim();
    if (responsible !== undefined) update.responsible = responsible || null;
    if (status !== undefined && VALID_STATUS.includes(status)) update.status = status;

    const doc = await Query.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('responsible', 'name employeeId')
      .populate('createdBy', 'name employeeId');
    if (!doc) return res.status(404).json({ message: 'Query not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a query
exports.deleteQuery = async (req, res) => {
  try {
    const doc = await Query.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Query not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
