const mongoose = require('mongoose');

/**
 * A saved analytics widget (one chart / KPI / table). `config` is always the
 * output of services/analytics/validate.js validateConfig, and is validated again
 * every time the widget runs. A widget can be placed on several dashboards.
 * Only its creator sees it.
 */
const analyticsWidgetSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    source: { type: String, required: true },
    chartType: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }
);

analyticsWidgetSchema.index({ createdBy: 1, updatedAt: -1 });

module.exports = mongoose.model('AnalyticsWidget', analyticsWidgetSchema);
