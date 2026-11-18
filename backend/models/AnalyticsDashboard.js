const mongoose = require('mongoose');

/**
 * A dashboard: saved widgets placed on a 12-column grid, plus dashboard filters
 * (services/analytics/validate.js validateDashboardFilters). Only its creator sees it.
 *
 *   items[].layout  { x, y, w, h } in grid cells (react-grid-layout)
 */
const layoutSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0, max: 11 },
    y: { type: Number, required: true, min: 0, max: 10000 },
    w: { type: Number, required: true, min: 1, max: 12 },
    h: { type: Number, required: true, min: 1, max: 40 },
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema({
  widget: { type: mongoose.Schema.Types.ObjectId, ref: 'AnalyticsWidget', required: true },
  layout: { type: layoutSchema, required: true },
});

const analyticsDashboardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    items: { type: [itemSchema], default: [] },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }
);

analyticsDashboardSchema.index({ createdBy: 1, updatedAt: -1 });
analyticsDashboardSchema.index({ 'items.widget': 1 });

module.exports = mongoose.model('AnalyticsDashboard', analyticsDashboardSchema);
