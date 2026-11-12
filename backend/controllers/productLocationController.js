const ProductLocation = require('../models/ProductLocation');
const ProductProspect = require('../models/ProductProspect');
const ProductCategoryRow = require('../models/ProductCategoryRow');
const Product = require('../models/Product');
const GlobalTable = require('../models/GlobalTable');
const Lead = require('../models/Lead');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const crmScope = require('../services/crmScopeService');

// Walk parent pointers up to the root, returning oldest-first
// (e.g. [Telangana, Hyderabad, Adibatla]) for breadcrumb display.
async function ancestorsOf(locationId) {
  const chain = [];
  let current = locationId ? await ProductLocation.findById(locationId) : null;
  while (current) {
    chain.unshift(current);
    current = current.parent ? await ProductLocation.findById(current.parent) : null;
  }
  return chain;
}

/**
 * Leads (within the user's CRM scope) in the active lead tables on each node
 * or anywhere below it. Returns Map(nodeId -> count).
 */
async function leadCountsUnder(productId, nodes, user) {
  const result = new Map();
  if (!nodes.length) return result;

  // node id -> ids of the node and all its descendant locations
  const all = await ProductLocation.find({ product: productId, kind: 'location' }).select('_id parent').lean();
  const kids = new Map();
  all.forEach((l) => {
    if (!l.parent) return;
    const key = String(l.parent);
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(String(l._id));
  });
  const ownerOf = new Map(); // location id -> top node it counts for
  nodes.forEach((node) => {
    const stack = [String(node._id)];
    while (stack.length) {
      const id = stack.pop();
      ownerOf.set(id, String(node._id));
      stack.push(...(kids.get(id) || []));
    }
  });

  const tables = await GlobalTable.find({ entity: 'lead', isActive: true, product: productId, location: { $in: [...ownerOf.keys()] } })
    .select('_id location').lean();
  if (!tables.length) return result;

  await crmScope.getScope(user);
  const counts = await Lead.aggregate([
    { $match: { $and: [crmScope.leadFilter(user), { globalTableId: { $in: tables.map((t) => t._id) } }] } },
    { $group: { _id: '$globalTableId', count: { $sum: 1 } } },
  ]);
  const tableOwner = new Map(tables.map((t) => [String(t._id), ownerOf.get(String(t.location))]));
  counts.forEach((c) => {
    const owner = tableOwner.get(String(c._id));
    if (owner) result.set(owner, (result.get(owner) || 0) + c.count);
  });
  return result;
}

// List the children of a location node (or the top-level nodes when no
// parent is given), each annotated with how many prospects sit directly on
// it and whether it has sub-locations of its own.
exports.getChildren = async (req, res) => {
  try {
    const { productId } = req.params;
    const parent = req.query.parent || null;

    const nodes = await ProductLocation.find({ product: productId, parent }).sort({ name: 1 });
    const leadCounts = await leadCountsUnder(productId, nodes, req.user);

    const withCounts = await Promise.all(nodes.map(async (node) => {
      if (node.kind === 'category') {
        const rowCount = await ProductCategoryRow.countDocuments({ category: node._id });
        return { ...node.toObject(), rowCount, hasChildren: false };
      }
      const [prospectCount, subLocationCount, categoryCount, tableCount] = await Promise.all([
        ProductProspect.countDocuments({ product: productId, location: node._id }),
        ProductLocation.countDocuments({ product: productId, parent: node._id, kind: 'location' }),
        ProductLocation.countDocuments({ product: productId, parent: node._id, kind: 'category' }),
        GlobalTable.countDocuments({ product: productId, location: node._id, isActive: true }),
      ]);
      const leadCount = leadCounts.get(String(node._id)) || 0;
      return {
        ...node.toObject(),
        // Customers = leads in the Mandal tables under this location + legacy prospects on it.
        prospectCount: prospectCount + leadCount,
        leadCount,
        subLocationCount, categoryCount, tableCount,
        hasChildren: subLocationCount + categoryCount > 0,
      };
    }));

    // Direct prospects with no location at all only make sense to surface
    // at the top level (parent === null) — deeper levels have no such bucket.
    let unspecifiedCount = 0;
    if (!parent) {
      unspecifiedCount = await ProductProspect.countDocuments({
        product: productId,
        $or: [{ location: null }, { location: { $exists: false } }],
      });
    }

    // Virtual "ALL SCHOOLS" card: for schools-type products, whenever we're
    // inside a location (not the top level, which holds only locations) and
    // it has at least one direct category, show a synthetic read-only node
    // summing just that location's own categories. Never stored — id is a
    // sentinel ("all-schools:<locationId>"), not a real ProductLocation.
    let allNodes = withCounts;
    if (parent) {
      const product = await Product.findById(productId);
      const directCategories = withCounts.filter(n => n.kind === 'category');
      if (product?.productType === 'schools' && directCategories.length > 0) {
        const rowCount = directCategories.reduce((sum, c) => sum + c.rowCount, 0);
        const fields = Array.from(new Set(directCategories.flatMap(c => c.fields)));
        allNodes = [
          {
            _id: `all-schools:${parent}`,
            kind: 'category',
            isAllSchools: true,
            name: 'ALL SCHOOLS',
            fields,
            rowCount,
            hasChildren: false,
          },
          ...withCounts,
        ];
      }
    }

    const breadcrumb = parent ? await ancestorsOf(parent) : [];

    res.json({ nodes: allNodes, unspecifiedCount, breadcrumb });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createLocation = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, parent, kind } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Location name is required' });

    const wantsCategory = kind === 'category';
    if (wantsCategory) {
      const product = await Product.findById(productId);
      if (product?.productType !== 'schools') {
        return res.status(400).json({ message: 'Categories are only available for this product type' });
      }
      if (!parent) {
        return res.status(400).json({ message: 'A category must be created inside a location' });
      }
    }

    if (parent) {
      const parentNode = await ProductLocation.findOne({ _id: parent, product: productId });
      if (!parentNode) return res.status(404).json({ message: 'Parent location not found' });
      if (parentNode.kind === 'category') {
        return res.status(400).json({ message: 'Categories cannot contain sub-locations or sub-categories' });
      }
      // Tables live only on Mandals (leaf locations): a node holding tables
      // cannot gain sub-locations, or its tables would sit above the Mandals.
      if (!wantsCategory && await GlobalTable.exists({ product: productId, location: parent, isActive: true })) {
        return res.status(400).json({ message: 'This Mandal has tables. Move or remove them before adding sub-locations.' });
      }
    }

    const existing = await ProductLocation.findOne({
      product: productId, parent: parent || null, name: name.trim(),
    });
    if (existing) return res.status(400).json({ message: 'A location with this name already exists here' });

    const location = await ProductLocation.create({
      product: productId, parent: parent || null, name: name.trim(),
      kind: wantsCategory ? 'category' : 'location',
      createdBy: req.user._id,
    });
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.renameLocation = async (req, res) => {
  try {
    const { productId, locationId } = req.params;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Location name is required' });

    const location = await ProductLocation.findOneAndUpdate(
      { _id: locationId, product: productId }, { name: name.trim() }, { new: true }
    );
    if (!location) return res.status(404).json({ message: 'Location not found' });
    res.json(location);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deletes a location or category node. Refuses if it still holds anything
// (sub-locations, prospects, or category rows), so data is never silently
// orphaned or cascade-deleted.
exports.deleteLocation = async (req, res) => {
  try {
    const { productId, locationId } = req.params;
    const result = await withMongoTransaction(async (session) => {
      const node = await ProductLocation.findOneAndUpdate(
        { _id: locationId, product: productId },
        { $inc: { globalTableWriteVersion: 1 } },
        { new: true, session }
      );
      if (!node) throw Object.assign(new Error('Location not found'), { statusCode: 404 });

      if (node.kind === 'category') {
        const rowCount = await ProductCategoryRow.countDocuments({ category: locationId }).session(session);
        if (rowCount > 0) throw Object.assign(new Error('Delete the rows in this category first'), { statusCode: 400 });
      } else {
        const [childCount, prospectCount, tableCount, leadCount] = await Promise.all([
          ProductLocation.countDocuments({ product: productId, parent: locationId }).session(session),
          ProductProspect.countDocuments({ product: productId, location: locationId }).session(session),
          GlobalTable.countDocuments({ product: productId, location: locationId }).session(session),
          Lead.countDocuments({ productLocation: locationId }).session(session),
        ]);
        if (childCount > 0) throw Object.assign(new Error('Move or delete sub-locations first'), { statusCode: 400 });
        if (prospectCount > 0) throw Object.assign(new Error('Move or delete customers in this location first'), { statusCode: 400 });
        if (tableCount > 0) throw Object.assign(new Error('Delete or move Global Tables in this location first'), { statusCode: 400 });
        if (leadCount > 0) throw Object.assign(new Error('Move or delete Leads in this location first'), { statusCode: 400 });
      }

      await ProductLocation.deleteOne({ _id: locationId, product: productId }, { session });
      return { message: 'Deleted' };
    });
    return res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.isTransactionUnavailable) return res.status(503).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// Move every prospect currently unassigned (or on `fromLocation`, if given)
// under this product to `toLocation`.
exports.bulkSetLocation = async (req, res) => {
  try {
    const { productId } = req.params;
    const { fromLocation, toLocation } = req.body;
    if (!toLocation) return res.status(400).json({ message: 'Target location is required' });

    const target = await ProductLocation.findOne({ _id: toLocation, product: productId });
    if (!target || target.kind !== 'location') return res.status(404).json({ message: 'Location not found' });

    const filter = { product: productId };
    filter.location = fromLocation || null;

    const result = await ProductProspect.updateMany(filter, { location: target._id });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports._ancestorsOf = ancestorsOf; // used by productController for prospect exports/labels
