const service = require('../services/globalTableService');

const sendError = (res, err) => {
  const { status, body } = service.toHttpError(err);
  return res.status(status).json(body);
};

exports.createValue = async (req, res) => {
  try {
    const value = await service.createValue(req.validated, req.user);
    return res.status(201).json(value);
  } catch (err) {
    return sendError(res, err);
  }
};

// PUT /upsert -> 201 when a new value was created, 200 when one was overwritten.
// Sending value: null clears the cell (the record itself is never touched).
exports.upsertValue = async (req, res) => {
  try {
    const { value, created } = await service.upsertValue(req.validated, req.user);
    return res.status(created ? 201 : 200).json(value);
  } catch (err) {
    return sendError(res, err);
  }
};

// `computed` (calculated formula values) is only present with ?includeComputed=true
exports.getValues = async (req, res) => {
  try {
    const { items, pagination, computed } = await service.getValues(req.validatedQuery, req.user);
    return res.json({ values: items, pagination, ...(computed ? { computed } : {}) });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getValueById = async (req, res) => {
  try {
    const value = await service.getValueById(req.params.id, req.user);
    return res.json(value);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateValue = async (req, res) => {
  try {
    const value = await service.updateValue(req.params.id, req.validated, req.user);
    return res.json(value);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deleteValue = async (req, res) => {
  try {
    await service.deleteValue(req.params.id, req.user);
    return res.json({ message: 'Value deleted' });
  } catch (err) {
    return sendError(res, err);
  }
};