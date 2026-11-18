const mongoose = require("mongoose");

const globalTableSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },

        entity: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },

        // Optional scope keeps existing non-product Global Tables unchanged.
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            default: null,
        },

        location: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ProductLocation",
            default: null,
        },

        writeVersion: {
            type: Number,
            default: 0,
            min: 0,
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

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

globalTableSchema.index({ entity: 1, isActive: 1 });
globalTableSchema.index({ product: 1, location: 1, isActive: 1 });
globalTableSchema.index(
    { product: 1, location: 1, name: 1 },
    {
        unique: true,
        partialFilterExpression: {
            product: { $type: "objectId" },
            location: { $type: "objectId" },
        },
    }
);

module.exports = mongoose.model("GlobalTable", globalTableSchema);