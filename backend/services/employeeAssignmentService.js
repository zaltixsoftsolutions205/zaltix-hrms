const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductLocation = require('../models/ProductLocation');

// Roles whose CRM data scope is defined by product → Mandal assignments.
const ASSIGNABLE_ROLES = ['sales', 'inside-sales', 'product-executive'];

const isAssignableRole = (role) => ASSIGNABLE_ROLES.includes(role);

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const isObjectId = (value) =>
  typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value.toLowerCase();

// Pure validation step, separated from the DB lookups so it can be unit tested.
//   input       — raw req.body.productLocationAssignments
//   products    — Map(productId -> { status })            for every referenced product
//   locations   — Map(locationId -> { product, kind })    for every referenced Mandal
//   nonLeafIds  — Set of referenced location IDs that still have child locations
// Returns [{ product, mandals }] with IDs deduplicated, duplicate product
// entries merged and products with no Mandals dropped. Throws a 400 error on
// anything invalid — nothing is silently discarded.
function normalizeAssignments(input, { products, locations, nonLeafIds }) {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) throw badRequest('productLocationAssignments must be an array');

  const byProduct = new Map();

  for (const entry of input) {
    const productId = entry && typeof entry.product === 'string' ? entry.product.toLowerCase() : entry?.product;
    if (!isObjectId(productId)) throw badRequest('Invalid product ID in assignments');
    if (!Array.isArray(entry.mandals)) throw badRequest('Each product assignment needs a mandals array');

    const product = products.get(productId);
    if (!product) throw badRequest('An assigned product does not exist');
    if (product.status !== 'active') throw badRequest('An assigned product is inactive');

    const mandals = byProduct.get(productId) || new Set();

    for (const rawId of entry.mandals) {
      const mandalId = typeof rawId === 'string' ? rawId.toLowerCase() : rawId;
      if (!isObjectId(mandalId)) throw badRequest('Invalid Mandal ID in assignments');

      const location = locations.get(mandalId);
      if (!location || location.kind !== 'location') throw badRequest('An assigned Mandal does not exist');
      if (String(location.product) !== productId) throw badRequest('An assigned Mandal does not belong to its product');
      if (nonLeafIds.has(mandalId)) throw badRequest('Only Mandals (locations without sub-locations) can be assigned');

      mandals.add(mandalId);
    }

    byProduct.set(productId, mandals);
  }

  return [...byProduct.entries()]
    .filter(([, mandals]) => mandals.size > 0)
    .map(([product, mandals]) => ({ product, mandals: [...mandals] }));
}

// Validate submitted assignments against the database and return the
// normalized value to store. Never trusts the client's IDs.
async function resolveAssignments(input) {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) throw badRequest('productLocationAssignments must be an array');

  const productIds = new Set();
  const mandalIds = new Set();
  for (const entry of input) {
    if (isObjectId(entry?.product)) productIds.add(entry.product.toLowerCase());
    if (Array.isArray(entry?.mandals)) {
      entry.mandals.forEach((id) => { if (isObjectId(id)) mandalIds.add(id.toLowerCase()); });
    }
  }

  const [productDocs, locationDocs, parentsWithChildren] = await Promise.all([
    Product.find({ _id: { $in: [...productIds] } }).select('_id status').lean(),
    ProductLocation.find({ _id: { $in: [...mandalIds] } }).select('_id product kind').lean(),
    ProductLocation.distinct('parent', { parent: { $in: [...mandalIds] }, kind: 'location' }),
  ]);

  return normalizeAssignments(input, {
    products: new Map(productDocs.map((p) => [String(p._id), p])),
    locations: new Map(locationDocs.map((l) => [String(l._id), l])),
    nonLeafIds: new Set(parentsWithChildren.map(String)),
  });
}

// Everything the assignment picker needs in one round trip: active products
// plus a flat list of their location nodes (the client builds the tree from
// `parent`). Category nodes are not assignable, so they are left out.
async function getAssignmentOptions() {
  const products = await Product.find({ status: 'active' })
    .select('_id name productType')
    .sort({ name: 1 })
    .lean();

  const locations = await ProductLocation.find({
    product: { $in: products.map((p) => p._id) },
    kind: 'location',
  })
    .select('_id name parent product')
    .sort({ name: 1 })
    .lean();

  return { products, locations };
}

module.exports = {
  ASSIGNABLE_ROLES,
  isAssignableRole,
  normalizeAssignments,
  resolveAssignments,
  getAssignmentOptions,
};
