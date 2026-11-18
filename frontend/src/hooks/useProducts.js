import { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { normalizeProductList, toProductOptions } from '../components/GlobalTable/productRef';

/**
 * Loads the products a lead can reference. Reads the existing Product list route
 * (GET <API base>/products -> productController.getProducts). The ONE place that knows the
 * route: if your project already has a Product service function, call it from fetchProducts.
 */
export const PRODUCTS_ENDPOINT = '/products';

export const fetchProducts = () => api
  .get(PRODUCTS_ENDPOINT, { params: { limit: 1000 } })
  .then((response) => normalizeProductList(response.data));

/** { options: [{ value: id, label: name }] (active only), status: 'loading' | 'ready' | 'failed' } */
export const useProducts = () => {
  const [state, setState] = useState({ status: 'loading', products: [] });

  useEffect(() => {
    let alive = true;
    fetchProducts()
      .then((products) => { if (alive) setState({ status: 'ready', products }); })
      .catch(() => { if (alive) setState({ status: 'failed', products: [] }); });
    return () => { alive = false; };
  }, []);

  const options = useMemo(() => toProductOptions(state.products), [state.products]);
  return { options, status: state.status };
};