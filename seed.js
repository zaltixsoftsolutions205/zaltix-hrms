/**
 * Seed Script — Creates the first Admin account + default Leave Policy
 * Run once: node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
if (process.env.NODE_ENV !== 'production') {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
}
const User = require('./models/User');
const LeavePolicy = require('./models/LeavePolicy');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Admin account
  const existing = await User.findOne({ email: 'admin@hrms.com' });
  if (!existing) {
    await User.create({
      employeeId: 'ADMIN001',
      name: 'System Administrator',
      email: 'admin@hrms.com',
      password: 'Admin@123',
      role: 'admin',
      isFirstLogin: false,
    });
    console.log('✅ Admin created: admin@hrms.com / Admin@123');
  } else {
    console.log('ℹ️  Admin already exists');
  }

  // Default leave policy for current year
  const year = new Date().getFullYear();
  const existing2 = await LeavePolicy.findOne({ year, appliesTo: 'all' });
  if (!existing2) {
    await LeavePolicy.create({ name: 'Default Policy', year, casualLeaves: 12, sickLeaves: 10, otherLeaves: 5 });
    console.log(`✅ Default leave policy created for ${year}`);
  } else {
    console.log(`ℹ️  Leave policy for ${year} already exists`);
  }

  await mongoose.disconnect();
  console.log('\nSeeding complete! You can now login with:');
  console.log('  Email:    admin@hrms.com');
  console.log('  Password: Admin@123\n');
  process.exit(0);
};

seed().catch(err => { console.error('Seed error:', err); process.exit(1); });
