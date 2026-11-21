/**
 * One-off, re-runnable: give every Project a `departments` array that holds
 * its owning `department`. Projects that already have it are left alone.
 *
 *   node scripts/migrateProjectDepartments.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const projects = mongoose.connection.collection('projects');

    // Missing / empty array -> [department]
    const filled = await projects.updateMany(
      { department: { $ne: null }, $or: [{ departments: { $exists: false } }, { departments: { $size: 0 } }] },
      [{ $set: { departments: ['$department'] } }]
    );

    // Array present but missing the owning department -> prepend it
    const fixed = await projects.updateMany(
      { department: { $ne: null }, departments: { $exists: true, $not: { $size: 0 } }, $expr: { $not: { $in: ['$department', '$departments'] } } },
      [{ $set: { departments: { $concatArrays: [['$department'], '$departments'] } } }]
    );

    console.log(`departments filled on ${filled.modifiedCount} project(s), owning department added on ${fixed.modifiedCount}.`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
