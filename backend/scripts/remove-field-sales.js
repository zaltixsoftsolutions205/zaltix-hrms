/**
 * One-time clean-up after removing the Field Sales module.
 *
 *   node scripts/remove-field-sales.js                 -> dry run, only prints what would change
 *   node scripts/remove-field-sales.js --apply         -> updates users and knowledge-center topics
 *   node scripts/remove-field-sales.js --apply --drop-leads
 *                                                      -> also backs up the old field leads to JSON, then drops them
 *
 * What it does:
 *   1. Users whose module access contains 'field_sales' get 'expense_claims' instead
 *      (same view/edit permission), so they keep Expense Claims.
 *   2. Users with role 'field_sales' are moved to NEW_ROLE. If they were on role
 *      defaults, they get explicit access matching what they had before:
 *      CRM (edit) + Expense Claims (edit).
 *   3. 'field_sales' is removed from Knowledge Center topic roles.
 *   4. (--drop-leads) The 'fieldleads' collection is saved to scripts/backups/ and dropped.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dns = require('dns');
if (process.env.NODE_ENV !== 'production') dns.setServers(['8.8.8.8', '8.8.4.4']);

const NEW_ROLE = 'sales'; // change this if field-sales users should get a different role

const APPLY = process.argv.includes('--apply');
const DROP_LEADS = process.argv.includes('--drop-leads');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const topics = db.collection('kttopics');

  console.log(APPLY ? '== APPLYING CHANGES ==' : '== DRY RUN (add --apply to save) ==');

  // 1. Swap field_sales -> expense_claims inside explicit module access.
  const withGrant = await users.find({ 'moduleAccess.module': 'field_sales' }).toArray();
  console.log(`Users with 'field_sales' in module access: ${withGrant.length}`);
  for (const u of withGrant) {
    const old = u.moduleAccess.find(a => a.module === 'field_sales');
    const rest = u.moduleAccess.filter(a => a.module !== 'field_sales' && a.module !== 'expense_claims');
    const existing = u.moduleAccess.find(a => a.module === 'expense_claims');
    const permission = existing?.permission === 'edit' || old.permission === 'edit' ? 'edit' : 'view';
    const next = [...rest, { module: 'expense_claims', permission }];
    console.log(`  - ${u.name} (${u.employeeId || u.email}): field_sales/${old.permission} -> expense_claims/${permission}`);
    if (APPLY) await users.updateOne({ _id: u._id }, { $set: { moduleAccess: next } });
  }

  // 2. Move users off the field_sales role.
  const byRole = await users.find({ role: 'field_sales' }).toArray();
  console.log(`Users with role 'field_sales': ${byRole.length} (will become '${NEW_ROLE}')`);
  for (const u of byRole) {
    const set = { role: NEW_ROLE };
    // Re-read access in case step 1 just changed it.
    const fresh = APPLY ? await users.findOne({ _id: u._id }) : u;
    const hasExplicit = Array.isArray(fresh.moduleAccess) && fresh.moduleAccess.length > 0;
    if (!hasExplicit) {
      set.moduleAccess = [
        { module: 'crm', permission: 'edit' },
        { module: 'expense_claims', permission: 'edit' },
      ];
    }
    console.log(`  - ${u.name} (${u.employeeId || u.email})${hasExplicit ? '' : ' + access: crm/edit, expense_claims/edit'}`);
    if (APPLY) await users.updateOne({ _id: u._id }, { $set: set });
  }

  // 3. Knowledge Center topics.
  const topicCount = await topics.countDocuments({ assignedRoles: 'field_sales' });
  console.log(`Knowledge Center topics assigned to 'field_sales': ${topicCount}`);
  if (APPLY && topicCount) await topics.updateMany({ assignedRoles: 'field_sales' }, { $pull: { assignedRoles: 'field_sales' } });

  // 4. Old field leads.
  const hasLeads = (await db.listCollections({ name: 'fieldleads' }).toArray()).length > 0;
  const leadCount = hasLeads ? await db.collection('fieldleads').countDocuments() : 0;
  console.log(`Old field leads: ${leadCount}${DROP_LEADS ? '' : ' (kept; add --drop-leads to back up and drop)'}`);
  if (APPLY && DROP_LEADS && hasLeads) {
    const dir = path.join(__dirname, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `fieldleads-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(await db.collection('fieldleads').find().toArray(), null, 2));
    console.log(`  Backed up to ${file}`);
    await db.collection('fieldleads').drop();
    console.log('  Dropped fieldleads collection');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
