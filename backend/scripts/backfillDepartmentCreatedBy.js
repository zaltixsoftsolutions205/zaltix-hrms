/**
 * One-off, re-runnable: give every Department without `createdBy` (rows from
 * the old Excel import) the first active admin, so `department.save()` no
 * longer fails validation on them. Includes soft-deleted departments.
 *
 *   node scripts/backfillDepartmentCreatedBy.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection;
    const admin = await db.collection('users').findOne(
      { role: 'admin', isActive: { $ne: false } },
      { sort: { createdAt: 1 }, projection: { _id: 1, name: 1 } }
    );
    if (!admin) throw new Error('No active admin user found to use as createdBy.');

    const result = await db.collection('departments').updateMany(
      { $or: [{ createdBy: { $exists: false } }, { createdBy: null }] },
      { $set: { createdBy: admin._id } }
    );
    console.log(`createdBy set to ${admin.name || admin._id} on ${result.modifiedCount} department(s).`);
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
