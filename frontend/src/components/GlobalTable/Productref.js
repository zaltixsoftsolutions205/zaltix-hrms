/**
 * Product reference helpers (pure; no React, no network).
 *
 * The Lead API returns `product` as a populated object { _id, name, status, productType }, as a
 * raw ObjectId string (if it was not populated) or null. The grid must show the product NAME and
 * must save the product `_id` (never the name, never the whole object).
 */

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

/** The product id from a populated object, a raw ObjectId string or an ObjectId-like value; else null. */
export const productId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return OBJECT_ID_RE.test(value) ? value : null;
  if (typeof value === 'object') {
    if (value._id !== undefined && value._id !== value) return productId(value._id);
    const text = typeof value.toString === 'function' ? value.toString() : '';
    return OBJECT_ID_RE.test(text) ? text : null; // ObjectId instance
  }
  return null;
};

/** The product name when the value is a populated object, else ''. Never returns an id. */
export const productName = (value) => (
  value && typeof value === 'object' && typeof value.name === 'string' ? value.name.trim() : ''
);

/** Name for an id from a loaded options list ([{ value, label }]), else ''. */
export const productLabelFromOptions = (options, id) => {
  if (!id || !Array.isArray(options)) return '';
  const found = options.find((o) => o && o.value === id);
  return found ? String(found.label || '') : '';
};

/** Accepts every list shape an API might use: [..], { products }, { data }, { items }, { data: { products } }. */
export const normalizeProductList = (body) => {
  const pick = (v) => (Array.isArray(v) ? v : null);
  const list = pick(body)
    || pick(body && body.products)
    || pick(body && body.data)
    || pick(body && body.items)
    || pick(body && body.data && body.data.products)
    || [];
  return list.filter((p) => p && typeof p === 'object' && productId(p._id));
};

/** Selectable options: ACTIVE products only (a product without a status counts as active), by name. */
export const toProductOptions = (products) => (Array.isArray(products) ? products : [])
  .filter((p) => productId(p._id) && (p.status === undefined || p.status === 'active'))
  .map((p) => ({ value: productId(p._id), label: String(p.name || 'Unnamed product') }))
  .sort((a, b) => a.label.localeCompare(b.label));

/**
 * Options for ONE control: the active products, plus the lead's CURRENT product when it is not in
 * that list (inactive, or the list failed to load). The reference is never silently dropped or
 * replaced: the backend keeps an unchanged product that was deactivated later.
 */
export const productChoices = (options, current) => {
  const list = Array.isArray(options) ? options : [];
  const id = productId(current);
  if (!id || list.some((o) => o.value === id)) return list;
  const name = productName(current);
  const suffix = current && typeof current === 'object' && current.status === 'inactive' ? ' (inactive)' : '';
  return [{ value: id, label: name ? `${name}${suffix}` : 'Current product' }, ...list];
};

/** Text shown inside an empty select, from the load state; '' when there is nothing to say. */
export const productsHint = (state, optionCount) => {
  if (state === 'loading') return 'Loading products…';
  if (state === 'failed') return 'Could not load products';
  if (optionCount === 0) return 'No active products';
  return '';
};