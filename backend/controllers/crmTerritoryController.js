const Lead = require('../models/Lead');
const Product = require('../models/Product');
const ProductLocation = require('../models/ProductLocation');
const GlobalTable = require('../models/GlobalTable');
const crmScope = require('../services/crmScopeService');

/**
 * GET /api/leads/territory
 * The part of the product -> location -> Mandal -> table tree this user may
 * work in, for the Leads page tree and its Product / Mandal pickers.
 *
 *   scope      'all' (admin/hr/manager) | 'territory' (sales roles) | 'own'
 *   products   [{ _id, name }]
 *   locations  [{ _id, name, parent, product }]  visible nodes only
 *   mandals    [locationId]                       where this user may create leads
 *   tables     [{ _id, name, product, location, count }]
 *   allLeadsCount  leads this user created, any stage (the "All my leads" table total)
 *
 * ?product=<id> limits the result to one product (Product Detail page).
 */
exports.getTerritory = async (req, res) => {
  try {
    const scope = await crmScope.getScope(req.user);
    const leadFilter = crmScope.leadFilter(req.user);
    const onlyProduct = typeof req.query.product === 'string' && /^[a-fA-F0-9]{24}$/.test(req.query.product)
      ? req.query.product
      : null;

    let products = [];
    let locations = [];
    let mandals = [];

    if (scope.kind === 'all') {
      products = await Product.find({ status: 'active', ...(onlyProduct ? { _id: onlyProduct } : {}) }).select('_id name').sort({ name: 1 }).lean();
      locations = await ProductLocation.find({ product: { $in: products.map((p) => p._id) }, kind: 'location' })
        .select('_id name parent product').sort({ name: 1 }).lean();
      const parents = new Set(locations.filter((l) => l.parent).map((l) => String(l.parent)));
      mandals = locations.filter((l) => !parents.has(String(l._id))).map((l) => String(l._id));
    } else if (scope.kind === 'territory') {
      const productIds = [...scope.products.keys()].filter((id) => !onlyProduct || id === onlyProduct);
      const visibleIds = [...scope.products.values()].flatMap((entry) => [...entry.visible]);
      products = await Product.find({ _id: { $in: productIds }, status: 'active' }).select('_id name').sort({ name: 1 }).lean();
      const activeProducts = new Set(products.map((p) => String(p._id)));
      locations = (await ProductLocation.find({ _id: { $in: visibleIds }, kind: 'location' })
        .select('_id name parent product').sort({ name: 1 }).lean())
        .filter((l) => activeProducts.has(String(l.product)));
      mandals = [...scope.products.entries()]
        .filter(([productId]) => activeProducts.has(productId))
        .filter(([productId]) => !onlyProduct || productId === onlyProduct)
        .flatMap(([, entry]) => [...entry.mandals]);
    }

    const locationIds = locations.map((l) => l._id);
    const tables = locationIds.length
      ? await GlobalTable.find({ entity: 'lead', isActive: true, location: { $in: locationIds } })
        .select('_id name product location').sort({ name: 1 }).lean()
      : [];

    // Lead counts per table and for the single Leads table, within this user's scope.
    const counts = tables.length
      ? await Lead.aggregate([
        { $match: { $and: [leadFilter, { globalTableId: { $in: tables.map((t) => t._id) } }] } },
        { $group: { _id: '$globalTableId', count: { $sum: 1 } } },
      ])
      : [];
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    // "All my leads" = leads this user created, in every stage, that they can
    // still see (the same query as GET /leads?createdBy=me), so the badge
    // matches the table's total.
    const allLeadsCount = await Lead.countDocuments({
      $and: [leadFilter, { createdBy: req.user._id }],
    });

    return res.json({
      scope: scope.kind,
      canManageTree: crmScope.isTreeManager(req.user),
      products,
      locations,
      mandals,
      tables: tables.map((t) => ({ ...t, count: countMap.get(String(t._id)) || 0 })),
      allLeadsCount,
    });
  } catch (err) {
    console.error('getTerritory error:', err);
    return res.status(500).json({ message: 'Failed to load your territory' });
  }
};
