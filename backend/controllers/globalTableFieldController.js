const service = require('../services/globalTableService');

const sendError = (res, err) => {
  const { status, body } = service.toHttpError(err);
  return res.status(status).json(body);
};

exports.createField = async (req, res) => {
  try {
    const field = await service.createField(req.validated, req.user);
    return res.status(201).json(field);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getFields = async (req, res) => {
  try {
    const fields = await service.getFields(req.validatedQuery, req.user);
    return res.json({ fields });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getFieldById = async (req, res) => {
  try {
    const field = await service.getFieldById(req.params.id, req.user);
    return res.json(field);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateField = async (req, res) => {
  try {
    const field = await service.updateField(req.params.id, req.validated, req.user);
    return res.json(field);
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deleteField = async (req, res) => {
  try {
    const result = await service.deleteField(req.params.id, req.validatedQuery, req.user);
    return res.json({ message: 'Field deleted', ...result });
  } catch (err) {
    return sendError(res, err);
  }
};