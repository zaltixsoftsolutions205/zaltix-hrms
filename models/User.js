const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['employee', 'sales', 'field_sales', 'hr', 'admin'], default: 'employee' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    designation: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    joiningDate: { type: Date, default: null },
    basicSalary: { type: Number, default: 0 },
    allowances: [{ name: String, amount: Number }],
    deductions: [{ name: String, amount: Number }],
    isFirstLogin: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    profilePicture: { type: String, default: '' },
    employeeType: { type: String, enum: ['fresher', 'experienced'], default: null },
    commissionRate: { type: Number, default: 0 },
    salesTarget: { type: Number, default: 0 },
    emergencyContact: { name: String, phone: String, relation: String },
    joiningLetter: { type: String, default: '' },
    idCard: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    uanNumber: { type: String, default: '' },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    pushTokens: [{ type: String }],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
