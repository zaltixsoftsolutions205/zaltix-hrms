const ProductLocation = require('../models/ProductLocation');
const ProductCategoryRow = require('../models/ProductCategoryRow');

async function getCategory(productId, categoryId) {
  const category = await ProductLocation.findOne({ _id: categoryId, product: productId, kind: 'category' });
  return category;
}

// fields is stored as [{key, value}] (not a Mongoose Map — column headers
// like "Sl.No" contain characters Mongo forbids in Map/document keys).
// These convert to/from the plain object shape the frontend works with.
const toObject = (fieldsArray) =>
  fieldsArray.reduce((acc, { key, value }) => { acc[key] = value; return acc; }, {});

const toArray = (fieldsObject) =>
  Object.entries(fieldsObject).map(([key, value]) => ({ key, value }));

const serializeRow = (r) => ({ _id: r._id, fields: toObject(r.fields), createdAt: r.createdAt });

// Category details (name + its field list) plus its rows.
exports.getRows = async (req, res) => {
  try {
    const { productId, categoryId } = req.params;
    const category = await getCategory(productId, categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const rows = await ProductCategoryRow.find({ category: categoryId }).sort({ createdAt: -1 });
    res.json({
      category: { _id: category._id, name: category.name, fields: category.fields },
      rows: rows.map(serializeRow),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Upload a sheet's rows into a category. The first upload into an empty
// category sets its field list (column order, as parsed); later uploads
// must use the same field set the category already has.
exports.uploadRows = async (req, res) => {
  try {
    const { productId, categoryId } = req.params;
    const { columns, rows } = req.body; // columns: string[], rows: object[] (column -> value)
    if (!Array.isArray(columns) || columns.length === 0) return res.status(400).json({ message: 'No columns provided' });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'No rows to import' });

    const category = await getCategory(productId, categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    if (category.fields.length === 0) {
      category.fields = columns;
      await category.save();
    } else {
      const known = new Set(category.fields);
      const unknown = columns.filter(c => !known.has(c));
      if (unknown.length > 0) {
        return res.status(400).json({
          message: `This category's columns are already set (${category.fields.join(', ')}). Unrecognized column(s): ${unknown.join(', ')}`,
        });
      }
    }

    const docs = rows.map(row => {
      const fields = category.fields
        .filter(col => row[col] !== undefined && row[col] !== null && row[col] !== '')
        .map(col => ({ key: col, value: String(row[col]).trim() }));
      return { product: productId, category: categoryId, fields, createdBy: req.user._id };
    }).filter(d => d.fields.length > 0);

    if (docs.length === 0) return res.status(400).json({ message: 'No valid rows to import' });

    const created = await ProductCategoryRow.insertMany(docs);
    res.status(201).json({ count: created.length, fields: category.fields });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add a single row manually, using the category's existing field set.
exports.addRow = async (req, res) => {
  try {
    const { productId, categoryId } = req.params;
    const { fields } = req.body;
    if (!fields || typeof fields !== 'object') return res.status(400).json({ message: 'Fields are required' });

    const category = await getCategory(productId, categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const known = new Set(category.fields);
    const filtered = toArray(fields).filter(({ key, value }) => known.has(key) && value !== undefined && value !== null && value !== '');
    if (filtered.length === 0) return res.status(400).json({ message: 'Enter at least one field value' });

    const row = await ProductCategoryRow.create({
      product: productId, category: categoryId, fields: filtered, createdBy: req.user._id,
    });
    res.status(201).json(serializeRow(row));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateRow = async (req, res) => {
  try {
    const { productId, categoryId, rowId } = req.params;
    const { fields } = req.body;
    if (!fields || typeof fields !== 'object') return res.status(400).json({ message: 'Fields are required' });

    const category = await getCategory(productId, categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const known = new Set(category.fields);
    const filtered = toArray(fields).filter(({ key, value }) => known.has(key) && value !== undefined && value !== null && value !== '');

    const row = await ProductCategoryRow.findOneAndUpdate(
      { _id: rowId, category: categoryId },
      { fields: filtered },
      { new: true }
    );
    if (!row) return res.status(404).json({ message: 'Row not found' });
    res.json(serializeRow(row));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteRow = async (req, res) => {
  try {
    const { categoryId, rowId } = req.params;
    await ProductCategoryRow.findOneAndDelete({ _id: rowId, category: categoryId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// The read-only "ALL SCHOOLS" view for one location: every row from that
// location's own direct categories (not sub-locations), unioned onto one
// field list, each tagged with its source category name. Optional
// ?board=cbse|state filters to categories whose name contains that text.
exports.getAllRows = async (req, res) => {
  try {
    const { productId } = req.params;
    const { location, board } = req.query;
    if (!location) return res.status(400).json({ message: 'A location is required' });

    let categories = await ProductLocation.find({ product: productId, parent: location, kind: 'category' });
    if (board) {
      const b = board.toLowerCase();
      categories = categories.filter(c => c.name.toLowerCase().includes(b));
    }

    const fieldSet = new Set();
    const allRows = [];
    for (const category of categories) {
      category.fields.forEach(f => fieldSet.add(f));
      const rows = await ProductCategoryRow.find({ category: category._id });
      rows.forEach(r => allRows.push({
        _id: r._id,
        fields: toObject(r.fields),
        category: category.name,
        createdAt: r.createdAt,
      }));
    }

    res.json({ fields: Array.from(fieldSet), rows: allRows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add a new column to a category. Existing rows are left without that
// field (treated as blank) until edited.
exports.addField = async (req, res) => {
  try {
    const { productId, categoryId } = req.params;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Field name is required' });

    const category = await getCategory(productId, categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const fieldName = name.trim();
    if (category.fields.includes(fieldName)) return res.status(400).json({ message: 'Field already exists' });

    category.fields.push(fieldName);
    await category.save();
    res.json({ fields: category.fields });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Remove a column from a category. Only allowed while it has no rows yet —
// once data exists, removing a field would silently drop real values, so
// that must go through editing/deleting rows instead.
exports.deleteField = async (req, res) => {
  try {
    const { productId, categoryId, fieldName } = req.params;

    const category = await getCategory(productId, categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const rowCount = await ProductCategoryRow.countDocuments({ category: categoryId });
    if (rowCount > 0) {
      return res.status(400).json({ message: 'This category already has rows — edit or delete them instead of removing the field.' });
    }

    category.fields = category.fields.filter(f => f !== fieldName);
    await category.save();
    res.json({ fields: category.fields });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
