const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    code: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    headOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    parentDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    icon: {
      type: String,
      default: "",
    },

    budget: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // ===================================================================
    // NEW: additional leadership positions within the department.
    // headOf (above) remains the single Department Head — unchanged.
    // leadPositions are extra roles like "Technical Lead", "QA Lead", etc.
    // ===================================================================
    leadPositions: [
      {
        title: {
          type: String,
          required: true,
          trim: true,
        },

        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },

        description: {
          type: String,
          default: "",
          trim: true,
        },

        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);



departmentSchema.pre("save", async function (next) {
  if (!this.isNew || this.code) {
    return next();
  }

  try {
    // Generate first 3 letters
    const prefix = this.name
      .replace(/[^a-zA-Z]/g, "")
      .toUpperCase()
      .substring(0, 3)
      .padEnd(3, "X");

    // Find last department with same prefix
    const lastDepartment = await this.constructor
      .findOne({
        code: new RegExp(`^${prefix}[0-9]{3}$`)
      })
      .sort({ createdAt: -1 });

    let number = 1;

    if (lastDepartment) {
      number =
        parseInt(lastDepartment.code.substring(3), 10) + 1;
    }

    this.code = `${prefix}${String(number).padStart(3, "0")}`;

    next();
  } catch (err) {
    next(err);
  }
});
departmentSchema.index({ headOf: 1 });
module.exports = mongoose.model("Department", departmentSchema);