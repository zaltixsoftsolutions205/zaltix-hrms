const toLeadLocationFields = (productId, locationId, rootToLeafPath) => {
  const path = Array.isArray(rootToLeafPath) ? rootToLeafPath : [];
  if (!path.length || path.some((node) => !node || typeof node.name !== 'string' || !node.name.trim())) {
    throw new Error('A valid product location path is required');
  }

  // Lead.district remains the stored/API field; grids label this path as Address.
  // Mandal is the node the record sits on (the leaf of the path): in the
  // product tree the Mandal is the leaf location, at any depth.
  return {
    product: String(productId),
    productLocation: String(locationId),
    district: path.slice().reverse().map((node) => node.name.trim()).join(', '),
    mandal: path[path.length - 1].name.trim(),
  };
};

module.exports = { toLeadLocationFields };