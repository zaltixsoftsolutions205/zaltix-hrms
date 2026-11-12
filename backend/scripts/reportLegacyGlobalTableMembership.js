require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableField = require('../models/GlobalTableField');
const GlobalTableValue = require('../models/GlobalTableValue');

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);

  const unassignedLeads = await Lead.aggregate([
    { $match: { globalTableId: null, productLocation: { $type: 'objectId' } } },
    {
      $group: {
        _id: { product: '$product', location: '$productLocation' },
        leadCount: { $sum: 1 },
      },
    },
    { $sort: { '_id.product': 1, '_id.location': 1 } },
  ]);

  const tables = await GlobalTable.find({ product: { $type: 'objectId' }, location: { $type: 'objectId' } })
    .select('_id name product location isActive')
    .sort({ product: 1, location: 1, name: 1 })
    .lean();

  const tableValueEvidence = [];
  for (const table of tables) {
    const fields = await GlobalTableField.find({ tableId: table._id }).distinct('_id');
    const recordIds = fields.length
      ? await GlobalTableValue.distinct('recordId', { tableId: table._id, fieldId: { $in: fields } })
      : [];
    tableValueEvidence.push({
      tableId: String(table._id),
      name: table.name,
      productId: String(table.product),
      locationId: String(table.location),
      isActive: table.isActive,
      recordsWithTableValues: recordIds.length,
    });
  }

  process.stdout.write(`${JSON.stringify({
    note: 'Report only. No legacy Lead is assigned automatically; value evidence may be incomplete.',
    unassignedLeadGroups: unassignedLeads.map((group) => ({
      productId: group._id.product ? String(group._id.product) : null,
      locationId: String(group._id.location),
      leadCount: group.leadCount,
    })),
    scopedTables: tableValueEvidence,
  }, null, 2)}\n`);
};

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
