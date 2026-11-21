const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    taskCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    taskType: {
      type: String,
      enum: ["project", "self"],
      default: "project",
      required: true,
    },
    customFieldValues: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    description: { type: String, default: "", trim: true, },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    category: {
      type: String,
      default: "",
      trim: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignees: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        // status: {
        //   type: String,
        //   enum: [
        //     "not-started",
        //     "in-progress",
        //     "review",
        //     "completed",
        //     "cancelled",
        //   ],
        //   default: "not-started",
        // },

        // progress: {
        //   type: Number,
        //   min: 0,
        //   max: 100,
        //   default: 0,
        // },

        // actualHours: {
        //   type: Number,
        //   min: 0,
        //   default: 0,
        // },
      },
    ],
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: [
        "not-started",
        "in-progress",
        "review",
        "completed",
        "cancelled",
      ],
      default: "not-started",
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    deadline: {
      type: Date,
      default: null,
    },
    completedDate: {
      type: Date,
      default: null,
    },
    estimatedHours: {
      type: Number,
      default: 0,
      min: 0,
    },

    actualHours: {
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

    remarks: {
      type: String,
      default: "",
    },

    proofFiles: [
      {
        type: String,
      },
    ],

    attachments: {
      type: [
        {
          type: String,
        },
      ],
      validate: {
        validator: function (files) {
          return files.length <= 4;
        },
        message: 'A task can have a maximum of 4 attachments.',
      },
      default: [],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /* =====================================================
       PROJECT MODULE WORK (Phase 3)
       kind      task | bug | milestone
       module    module card on the project's Module Tree
       plan      plan that groups tasks (progress bar)
       stage     bug pipeline stage (WorkflowStage scope 'bug')
       reporter  who reported a bug
       isPrivate visible only to reporter, assignees, project
                 lead, department heads and admin
    ===================================================== */
    kind: {
      type: String,
      enum: ["task", "bug", "milestone"],
      default: "task",
    },
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectModule",
      default: null,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      default: null,
    },
    stage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowStage",
      default: null,
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    boardOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ project: 1, kind: 1 });
taskSchema.index({ module: 1 });
taskSchema.index({ plan: 1 });
taskSchema.index({ stage: 1, boardOrder: 1 });





taskSchema.pre("validate", async function (next) {
  try {
    // Don't regenerate an existing task code
    if (this.taskCode) {
      return next();
    }

    const lastTask = await this.constructor
      .findOne({
        taskCode: /^TASK-\d+$/,
      })
      .sort({ createdAt: -1 })
      .select("taskCode");

    let nextNumber = 1;

    if (lastTask?.taskCode) {
      const match = lastTask.taskCode.match(/TASK-(\d+)$/);

      if (match) {
        nextNumber = Number(match[1]) + 1;
      }
    }

    this.taskCode = `TASK-${String(nextNumber).padStart(4, "0")}`;

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Task", taskSchema);