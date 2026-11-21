/**
 * Re-creates placeholder departments for department ids that projects or
 * users still point to but that no longer exist. Each placeholder keeps the
 * SAME _id, so every reference works again; rename them (or delete them with
 * the delete dialog) afterwards.
 *
 *   node scripts/restoreReferencedDepartments.js          # dry run: list only
 *   node scripts/restoreReferencedDepartments.js --apply  # create placeholders
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  const apply = process.argv.includes('--apply');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection;

    const existing = new Set((await db.collection('departments').find({}).project({ _id: 1 }).toArray()).map((d) => String(d._id)));
    const refs = new Map(); // id -> where it is referenced
    const note = (id, where) => {
      if (!id || existing.has(String(id))) return;
      const key = String(id);
      if (!refs.has(key)) refs.set(key, new Set());
      refs.get(key).add(where);
    };
    (await db.collection('projects').find({}).project({ name: 1, department: 1, departments: 1 }).toArray()).forEach((p) => {
      note(p.department, `project "${p.name}" (owner)`);
      (p.departments || []).forEach((d) => note(d, `project "${p.name}"`));
    });
    (await db.collection('users').find({ department: { $ne: null } }).project({ name: 1, department: 1 }).toArray())
      .forEach((u) => note(u.department, `user ${u.name}`));

    if (!refs.size) {
      console.log('Nothing to restore: every referenced department exists.');
      return;
    }
    console.log(`${refs.size} missing department id(s) are still referenced:`);
    [...refs.entries()].forEach(([id, where], i) => console.log(`  ${i + 1}. ${id}  <- ${[...where].join(', ')}`));

    if (!apply) {
      console.log('\nDry run. Re-run with --apply to create placeholder departments with these ids.');
      return;
    }
    const admin = await db.collection('users').findOne({ role: 'admin', isActive: { $ne: false } }, { sort: { createdAt: 1 }, projection: { _id: 1 } });
    if (!admin) throw new Error('No active admin user found to use as createdBy.');
    const stamp = Date.now().toString(36).toUpperCase();
    const now = new Date();
    const docs = [...refs.keys()].map((id, i) => ({
      _id: new mongoose.Types.ObjectId(id),
      name: `Recovered department ${i + 1}`,
      code: `REC${stamp}${i + 1}`,
      description: 'Placeholder re-created for existing references. Rename or delete it.',
      status: 'active',
      headOf: null,
      parentDepartment: null,
      roleTree: [],
      leadPositions: [],
      isDeleted: false,
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    }));
    const result = await db.collection('departments').insertMany(docs, { ordered: false });
    console.log(`\nCreated ${result.insertedCount} placeholder department(s).`);
  } catch (err) {
    console.error('Restore failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
