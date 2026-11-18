const mongoose = require("mongoose");
const workflowStageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project",
            required: true,
        },

        description: {
            type: String,
            trim: true,
            default: "",
        },

        color: {
            type: String,
            default: "#6366f1",
        },

        icon: {
            type: String,
            default: "Circle",
        },

        order: {
            type: Number,
            required: true,
            default: 0,
        },

        isSystem: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        isCompleted: {
            type: Boolean,
            default: false,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);

workflowStageSchema.index({
    project: 1,
    order: 1,
});

workflowStageSchema.index({
    project: 1,
    isActive: 1,
});