const mongoose = require("mongoose");

// Project-module sub-features a department role can be granted by default.
const PROJECT_ACCESS_KEYS = ["moduleTree", "tasks", "bugs", "timeline"];
const PROJECT_ACCESS_LEVELS = ["none", "view", "edit"];

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

    // ===================================================================
    // Role tree: which login roles (User.role) this department uses and how
    // they nest. admin -> manager are fixed roots and are NOT stored here;
    // a node whose parentRole is null hangs under the manager.
    // Only employees whose role is in this tree can join the department
    // (an empty tree means "not configured yet" -> any role allowed).
    // projectAccess = the role's default permissions for the Project module
    // inside this department's projects (enforced from the Project phase on).
    // ===================================================================
    roleTree: [
      {
        _id: false,
        role: { type: String, required: true, trim: true, lowercase: true },
        parentRole: { type: String, default: null, trim: true, lowercase: true },
        order: { type: Number, default: 0 },
        projectAccess: {
          moduleTree: { type: String, enum: PROJECT_ACCESS_LEVELS, default: "view" },
          tasks: { type: String, enum: PROJECT_ACCESS_LEVELS, default: "view" },
          bugs: { type: String, enum: PROJECT_ACCESS_LEVELS, default: "view" },
          timeline: { type: String, enum: PROJECT_ACCESS_LEVELS, default: "view" },
        },
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Soft delete: deleted departments stay in the database but are hidden
    // from every query (see the pre-find hook below).
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

/*
 * Hide soft-deleted departments from find / findOne / count / exists unless a
 * query opts in with `.setOptions({ withDeleted: true })` or filters on
 * isDeleted itself.
 */
function excludeDeleted() {
  if (this.getOptions().withDeleted) return;
  const filter = this.getFilter();
  if (Object.prototype.hasOwnProperty.call(filter, "isDeleted")) return;
  this.where({ isDeleted: { $ne: true } });
}
departmentSchema.pre(
  ["find", "findOne", "findOneAndUpdate", "countDocuments", "updateMany", "updateOne"],
  excludeDeleted
);

departmentSchema.statics.PROJECT_ACCESS_KEYS = PROJECT_ACCESS_KEYS;
departmentSchema.statics.PROJECT_ACCESS_LEVELS = PROJECT_ACCESS_LEVELS;



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