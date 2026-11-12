// Removes custom Global Table fields named "Serial No." (and their stored
// values) from every table. The built-in serial number was dropped; this
// clears look-alike custom columns that were added by hand.
// Dry run by default; pass --apply to delete.  MONGO_URI is read from .env.
require('dotenv').config();
const mongoose = require('mongoose');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableField = require('../models/GlobalTableField');
const GlobalTableValue = require('../models/GlobalTableValue');

const apply = process.argv.includes('--apply');
const SERIAL_LABEL = /^\s*serial\s*(no\.?|number|#)?\s*$/i;

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);

  const fields = await GlobalTableField.find({ $or: [{ label: SERIAL_LABEL }, { key: /^serial(_?no|_?number)?$/i }] })
    .select('_id tableId key label')
    .lean();
  if (!fields.length) {
    console.log('No "Serial No." custom fields found. If the column still shows, hard-refresh the browser (Ctrl+Shift+R) and restart the frontend dev server.');
    await mongoose.disconnect();
    return;
  }

  const tables = new Map((await GlobalTable.find({ _id: { $in: fields.map((f) => f.tableId) } }).select('_id name').lean())
    .map((t) => [String(t._id), t.name]));
  for (const field of fields) {
    const values = await GlobalTableValue.countDocuments({ fieldId: field._id });
    console.log(`${apply ? 'Deleting' : 'Would delete'} field "${field.label}" (key ${field.key}) in table "${tables.get(String(field.tableId)) || field.tableId}" with ${values} value(s)`);
    if (apply) {
      await GlobalTableValue.deleteMany({ fieldId: field._id });
      await GlobalTableField.deleteOne({ _id: field._id });
    }
  }
  if (!apply) console.log('Run again with --apply to delete them.');
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
