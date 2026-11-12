// Recomputes Lead.mandal / Lead.district from Lead.productLocation, so leads
// saved before Mandal meant "the leaf location" show their real Mandal.
// Dry run by default; pass --apply to write.  MONGO_URI is read from .env.
require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const ProductLocation = require('../models/ProductLocation');
const { toLeadLocationFields } = require('../utils/productLocationFields');

const apply = process.argv.includes('--apply');

const pathOf = async (locationId, productId, cache) => {
  const path = [];
  const seen = new Set();
  let id = locationId ? String(locationId) : null;
  while (id && !seen.has(id) && path.length < 100) {
    seen.add(id);
    if (!cache.has(id)) cache.set(id, await ProductLocation.findById(id).select('name parent product').lean());
    const node = cache.get(id);
    if (!node || String(node.product) !== String(productId)) return null;
    path.unshift(node);
    id = node.parent ? String(node.parent) : null;
  }
  return path.length ? path : null;
};

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  const cache = new Map();
  let changed = 0;
  let skipped = 0;
  const cursor = Lead.find({ productLocation: { $type: 'objectId' } }).select('product productLocation district mandal').lean().cursor();
  for await (const lead of cursor) {
    const path = await pathOf(lead.productLocation, lead.product, cache);
    if (!path) { skipped += 1; continue; }
    const fields = toLeadLocationFields(lead.product, lead.productLocation, path);
    if (fields.mandal === lead.mandal && fields.district === lead.district) continue;
    changed += 1;
    if (apply) await Lead.updateOne({ _id: lead._id }, { $set: { mandal: fields.mandal, district: fields.district } });
  }
  console.log(`${apply ? 'Updated' : 'Would update'} ${changed} lead(s); ${skipped} skipped (location missing or in another product).`);
  if (!apply && changed) console.log('Run again with --apply to write the changes.');
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
