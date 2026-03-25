require('dotenv').config();
const mongoose = require('mongoose');
const ExpenseCategory = require('./models/ExpenseCategory');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms_crm');
    console.log('✓ MongoDB Connected');
  } catch (err) {
    console.error('✗ MongoDB Connection Error:', err.message);
    process.exit(1);
  }
};

const seedCategories = async () => {
  try {
    const categories = [
      { name: 'salary', label: 'Salary', description: 'Employee salaries', color: '#EF4444' },
      { name: 'commission', label: 'Commission', description: 'Sales commissions', color: '#F97316' },
      { name: 'rent', label: 'Rent', description: 'Office rent', color: '#3B82F6' },
      { name: 'software', label: 'Software', description: 'Software subscriptions and licenses', color: '#8B5CF6' },
      { name: 'marketing', label: 'Marketing', description: 'Marketing and advertising', color: '#10B981' },
      { name: 'operational', label: 'Operational', description: 'Operational costs', color: '#6B7280' },
      { name: 'custom', label: 'Custom', description: 'Custom expense category', color: '#9CA3AF' },
    ];

    for (const category of categories) {
      const exists = await ExpenseCategory.findOne({ name: category.name });
      if (!exists) {
        await ExpenseCategory.create(category);
        console.log(`✓ Created category: ${category.label}`);
      } else {
        console.log(`- Category already exists: ${category.label}`);
      }
    }

    console.log('\n✓ Expense categories seeded successfully!');
  } catch (err) {
    console.error('✗ Seeding error:', err.message);
  }
};

const run = async () => {
  await connectDB();
  await seedCategories();
  process.exit(0);
};

run();
