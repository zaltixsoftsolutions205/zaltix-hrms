/**
 * Global Analytics: catalog, preview, saved widgets and dashboards.
 * Every route is for admin / HR / managers with the 'analytics' module
 * (routes/analytics.js). Widgets and dashboards are private to their creator.
 */

const AnalyticsWidget = require('../models/AnalyticsWidget');
const AnalyticsDashboard = require('../models/AnalyticsDashboard');
const {
  BUCKETS, CALCS, CHARTS, MODULES, REFS, STAGE_OPTIONS, getSource, modelOf,
} = require('../services/analytics/registry');
const { PRESETS } = require('../services/analytics/periods');
const {
  AnalyticsError, OPS_BY_TYPE, isId, validateConfig, validateDashboardFilters,
} = require('../services/analytics/validate');
const {
  allowedSources, canUseField, canUseSource, ownerScope,
} = require('../services/analytics/scope');
const engine = require('../services/analytics/engine');

const MAX_ITEMS = 50;

function send(res, err) {
  if (err instanceof AnalyticsError) return res.status(err.status).json({ message: err.message, ...(err.details || {}) });
  if (err?.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors)[0]?.message || 'Invalid data' });
  console.error('analytics error:', err);
  return res.status(500).json({ message: 'Analytics request failed' });
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const notFound = (what) => new AnalyticsError(404, `${what} not found`);

/** A configuration this user may run: valid, and on a model they can open. */
function checkConfig(user, raw) {
  const config = validateConfig(raw);
  const source = getSource(config.source);
  if (!canUseSource(user, source)) throw new AnalyticsError(403, 'You do not have access to this data');
  const hidden = [...engine.usedFields(config)].find((k) => !canUseField(user, source.fields[k]));
  if (hidden) throw new AnalyticsError(403, `You do not have access to ${source.fields[hidden].label}`);
  return config;
}

const pageOf = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
};

async function runFor(user, config, { filters, page }) {
  return engine.run(config, {
    owners: await ownerScope(user),
    dashboardFilters: validateDashboardFilters(filters),
    page: pageOf(page),
  });
}

/* --------------------------------- catalog --------------------------------- */

/* GET /analytics/catalog -> what the builder may offer this user */
exports.getCatalog = async (req, res) => {
  try {
    const sources = allowedSources(req.user).map((s) => ({
      key: s.key,
      label: s.label,
      module: s.module,
      defaultDate: s.defaultDate,
      funnels: s.funnels || [],
      dimensions: Object.keys(s.dimensions || {}).concat('department'),
      fields: Object.entries(s.fields).filter(([, f]) => canUseField(req.user, f)).map(([key, f]) => ({
        key,
        label: f.label,
        type: f.type,
        ...(f.options ? { options: f.options } : {}),
        ...(f.ref ? { ref: f.ref } : {}),
        group: Boolean(f.group) || f.type === 'date',
        column: Boolean(f.column),
        utcDay: Boolean(f.utcDay),
        format: f.format || null,
        related: Boolean(f.via),
        ops: OPS_BY_TYPE[f.type] || [],
      })),
    }));
    const modules = Object.values(MODULES)
      .map((m) => ({ key: m.key, label: m.label, sources: sources.filter((s) => s.module === m.key) }))
      .filter((m) => m.sources.length);
    const owners = await ownerScope(req.user);
    return res.json({
      modules,
      calcs: Object.entries(CALCS).map(([key, c]) => ({ key, label: c.label, fieldTypes: c.fieldTypes, needsWhere: Boolean(c.needsWhere) })),
      charts: Object.entries(CHARTS).map(([key, c]) => ({ key, ...c })),
      buckets: Object.entries(BUCKETS).map(([key, label]) => ({ key, label })),
      datePresets: Object.entries(PRESETS).map(([key, label]) => ({ key, label })),
      scope: owners === null ? 'all' : 'department',
      stages: STAGE_OPTIONS,
    });
  } catch (err) {
    return send(res, err);
  }
};

/* ------------------------------ value options ------------------------------ */

const OPTION_LIMIT = 50;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /analytics/options/:ref?q=text&ids=a,b -> [{ value, label }]
 * Choices for filter values (employees, products, Mandals, departments, leads).
 * `ids` returns the labels of already chosen values. Managers only get the
 * employees (and their leads) of their own department, and only that department.
 */
exports.getOptions = async (req, res) => {
  try {
    const ref = Object.prototype.hasOwnProperty.call(REFS, req.params.ref) ? REFS[req.params.ref] : null;
    if (!ref) throw notFound('List');
    const q = text(req.query.q, 60);
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').filter(isId).slice(0, OPTION_LIMIT) : [];
    const owners = await ownerScope(req.user);

    const query = {};
    if (ids.length) query._id = { $in: ids };
    else if (q) query.name = { $regex: escapeRegex(q), $options: 'i' };
    if (req.params.ref === 'user') {
      if (!ids.length) query.isActive = { $ne: false };
      if (owners) query._id = { $in: ids.length ? ids.filter((id) => owners.includes(id)) : owners };
    }
    if (req.params.ref === 'lead' && owners) query.assignedTo = { $in: owners };
    if (req.params.ref === 'department' && owners) {
      const own = req.user.department?._id || req.user.department;
      query._id = own ? { $in: [String(own)].filter((id) => !ids.length || ids.includes(id)) } : { $in: [] };
    }

    const docs = await modelOf(ref.model).find(query).select(ref.select).sort({ name: 1 }).limit(OPTION_LIMIT).lean();
    return res.json({ options: docs.map((d) => ({ value: String(d._id), label: ref.label(d) })) });
  } catch (err) {
    return send(res, err);
  }
};

/* POST /analytics/preview { config, filters, page } -> data of an unsaved widget */
exports.preview = async (req, res) => {
  try {
    const config = checkConfig(req.user, req.body?.config);
    return res.json(await runFor(req.user, config, req.body || {}));
  } catch (err) {
    return send(res, err);
  }
};

/* --------------------------------- widgets --------------------------------- */

const widgetView = (w) => ({
  _id: w._id, title: w.title, description: w.description, source: w.source, chartType: w.chartType, config: w.config, createdAt: w.createdAt, updatedAt: w.updatedAt,
});

async function ownWidget(user, id) {
  if (!isId(id)) throw notFound('Widget');
  const widget = await AnalyticsWidget.findOne({ _id: id, createdBy: user._id });
  if (!widget) throw notFound('Widget');
  return widget;
}

function widgetFields(user, body) {
  const title = text(body?.title, 120);
  if (!title) throw new AnalyticsError(400, 'Enter a title', { path: 'title' });
  const config = checkConfig(user, body?.config);
  return {
    title, description: text(body?.description, 500), source: config.source, chartType: config.chartType, config,
  };
}

exports.listWidgets = async (req, res) => {
  try {
    const widgets = await AnalyticsWidget.find({ createdBy: req.user._id }).sort({ updatedAt: -1 }).limit(500).lean();
    return res.json({ widgets: widgets.map(widgetView) });
  } catch (err) {
    return send(res, err);
  }
};

exports.getWidget = async (req, res) => {
  try {
    return res.json(widgetView(await ownWidget(req.user, req.params.id)));
  } catch (err) {
    return send(res, err);
  }
};

exports.createWidget = async (req, res) => {
  try {
    const widget = await AnalyticsWidget.create({ ...widgetFields(req.user, req.body), createdBy: req.user._id, updatedBy: req.user._id });
    return res.status(201).json(widgetView(widget));
  } catch (err) {
    return send(res, err);
  }
};

exports.updateWidget = async (req, res) => {
  try {
    const widget = await ownWidget(req.user, req.params.id);
    Object.assign(widget, widgetFields(req.user, req.body), { updatedBy: req.user._id });
    widget.markModified('config');
    await widget.save();
    return res.json(widgetView(widget));
  } catch (err) {
    return send(res, err);
  }
};

/* DELETE /analytics/widgets/:id -> also removed from the creator's dashboards */
exports.deleteWidget = async (req, res) => {
  try {
    const widget = await ownWidget(req.user, req.params.id);
    await AnalyticsDashboard.updateMany({ createdBy: req.user._id, 'items.widget': widget._id }, { $pull: { items: { widget: widget._id } } });
    await widget.deleteOne();
    return res.json({ deleted: true });
  } catch (err) {
    return send(res, err);
  }
};

/* POST /analytics/widgets/:id/run { filters, page } -> chart data */
exports.runWidget = async (req, res) => {
  try {
    const widget = await ownWidget(req.user, req.params.id);
    let config;
    try {
      config = checkConfig(req.user, widget.config);
    } catch (err) {
      // Saved settings that are no longer valid (a field was removed, access changed).
      if (err instanceof AnalyticsError && err.status === 400) {
        return res.status(422).json({ message: `This widget needs to be edited: ${err.message}`, invalid: true });
      }
      throw err;
    }
    return res.json(await runFor(req.user, config, req.body || {}));
  } catch (err) {
    return send(res, err);
  }
};

/* -------------------------------- dashboards -------------------------------- */

async function ownDashboard(user, id) {
  if (!isId(id)) throw notFound('Dashboard');
  const dashboard = await AnalyticsDashboard.findOne({ _id: id, createdBy: user._id });
  if (!dashboard) throw notFound('Dashboard');
  return dashboard;
}

const int = (v, min, max, path) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new AnalyticsError(400, 'Invalid widget position or size', { path });
  return v;
};

/** items [{ widget, layout: { x, y, w, h } }] -> checked list (own widgets only). */
async function validateItems(user, items) {
  if (items === undefined) return undefined;
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new AnalyticsError(400, `A dashboard holds up to ${MAX_ITEMS} widgets`, { path: 'items' });
  const out = items.map((it, i) => {
    const at = `items[${i}]`;
    if (!it || !isId(String(it.widget))) throw new AnalyticsError(400, 'Choose a widget', { path: `${at}.widget` });
    const l = it.layout || {};
    const w = int(l.w, 1, 12, `${at}.layout.w`);
    const x = int(l.x, 0, 12 - w, `${at}.layout.x`);
    return {
      widget: String(it.widget), layout: { x, y: int(l.y, 0, 10000, `${at}.layout.y`), w, h: int(l.h, 1, 40, `${at}.layout.h`) },
    };
  });
  const ids = [...new Set(out.map((it) => it.widget))];
  const owned = await AnalyticsWidget.countDocuments({ _id: { $in: ids }, createdBy: user._id });
  if (owned !== ids.length) throw new AnalyticsError(400, 'One of the widgets does not exist', { path: 'items' });
  return out;
}

async function dashboardView(dashboard) {
  const ids = dashboard.items.map((it) => it.widget);
  const widgets = await AnalyticsWidget.find({ _id: { $in: ids } }).lean();
  const byId = new Map(widgets.map((w) => [String(w._id), widgetView(w)]));
  return {
    _id: dashboard._id,
    title: dashboard.title,
    description: dashboard.description,
    filters: dashboard.filters || {},
    items: dashboard.items
      .filter((it) => byId.has(String(it.widget)))
      .map((it) => ({ _id: it._id, widget: byId.get(String(it.widget)), layout: it.layout })),
    createdAt: dashboard.createdAt,
    updatedAt: dashboard.updatedAt,
  };
}

exports.listDashboards = async (req, res) => {
  try {
    const list = await AnalyticsDashboard.find({ createdBy: req.user._id }).select('title description items updatedAt createdAt').sort({ updatedAt: -1 }).lean();
    return res.json({
      dashboards: list.map((d) => ({
        _id: d._id, title: d.title, description: d.description, widgetCount: d.items.length, createdAt: d.createdAt, updatedAt: d.updatedAt,
      })),
    });
  } catch (err) {
    return send(res, err);
  }
};

exports.getDashboard = async (req, res) => {
  try {
    return res.json(await dashboardView(await ownDashboard(req.user, req.params.id)));
  } catch (err) {
    return send(res, err);
  }
};

exports.createDashboard = async (req, res) => {
  try {
    const title = text(req.body?.title, 120);
    if (!title) throw new AnalyticsError(400, 'Enter a title', { path: 'title' });
    const dashboard = await AnalyticsDashboard.create({
      title,
      description: text(req.body?.description, 500),
      items: (await validateItems(req.user, req.body?.items)) || [],
      filters: validateDashboardFilters(req.body?.filters),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    return res.status(201).json(await dashboardView(dashboard));
  } catch (err) {
    return send(res, err);
  }
};

/* PUT /analytics/dashboards/:id { title?, description?, items?, filters? } */
exports.updateDashboard = async (req, res) => {
  try {
    const dashboard = await ownDashboard(req.user, req.params.id);
    const body = req.body || {};
    if (body.title !== undefined) {
      const title = text(body.title, 120);
      if (!title) throw new AnalyticsError(400, 'Enter a title', { path: 'title' });
      dashboard.title = title;
    }
    if (body.description !== undefined) dashboard.description = text(body.description, 500);
    const items = await validateItems(req.user, body.items);
    if (items) dashboard.items = items;
    if (body.filters !== undefined) {
      dashboard.filters = validateDashboardFilters(body.filters);
      dashboard.markModified('filters');
    }
    dashboard.updatedBy = req.user._id;
    await dashboard.save();
    return res.json(await dashboardView(dashboard));
  } catch (err) {
    return send(res, err);
  }
};

/* DELETE /analytics/dashboards/:id (its widgets stay saved) */
exports.deleteDashboard = async (req, res) => {
  try {
    const dashboard = await ownDashboard(req.user, req.params.id);
    await dashboard.deleteOne();
    return res.json({ deleted: true });
  } catch (err) {
    return send(res, err);
  }
};

