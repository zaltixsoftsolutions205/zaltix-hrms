/**
 * Turns a human field name into a stable, lowercase, underscore-separated key.
 *   "Sales Executive" -> "sales_executive"
 *   "Lead Source!!"   -> "lead_source"
 */
function generateFieldKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_') // non-alphanumeric -> _
    .replace(/_+/g, '_')         // collapse repeats
    .replace(/^_|_$/g, '');      // trim leading/trailing _
}

module.exports = { generateFieldKey };