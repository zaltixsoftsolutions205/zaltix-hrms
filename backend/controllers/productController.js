const Product        = require('../models/Product');
const ProductProspect = require('../models/ProductProspect');
const ProductLocation = require('../models/ProductLocation');
const Lead           = require('../models/Lead');
const { _ancestorsOf: ancestorsOf } = require('./productLocationController');

// "Telangana / Hyderabad / Adibatla" for a location id, or '' if unset.
async function pathLabel(locationId) {
  if (!locationId) return '';
  const chain = await ancestorsOf(locationId);
  return chain.map(n => n.name).join(' / ');
}

/* ── Products ─────────────────────────────────────────────────────────── */

exports.getProducts = async (req, res) => {
  try {
    const filter = {};

    const products = await Product.find(filter)
      .populate('createdBy', 'name employeeId')
      .sort({ createdAt: -1 });

    const withCounts = await Promise.all(products.map(async (p) => {
      const [total, contacted, interested, converted] = await Promise.all([
        ProductProspect.countDocuments({ product: p._id }),
        ProductProspect.countDocuments({ product: p._id, status: 'contacted' }),
        ProductProspect.countDocuments({ product: p._id, status: 'interested' }),
        ProductProspect.countDocuments({ product: p._id, status: 'converted' }),
      ]);
      return { ...p.toObject(), prospectCount: total, contactedCount: contacted, interestedCount: interested, convertedCount: converted };
    }));

    res.json(withCounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { name, category } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Product name is required' });
    const product = await Product.create({ name, category, createdBy: req.user._id });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    await ProductProspect.deleteMany({ product: req.params.id });
    await ProductLocation.deleteMany({ product: req.params.id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── Prospects ─────────────────────────────────────────────────────────── */

exports.getProspects = async (req, res) => {
  try {
    const { productId } = req.params;
    const filter = { product: productId };
    if (req.query.status) filter.status = req.query.status;
    // 'unspecified' means "no location set"; any other value filters to
    // prospects on that exact location node (not its descendants).
    if (req.query.location === 'unspecified') {
      filter.$or = [{ location: null }, { location: { $exists: false } }];
    } else if (req.query.location) {
      filter.location = req.query.location;
    }

    const prospects = await ProductProspect.find(filter)
      .populate('addedBy', 'name employeeId')
      .populate('convertedToLead', 'companyName status')
      .sort({ createdAt: -1 });

    const withPaths = await Promise.all(prospects.map(async (p) => ({
      ...p.toObject(), locationPath: await pathLabel(p.location),
    })));

    res.json(withPaths);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createProspect = async (req, res) => {
  try {
    const { productId } = req.params;
    const { companyName, location, address, website, contactNumber, emailId, companyType, companySize, remarks, status } = req.body;
    if (!companyName?.trim()) return res.status(400).json({ message: 'Company name is required' });
    const prospect = await ProductProspect.create({
      product: productId, companyName, location: location || null, address, website, contactNumber, emailId, companyType, companySize, remarks,
      status: status || 'new',
      addedBy: req.user._id,
    });
    res.status(201).json(prospect);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.bulkCreateProspects = async (req, res) => {
  try {
    const { productId } = req.params;
    const { prospects } = req.body;
    if (!Array.isArray(prospects) || prospects.length === 0)
      return res.status(400).json({ message: 'No prospects provided' });

    const docs = prospects
      .filter(p => p.companyName?.trim())
      .map(p => ({ ...p, location: p.location || null, product: productId, addedBy: req.user._id, status: p.status || 'new' }));

    const created = await ProductProspect.insertMany(docs);
    res.status(201).json({ count: created.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProspect = async (req, res) => {
  try {
    const updates = { ...req.body };
    if ('location' in updates) updates.location = updates.location || null;
    const prospect = await ProductProspect.findByIdAndUpdate(req.params.prospectId, updates, { new: true });
    if (!prospect) return res.status(404).json({ message: 'Not found' });
    res.json({ ...prospect.toObject(), locationPath: await pathLabel(prospect.location) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteProspect = async (req, res) => {
  try {
    await ProductProspect.findByIdAndDelete(req.params.prospectId);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.convertToLead = async (req, res) => {
  try {
    const prospect = await ProductProspect.findById(req.params.prospectId).populate('product', 'name');
    if (!prospect) return res.status(404).json({ message: 'Prospect not found' });
    if (prospect.convertedToLead) return res.status(400).json({ message: 'Already converted to lead' });
    if (!prospect.contactNumber) return res.status(400).json({ message: 'Contact number is required to create a lead' });

    const lead = await Lead.create({
      name:       prospect.companyName,
      phone:      prospect.contactNumber,
      email:      prospect.emailId || '',
      company:    prospect.companyName || '',
      source:     'other',
      notes:      `[Product: ${prospect.product?.name || ''}] ${prospect.remarks || ''}`.trim(),
      status:     'new',
      assignedTo: req.user._id,
    });

    prospect.convertedToLead = lead._id;
    prospect.status = 'converted';
    await prospect.save();

    res.json({ lead, prospect });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
