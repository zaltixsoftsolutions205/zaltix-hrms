const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, default: 'employee' },
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
    employeeType: { type: String, default: null },
    commissionRate: { type: Number, default: 0 },
    salesTarget: { type: Number, default: 0 },
    emergencyContact: { name: String, phone: String, relation: String },
    joiningLetter: { type: String, default: '' },
    idCard: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    uanNumber: { type: String, default: '' },
    panNumber: { type: String, default: '' },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    pushTokens: [{ type: String }],
    // Per-employee module access. Empty array → fall back to role defaults
    // (see constants/modules.js). Each entry grants one module at a
    // permission level. Admin role bypasses this entirely.
    moduleAccess: {
      type: [
        {
          _id: false,
          module: { type: String, required: true },
          permission: { type: String, enum: ['view', 'edit'], default: 'view' },
        },
      ],
      default: [],
    },
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

// Hard-delete guard. Employees must never be removed from the database — they are
// retired via soft delete (isActive = false) so attendance/payslip/leave history and
// the audit trail survive. A production data-loss incident (an employee hard-deleted
// by stale code) prompted this defence-in-depth: block deletion at the model level so
// no controller, route, or future regression can wipe a User. Use User.hardDelete(id)
// only for a deliberate, irreversible purge.
function blockHardDelete(next) {
  next(new Error('Hard-deleting a User is disabled. Set isActive=false to deactivate instead.'));
}
userSchema.pre('deleteOne', { document: true, query: false }, blockHardDelete);
userSchema.pre('deleteOne', { document: false, query: true }, blockHardDelete);
userSchema.pre('deleteMany', { query: true }, blockHardDelete);
userSchema.pre('findOneAndDelete', blockHardDelete);
userSchema.pre('findOneAndRemove', blockHardDelete);
userSchema.pre('remove', { document: true, query: false }, blockHardDelete);

// Escape hatch for an intentional, irreversible purge (e.g. a GDPR erasure request).
// Bypasses the guard above; call deliberately and never from a generic delete route.
userSchema.statics.hardDelete = function (id) {
  return this.collection.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
