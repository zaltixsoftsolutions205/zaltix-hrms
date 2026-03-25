const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: Number, required: true }, // 1–12
    year: { type: Number, required: true },
    basicSalary: { type: Number, required: true },
    allowances: [{ name: String, amount: Number }],
    deductions: [{ name: String, amount: Number }],
    grossSalary: { type: Number, required: true },
    netSalary: { type: Number, required: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['generated', 'published'], default: 'published' },
    pdfPath: { type: String, default: '' },
    workingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    lwpDays: { type: Number, default: 0 },
  },
  { timestamps: true }
);

payslipSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Payslip', payslipSchema);
