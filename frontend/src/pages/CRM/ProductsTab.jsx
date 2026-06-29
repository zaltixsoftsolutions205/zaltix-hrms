import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatDate } from '../../utils/helpers';

const STANDARD_CATEGORIES = ['Software', 'Hardware', 'Service', 'Subscription', 'Consulting'];

export default function ProductsTab() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState({ name: '', category: '' });
  const [submitting, setSubmitting] = useState(false);
  const [isOtherCat, setIsOtherCat] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/products');
      setProducts(data);
    } catch { toast.error('Failed to load products'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const openAdd = () => {
    setEditProduct(null);
    setForm({ name: '', category: '' });
    setIsOtherCat(false);
    setShowForm(true);
  };

  const openEdit = (p, e) => {
    e.stopPropagation();
    setEditProduct(p);
    const isOther = !!p.category && !STANDARD_CATEGORIES.includes(p.category);
    setIsOtherCat(isOther);
    setForm({ name: p.name, category: p.category });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Product name is required');
    setSubmitting(true);
    try {
      if (editProduct) {
        const { data } = await api.put(`/products/${editProduct._id}`, form);
        setProducts(prev => prev.map(p => p._id === editProduct._id ? { ...p, ...data } : p));
        toast.success('Updated');
      } else {
        const { data } = await api.post('/products', form);
        setProducts(prev => [{ ...data, prospectCount: 0, interestedCount: 0, convertedCount: 0 }, ...prev]);
        toast.success('Product created');
      }
      setShowForm(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this product and all its customer data?')) return;
    try {
      await api.delete(`/products/${id}`);
      setProducts(prev => prev.filter(p => p._id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  };

  if (loading) return <p className="text-center py-16 text-violet-400 text-sm">Loading...</p>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{products.length} product{products.length !== 1 ? 's' : ''}</p>
        <button onClick={openAdd} className="btn-primary btn-sm">+ Add Product</button>
      </div>

      {/* Add / Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card p-4">
            <h3 className="font-bold text-gray-900 mb-3">{editProduct ? 'Edit Product' : 'New Product'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Product Name *</label>
                  <input className="input-field" placeholder="e.g. HRMS Pro" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">Category</label>
                  <select className="input-field"
                    value={isOtherCat ? 'Other' : (form.category || '')}
                    onChange={e => {
                      if (e.target.value === 'Other') {
                        setIsOtherCat(true);
                        setForm(f => ({ ...f, category: '' }));
                      } else {
                        setIsOtherCat(false);
                        setForm(f => ({ ...f, category: e.target.value }));
                      }
                    }}>
                    <option value="">Select category</option>
                    {STANDARD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="Other">Other (specify below)</option>
                  </select>
                  {isOtherCat && (
                    <input
                      className="input-field mt-1"
                      placeholder="Type the category e.g. IoT, AI Platform…"
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      autoFocus
                    />
                  )}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary btn-sm">
                  {submitting ? 'Saving...' : editProduct ? 'Update' : 'Create Product'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-gray-500 font-semibold">No products yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a product to start tracking customer prospects.</p>
          <button onClick={openAdd} className="btn-primary btn-sm mt-3">+ Add Product</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <motion.div key={p._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => navigate(`/crm/products/${p._id}`)}
              className="glass-card p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-900 group-hover:text-violet-700 transition-colors truncate">{p.name}</h3>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${p.status === 'active' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.status}
                    </span>
                  </div>
                  {p.category && <p className="text-xs text-gray-500">{p.category}</p>}
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <button onClick={e => openEdit(p, e)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button onClick={e => handleDelete(p._id, e)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-base font-bold text-gray-900">{p.prospectCount ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Prospects</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-amber-600">{p.interestedCount ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Interested</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-violet-600">{p.convertedCount ?? 0}</p>
                  <p className="text-[10px] text-gray-500">In Leads</p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <p className="text-[10px] text-gray-400">{formatDate(p.createdAt)}</p>
                <span className="text-[10px] text-violet-500 font-semibold group-hover:underline">View Prospects →</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
