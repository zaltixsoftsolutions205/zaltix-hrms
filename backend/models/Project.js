const mongoose = require("mongoose");

/* =========================================================
   CUSTOM FIELD OPTION
========================================================= */

const customFieldOptionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },

    value: {
      type: String,
      required: true,
      trim: true,
    },

    color: {
      type: String,
      default: "#6366f1",
      trim: true,
    },
  },
  { _id: false }
);

/* =========================================================
   CUSTOM FIELD DEFINITION
========================================================= */

const customFieldSchema = new mongoose.Schema(
  {
    /*
     * Permanent field identifier.
     *
     * Example:
     * story_points
     * sprint
     * priority_level
     */
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    /*
     * Display name.
     */
    name: {
      type: String,
      required: true,
      trim: true,
    },

    /*
     * Field type.
     */
    type: {
      type: String,
      required: true,

      enum: [
        /* =========================
           BASIC CUSTOM FIELDS
        ========================= */

        "single-select",
        "multi-select",
        "date",
        "people",
        "reference",
        "text",
        "number",

        /* =========================
           CALCULATED FIELDS
        ========================= */

        "formula",
        "rollup",

        /* =========================
           TIME FIELDS
        ========================= */

        "timer",
        "time-tracking",

        /* =========================
           RELATIONSHIP FIELDS
        ========================= */

        "projects",
        "tags",
        "blocked-by",
        "blocking",
        "collaborators",

        /* =========================
           SYSTEM / BUILT-IN TYPES
           
           These can be represented in
           the field configuration system,
           but their actual value should
           normally come from Task.
        ========================= */

        "id",
        "due-date",
        "assignee",
        "completed-on",
        "last-modified-on",
        "created-on",
        "created-by",
        "attachments",
      ],
    },
    /*
     * Used by:
     * single-select
     * multi-select
     * tags
     */
    options: {
      type: [customFieldOptionSchema],
      default: [],
    },
    /*
     * Field configuration.
     *
     * IMPORTANT:
     * Once field is created, these settings
     * should not be changed.
     */
    settings: {
      required: {
        type: Boolean,
        default: false,
      },

      placeholder: {
        type: String,
        default: "",
        trim: true,
      },

      min: {
        type: Number,
        default: null,
      },

      max: {
        type: Number,
        default: null,
      },

      /*
       * For reference fields.
       *
       * Example:
       * "Task"
       * "Project"
       * "Employee"
       */
      referenceType: {
        type: String,
        default: null,
        trim: true,
      },

      /*
       * Formula expression.
       *
       * Example:
       * estimatedHours - actualHours
       */
      formula: {
        type: String,
        default: null,
        trim: true,
      },

      /*
       * Rollup configuration.
       *
       * Example:
       * Sum child task hours.
       */
      rollup: {
        sourceField: {
          type: String,
          default: null,
          trim: true,
        },

        operation: {
          type: String,
          enum: [
            "sum",
            "average",
            "minimum",
            "maximum",
            "count",
          ],
          default: "sum",
        },
      },
    },

    /*
     * Who created the field.
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  }
);

/* =========================================================
   PROJECT SCHEMA
========================================================= */

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    projectCode: {
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

    client: {
      type: String,
      default: "",
      trim: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: [
        "planning",
        "in-progress",
        "on-hold",
        "completed",
        "cancelled",
      ],
      default: "planning",
    },
    budget: {
      type: Number,
      default: 0,
      min: 0,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    attachments: [
      {
        type: String,
      },
    ],

    /* =====================================================
       WORKSPACE CUSTOM FIELD DEFINITIONS
    ===================================================== */

    customFields: {
      type: [customFieldSchema],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   INDEXES
========================================================= */

projectSchema.index({ manager: 1 });

projectSchema.index({ department: 1 });

projectSchema.index({ "customFields.key": 1 });

/* =========================================================
   DUPLICATE CUSTOM FIELD KEY VALIDATION
========================================================= */

projectSchema.pre("validate", function (next) {
  try {
    if (!Array.isArray(this.customFields)) {
      return next();
    }

    const keys = this.customFields.map((field) =>
      String(field.key || "")
        .trim()
        .toLowerCase()
    );

    const uniqueKeys = new Set(keys);

    if (keys.length !== uniqueKeys.size) {
      return next(
        new Error(
          "Custom field keys must be unique within a project."
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   AUTO GENERATE PROJECT CODE
========================================================= */

projectSchema.pre("save", async function (next) {
  try {
    if (!this.isNew || this.projectCode) {
      return next();
    }

    const year = new Date().getFullYear();

    const lastProject = await mongoose.models.Project
      .findOne({
        projectCode: new RegExp(`^PRJ-${year}-`),
      })
      .sort({ projectCode: -1 });

    let sequence = 1;

    if (lastProject) {
      const parts = lastProject.projectCode.split("-");

      sequence = parseInt(parts[2], 10) + 1;
    }

    this.projectCode = `PRJ-${year}-${String(
      sequence
    ).padStart(4, "0")}`;

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Project", projectSchema);