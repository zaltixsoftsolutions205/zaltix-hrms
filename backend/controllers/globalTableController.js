const service = require('../services/globalTableService');

const sendError = (res, err) => {
  const { status, body } = service.toHttpError(err);
  return res.status(status).json(body);
};

/* ------------------------------- tables ---------------------------------- */

exports.createTable = async (req, res) => {
  try {
    const table = await service.createTable(req.validated, req.user);
    return res.status(201).json(table);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getTables = async (req, res) => {
  try {
    const { items, pagination } = await service.getTables(req.validatedQuery, req.user);
    return res.json({ tables: items, pagination });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getTableById = async (req, res) => {
  try {
    const table = await service.getTableById(req.params.id, req.user);
    return res.json(table);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateTable = async (req, res) => {
  try {
    const table = await service.updateTable(req.params.id, req.validated, req.user);
    return res.json(table);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateProductLocationTable = async (req, res) => {
  try {
    const table = await service.getTableById(req.params.tableId, req.user);
    if (String(table.product || '') !== req.params.productId || String(table.location || '') !== req.params.locationId) {
      return res.status(404).json({ message: 'Table not found in this product location' });
    }
    const updated = await service.updateTable(req.params.tableId, req.validated, req.user);
    return res.json(updated);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deactivateProductLocationTable = async (req, res) => {
  try {
    const table = await service.getTableById(req.params.tableId, req.user);
    if (String(table.product || '') !== req.params.productId || String(table.location || '') !== req.params.locationId) {
      return res.status(404).json({ message: 'Table not found in this product location' });
    }
    const updated = await service.updateTable(req.params.tableId, { isActive: false }, req.user);
    return res.json(updated);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deleteTable = async (req, res) => {
  try {
    const result = await service.deleteTable(req.params.id, req.validatedQuery, req.user);
    return res.json({ message: 'Table deleted', ...result });
  } catch (err) {
    return sendError(res, err);
  }
};

/* ------------------------------- records --------------------------------- */
// Native entity rows (e.g. real Leads) + their custom values, via the entity adapter.

exports.listRecords = async (req, res) => {
  try {
    const { records, pagination } = await service.listRecords(req.params.id, req.validatedQuery, req.user);
    return res.json({ records, pagination });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getRecordById = async (req, res) => {
  try {
    const result = await service.getRecordById(req.params.id, req.params.recordId, req.user);
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.createRecord = async (req, res) => {
  try {
    const result = await service.createRecord(req.params.id, req.validated, req.user);
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateRecord = async (req, res) => {
  try {
    const result = await service.updateRecord(req.params.id, req.params.recordId, req.validated, req.user);
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deleteRecord = async (req, res) => {
  try {
    const result = await service.deleteRecord(req.params.id, req.params.recordId, req.user);
    return res.json({ message: 'Record deleted', ...result });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.createProductLocationTable = async (req, res) => {
  try {
    const table = await service.createTable({
      ...req.validated,
      product: req.params.productId,
      location: req.params.locationId,
      entity: 'lead',
    }, req.user);
    return res.status(201).json(table);
  } catch (err) {
    return sendError(res, err);
  }
};
/* --------------------- Excel template / import / export ------------------- */
// Mandal (product/location) tables only; see services/globalTableImportService.js.

const importService = require('../services/globalTableImportService');

exports.getImportSpec = async (req, res) => {
  try {
    return res.json(await importService.getImportSpec(req.params.id, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

exports.exportRecords = async (req, res) => {
  try {
    return res.json(await importService.exportRecords(req.params.id, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

exports.importRecords = async (req, res) => {
  try {
    return res.json(await importService.importRecords(req.params.id, req.body, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

/* ------------------- row multi-delete + table lifecycle ------------------ */

exports.deleteRecords = async (req, res) => {
  try {
    return res.json(await service.deleteRecords(req.params.id, req.body?.recordIds, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

// Product-tree routes (admin / hr / manager): the table must sit at the URL's product + location.
const loadRoutedTable = async (req) => {
  const table = await service.getTableById(req.params.tableId, req.user);
  if (String(table.product || '') !== req.params.productId || String(table.location || '') !== req.params.locationId) {
    throw new service.ServiceError(404, 'Table not found in this product location');
  }
  return table;
};

exports.reactivateProductLocationTable = async (req, res) => {
  try {
    await loadRoutedTable(req);
    return res.json(await service.reactivateTable(req.params.tableId, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deleteProductLocationTablePermanently = async (req, res) => {
  try {
    await loadRoutedTable(req);
    return res.json({ message: 'Table deleted', ...(await service.deleteTablePermanently(req.params.tableId, req.user)) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.previewProductLocationTableMove = async (req, res) => {
  try {
    await loadRoutedTable(req);
    return res.json(await service.previewTableMove(req.params.tableId, req.query.target, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

exports.moveProductLocationTable = async (req, res) => {
  try {
    await loadRoutedTable(req);
    const { targetLocationId, reassignTo } = req.body || {};
    return res.json(await service.moveTable(req.params.tableId, { targetLocationId, reassignTo }, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};
