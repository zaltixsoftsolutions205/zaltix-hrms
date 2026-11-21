/**
 * Re-runnable clean-up: users whose `department` points to a department that
 * no longer exists (or is soft-deleted) are set to "no department".
 *
 *   node scripts/clearOrphanDepartmentRefs.js          # dry run: list only
 *   node scripts/clearOrphanDepartmentRefs.js --apply  # make the change
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  const apply = process.argv.includes('--apply');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection;
    const live = (await db.collection('departments').find({ isDeleted: { $ne: true } }).project({ _id: 1 }).toArray()).map((d) => d._id);
    const filter = { department: { $ne: null, $nin: live } };
    const orphans = await db.collection('users').find(filter).project({ name: 1, employeeId: 1, department: 1 }).toArray();

    console.log(`${orphans.length} user(s) point to a missing department:`);
    orphans.forEach((u) => console.log(`  ${u.employeeId} ${u.name} -> ${u.department}`));

    if (!apply) {
      console.log('\nDry run. Re-run with --apply to set their department to none.');
    } else if (orphans.length) {
      const r = await db.collection('users').updateMany(filter, { $set: { department: null } });
      console.log(`\nUnassigned ${r.modifiedCount} user(s).`);
    }
  } catch (err) {
    console.error('Clean-up failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
