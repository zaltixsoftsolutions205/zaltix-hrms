// One-time cleanup: activities (visit, demo, data-update, registration, feedback)
// no longer use per-lead GlobalTable forms. Their default fields are now fixed
// fields on the Visit / Demo / DataUpdate / Registration / Feedback models.
//
// This script:
//   1. saves every form table, field and value to a JSON backup file,
//   2. copies the saved values onto the activity records (never overwrites),
//   3. deletes the form tables, their fields and values,
//   4. drops the old { entity, lead } index on globaltables.
// "Next Follow-up Date" values are not copied: the follow-up date lives on the lead.
// Stops without changing anything if a form holds a value it cannot copy.
//
// Dry run by default; pass --apply to change the database.  MONGO_URI is read from .env.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');

// form field key -> [collection of the activity, field on that record]
const TARGETS = {
  visit: {
    collection: 'visits',
    keys: {
      visit_type: 'visitType',
      lead_feedback: 'leadFeedback',
      lead_feedback_other: 'leadFeedbackOther',
      sales_comment: 'salesComment',
      sales_comment_other: 'salesCommentOther',
      sales_notes: 'salesNotes',
    },
  },
  demo: { collection: 'demos', keys: { demo_notes: 'demoNotes' } },
  'data-update': { collection: 'dataupdates', keys: { update_notes: 'updateNotes' } },
  registration: { collection: 'registrations', keys: { registration_notes: 'notes' } },
  feedback: { collection: 'feedbacks', keys: { comments: 'comments' } },
};
const SKIPPED_KEYS = new Set(['next_follow_up_date']);

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const tablesCol = db.collection('globaltables');
  const fieldsCol = db.collection('globaltablefields');
  const valuesCol = db.collection('globaltablevalues');

  const forms = await tablesCol.find({ entity: { $in: Object.keys(TARGETS) } }).toArray();
  const formIds = forms.map((t) => t._id);
  const fields = await fieldsCol.find({ tableId: { $in: formIds } }).toArray();
  const values = await valuesCol.find({ tableId: { $in: formIds } }).toArray();
  console.log(`Form tables: ${forms.length}, fields: ${fields.length}, values: ${values.length}`);

  const formById = new Map(forms.map((t) => [String(t._id), t]));
  const fieldById = new Map(fields.map((f) => [String(f._id), f]));

  // Plan the copies; collect anything that cannot be copied.
  const copies = []; // { collection, recordId, field, value }
  const problems = [];
  let skipped = 0;
  for (const v of values) {
    const form = formById.get(String(v.tableId));
    const field = fieldById.get(String(v.fieldId));
    if (v.value === null || v.value === undefined || v.value === '') continue;
    if (field && SKIPPED_KEYS.has(field.key)) { skipped += 1; continue; }
    const target = TARGETS[form.entity];
    const to = field && target.keys[field.key];
    if (!to) {
      problems.push(`${form.entity} form ${form._id}: value ${v._id} of field "${field ? field.key : v.fieldId}" has no fixed field to go to`);
      continue;
    }
    copies.push({ collection: target.collection, recordId: v.recordId, field: to, value: String(v.value) });
  }
  console.log(`Values to copy onto activity records: ${copies.length}`);
  console.log(`"Next Follow-up Date" values not copied (the date lives on the lead): ${skipped}`);
  if (problems.length) {
    console.log('\nCannot continue, these values would be lost:');
    problems.forEach((p) => console.log(`  - ${p}`));
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    copies.forEach((c) => console.log(`  ${c.collection} ${c.recordId}: ${c.field} = ${JSON.stringify(c.value)}`));
    console.log('\nDry run only. Re-run with --apply to change the database.');
    await mongoose.disconnect();
    return;
  }

  // 1. Backup
  const backupDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `activity-forms-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ tables: forms, fields, values }, null, 2));
  console.log(`Backup written: ${backupFile}`);

  // 2. Copy values (only into empty fields), 3. delete forms — in one transaction.
  const session = await mongoose.startSession();
  let copied = 0;
  try {
    await session.withTransaction(async () => {
      copied = 0;
      for (const c of copies) {
        const res = await db.collection(c.collection).updateOne(
          { _id: c.recordId, $or: [{ [c.field]: { $exists: false } }, { [c.field]: '' }, { [c.field]: null }] },
          { $set: { [c.field]: c.value } },
          { session }
        );
        copied += res.modifiedCount;
      }
      await valuesCol.deleteMany({ tableId: { $in: formIds } }, { session });
      await fieldsCol.deleteMany({ tableId: { $in: formIds } }, { session });
      await tablesCol.deleteMany({ _id: { $in: formIds } }, { session });
    });
  } finally {
    await session.endSession();
  }
  console.log(`Copied ${copied} values; deleted ${forms.length} tables, ${fields.length} fields, ${values.length} values.`);

  // 4. The old one-form-per-lead index
  const indexes = await tablesCol.indexes();
  const old = indexes.find((i) => i.key && i.key.entity === 1 && i.key.lead === 1);
  if (old) {
    await tablesCol.dropIndex(old.name);
    console.log(`Dropped index ${old.name} on globaltables.`);
  }
  await tablesCol.updateMany({ lead: { $exists: true } }, { $unset: { lead: '' } });

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
