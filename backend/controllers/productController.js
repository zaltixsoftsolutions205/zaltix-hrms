const Product        = require('../models/Product');
const ProductProspect = require('../models/ProductProspect');
const ProductLocation = require('../models/ProductLocation');
const ProductCategoryRow = require('../models/ProductCategoryRow');
const Lead           = require('../models/Lead');
const GlobalTable    = require('../models/GlobalTable');
const { _ancestorsOf: ancestorsOf } = require('./productLocationController');
const { toLeadLocationFields } = require('../utils/productLocationFields');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const crmScope = require('../services/crmScopeService');

// "Telangana / Hyderabad / Adibatla" for a location id, or '' if unset.
async function pathLabel(locationId) {
  if (!locationId) return '';
  const chain = await ancestorsOf(locationId);
  return chain.map(n => n.name).join(' / ');
}

async function validateProspectProductLocation(productId, locationId) {
  const product = await Product.findOne({ _id: productId, status: 'active' }).select('_id').lean();
  if (!product) throw Object.assign(new Error('Product does not exist or is inactive'), { statusCode: 400 });
  if (!locationId) return { productId: product._id, path: [] };

  let current = await ProductLocation.findOne({ _id: locationId, product: product._id, kind: 'location' }).lean();
  if (!current) throw Object.assign(new Error('Location does not belong to this product'), { statusCode: 400 });
  const path = [];
  const visited = new Set();
  while (current) {
    const locationKey = String(current._id);
    if (visited.has(locationKey) || path.length >= 100) {
      throw Object.assign(new Error('Invalid location hierarchy'), { statusCode: 400 });
    }
    visited.add(locationKey);
    path.unshift(current);
    if (!current.parent) break;
    current = await ProductLocation.findOne({ _id: current.parent, product: product._id, kind: 'location' }).lean();
    if (!current) throw Object.assign(new Error('Location hierarchy crosses product boundaries'), { statusCode: 400 });
  }
  return { productId: product._id, path };
}

/* ── Products ─────────────────────────────────────────────────────────── */

exports.getProducts = async (req, res) => {
  try {
    const filter = {};

    const products = await Product.find(filter)
      .populate('createdBy', 'name employeeId')
      .sort({ createdAt: -1 });

    // Lead totals per product (all / won / lost), within the user's CRM scope.
    await crmScope.getScope(req.user);
    const leadStats = await Lead.aggregate([
      { $match: { $and: [crmScope.leadFilter(req.user), { product: { $in: products.map((p) => p._id) } }] } },
      { $group: {
        _id: '$product',
        total: { $sum: 1 },
        won: { $sum: { $cond: [{ $eq: ['$pipelineStage', 'lead-won'] }, 1, 0] } },
        lost: { $sum: { $cond: [{ $eq: ['$pipelineStage', 'lead-lost'] }, 1, 0] } },
      } },
    ]);
    const statsByProduct = new Map(leadStats.map((s) => [String(s._id), s]));

    const withCounts = await Promise.all(products.map(async (p) => {
      const [total, contacted, interested, converted] = await Promise.all([
        ProductProspect.countDocuments({ product: p._id }),
        ProductProspect.countDocuments({ product: p._id, status: 'contacted' }),
        ProductProspect.countDocuments({ product: p._id, status: 'interested' }),
        ProductProspect.countDocuments({ product: p._id, status: 'converted' }),
      ]);
      const s = statsByProduct.get(String(p._id));
      return {
        ...p.toObject(), prospectCount: total, contactedCount: contacted, interestedCount: interested, convertedCount: converted,
        leadCount: s?.total || 0, wonCount: s?.won || 0, lostCount: s?.lost || 0,
      };
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
    const result = await withMongoTransaction(async (session) => {
      const product = await Product.findOneAndUpdate(
        { _id: req.params.id },
        { $inc: { globalTableWriteVersion: 1 } },
        { new: true, session }
      );
      if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
      const [tableCount, leadCount] = await Promise.all([
        GlobalTable.countDocuments({ product: product._id }).session(session),
        Lead.countDocuments({ product: product._id }).session(session),
      ]);
      if (tableCount > 0) {
        throw Object.assign(new Error('Delete or move this product Global Tables before deleting the product'), { statusCode: 409 });
      }
      if (leadCount > 0) {
        throw Object.assign(new Error('Move or delete Leads associated with this product before deleting it'), { statusCode: 409 });
      }
      await ProductProspect.deleteMany({ product: product._id }, { session });
      await ProductLocation.deleteMany({ product: product._id }, { session });
      await ProductCategoryRow.deleteMany({ product: product._id }, { session });
      await Product.deleteOne({ _id: product._id }, { session });
      return { message: 'Deleted' };
    });
    return res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.isTransactionUnavailable) return res.status(503).json({ message: err.message });
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
    await validateProspectProductLocation(productId, location);
    const prospect = await ProductProspect.create({
      product: productId, companyName, location: location || null, address, website, contactNumber, emailId, companyType, companySize, remarks,
      status: status || 'new',
      addedBy: req.user._id,
    });
    res.status(201).json(prospect);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

exports.bulkCreateProspects = async (req, res) => {
  try {
    const { productId } = req.params;
    const { prospects } = req.body;
    if (!Array.isArray(prospects) || prospects.length === 0)
      return res.status(400).json({ message: 'No prospects provided' });

    const docs = [];
    for (const prospect of prospects.filter(p => p.companyName?.trim())) {
      // eslint-disable-next-line no-await-in-loop
      await validateProspectProductLocation(productId, prospect.location);
      docs.push({
        companyName: prospect.companyName.trim(),
        location: prospect.location || null,
        address: prospect.address,
        website: prospect.website,
        contactNumber: prospect.contactNumber,
        emailId: prospect.emailId,
        linkedinUrl: prospect.linkedinUrl,
        companyType: prospect.companyType,
        companySize: prospect.companySize,
        remarks: prospect.remarks,
        product: productId,
        addedBy: req.user._id,
        status: prospect.status || 'new',
      });
    }

    const created = await withMongoTransaction((session) => ProductProspect.insertMany(docs, { session }));
    res.status(201).json({ count: created.length });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

exports.updateProspect = async (req, res) => {
  try {
    const { productId, prospectId } = req.params;
    if (Object.prototype.hasOwnProperty.call(req.body, 'product')) {
      return res.status(400).json({ message: 'Prospect product cannot be changed' });
    }
    const allowedFields = ['companyName', 'location', 'address', 'website', 'contactNumber', 'emailId', 'linkedinUrl', 'companyType', 'companySize', 'remarks', 'status'];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowedFields.includes(key)));
    const existing = await ProductProspect.findOne({ _id: prospectId, product: productId });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (Object.prototype.hasOwnProperty.call(updates, 'location')) {
      await validateProspectProductLocation(productId, updates.location);
      updates.location = updates.location || null;
    }
    const prospect = await ProductProspect.findOneAndUpdate({ _id: prospectId, product: productId }, updates, { new: true, runValidators: true });
    if (!prospect) return res.status(404).json({ message: 'Not found' });
    res.json({ ...prospect.toObject(), locationPath: await pathLabel(prospect.location) });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
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
    const result = await withMongoTransaction(async (session) => {
      const prospect = await ProductProspect.findOne({ _id: req.params.prospectId, product: req.params.productId })
        .session(session)
        .populate({ path: 'product', select: 'name status', options: { session } });
      if (!prospect) throw Object.assign(new Error('Prospect not found'), { statusCode: 404 });
      if (prospect.convertedToLead) throw Object.assign(new Error('Already converted to lead'), { statusCode: 400 });
      if (!prospect.contactNumber) throw Object.assign(new Error('Contact number is required to create a lead'), { statusCode: 400 });
      if (!prospect.product || prospect.product.status !== 'active') {
        throw Object.assign(new Error('Prospect product is unavailable'), { statusCode: 400 });
      }

      let locationFields = { district: '', mandal: '', productLocation: null };
      if (prospect.location) {
        const path = [];
        const visited = new Set();
        let current = await ProductLocation.findOne({
          _id: prospect.location,
          product: prospect.product._id,
          kind: 'location',
        }).session(session).lean();
        if (!current) throw Object.assign(new Error('Prospect location does not belong to its product'), { statusCode: 400 });
        while (current) {
          const locationKey = String(current._id);
          if (visited.has(locationKey) || path.length >= 100) {
            throw Object.assign(new Error('Invalid prospect location hierarchy'), { statusCode: 400 });
          }
          visited.add(locationKey);
          path.unshift(current);
          if (!current.parent) break;
          current = await ProductLocation.findOne({
            _id: current.parent,
            product: prospect.product._id,
            kind: 'location',
          }).session(session).lean();
          if (!current) throw Object.assign(new Error('Prospect location hierarchy crosses product boundaries'), { statusCode: 400 });
        }
        locationFields = toLeadLocationFields(prospect.product._id, prospect.location, path);
      }

      const lead = await new Lead({
        name: prospect.companyName,
        assignedTo: req.user._id,
        createdBy: req.user._id,
        product: prospect.product._id,
        ...locationFields,
      }).save({ session });

      prospect.convertedToLead = lead._id;
      prospect.status = 'converted';
      await prospect.save({ session });
      return { lead, prospect };
    });
    return res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.isTransactionUnavailable) return res.status(503).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};
