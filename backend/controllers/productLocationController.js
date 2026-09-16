const ProductLocation = require('../models/ProductLocation');
const ProductProspect = require('../models/ProductProspect');

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

// List the children of a location node (or the top-level nodes when no
// parent is given), each annotated with how many prospects sit directly on
// it and whether it has sub-locations of its own.
exports.getChildren = async (req, res) => {
  try {
    const { productId } = req.params;
    const parent = req.query.parent || null;

    const nodes = await ProductLocation.find({ product: productId, parent }).sort({ name: 1 });

    const withCounts = await Promise.all(nodes.map(async (node) => {
      const [prospectCount, childCount] = await Promise.all([
        ProductProspect.countDocuments({ product: productId, location: node._id }),
        ProductLocation.countDocuments({ product: productId, parent: node._id }),
      ]);
      return { ...node.toObject(), prospectCount, hasChildren: childCount > 0 };
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

    const breadcrumb = parent ? await ancestorsOf(parent) : [];

    res.json({ nodes: withCounts, unspecifiedCount, breadcrumb });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createLocation = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, parent } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Location name is required' });

    const existing = await ProductLocation.findOne({
      product: productId, parent: parent || null, name: name.trim(),
    });
    if (existing) return res.status(400).json({ message: 'A location with this name already exists here' });

    const location = await ProductLocation.create({
      product: productId, parent: parent || null, name: name.trim(), createdBy: req.user._id,
    });
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.renameLocation = async (req, res) => {
  try {
    const { locationId } = req.params;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Location name is required' });

    const location = await ProductLocation.findByIdAndUpdate(
      locationId, { name: name.trim() }, { new: true }
    );
    if (!location) return res.status(404).json({ message: 'Location not found' });
    res.json(location);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deletes a location node. Refuses if it has sub-locations or prospects
// directly on it, so data is never silently orphaned or cascub-deleted.
exports.deleteLocation = async (req, res) => {
  try {
    const { productId, locationId } = req.params;

    const [childCount, prospectCount] = await Promise.all([
      ProductLocation.countDocuments({ product: productId, parent: locationId }),
      ProductProspect.countDocuments({ product: productId, location: locationId }),
    ]);
    if (childCount > 0) return res.status(400).json({ message: 'Move or delete sub-locations first' });
    if (prospectCount > 0) return res.status(400).json({ message: 'Move or delete customers in this location first' });

    await ProductLocation.findByIdAndDelete(locationId);
    res.json({ message: 'Deleted' });
  } catch (err) {
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
    if (!target) return res.status(404).json({ message: 'Location not found' });

    const filter = { product: productId };
    filter.location = fromLocation || null;

    const result = await ProductProspect.updateMany(filter, { location: target._id });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports._ancestorsOf = ancestorsOf; // used by productController for prospect exports/labels
