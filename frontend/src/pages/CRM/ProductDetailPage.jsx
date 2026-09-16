import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api from '../../utils/api';

/* ── Multi-value tag input ── */
function TagInput({ values, onChange, placeholder, type = 'text' }) {
  const [draft, setDraft] = useState('');
  const tags = values ? values.split(',').map(v => v.trim()).filter(Boolean) : [];

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const next = [...new Set([...tags, v])];
    onChange(next.join(', '));
    setDraft('');
  };

  const remove = (idx) => {
    const next = tags.filter((_, i) => i !== idx);
    onChange(next.join(', '));
  };

  return (
    <div className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus-within:border-violet-400 transition-colors min-h-[38px]">
      <div className="flex flex-wrap gap-1 mb-1">
        {tags.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[11px] font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md">
            {t}
            <button type="button" onClick={() => remove(i)} className="text-violet-400 hover:text-violet-700 leading-none ml-0.5">×</button>
          </span>
        ))}
      </div>
      <input
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : 'Add another…'}
        className="w-full text-xs text-gray-700 placeholder:text-gray-300 outline-none bg-transparent"
      />
    </div>
  );
}

const STATUS_CFG = {
  new:              { label: 'New',           cls: 'bg-violet-100 text-violet-700' },
  contacted:        { label: 'Contacted',     cls: 'bg-amber-100 text-amber-700' },
  interested:       { label: 'Interested',    cls: 'bg-golden-100 text-golden-700' },
  'not-interested': { label: 'Not Interested',cls: 'bg-gray-100 text-gray-600' },
  converted:        { label: 'In Leads',      cls: 'bg-violet-200 text-violet-800' },
};

const STANDARD_TYPES = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Sole Proprietorship', 'NGO', 'Government'];
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];

const EXCEL_COLUMNS = ['Company Name', 'Address', 'Website', 'Contact Number', 'Email ID', 'Company Type', 'Company Size', 'Remarks'];

const EMPTY_FORM = { companyName: '', address: '', website: '', contactNumber: '', emailId: '', linkedinUrl: '', companyType: '', companySize: '', remarks: '', status: 'new' };

const UNSPECIFIED = 'unspecified'; // sentinel node id for "no location set"

export default function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Location tree navigation ──────────────────────────────────────────
  // `path` is the drill-down stack of location nodes the user has clicked
  // into, oldest-first (breadcrumb order). Empty = top level.
  const [path, setPath] = useState([]);
  const currentParent = path.length ? path[path.length - 1] : null;

  const [children, setChildren] = useState([]); // sub-locations of currentParent
  const [unspecifiedCount, setUnspecifiedCount] = useState(0);
  const [locLoading, setLocLoading] = useState(true);

  // Viewing customers at a specific node ('unspecified' or a location id).
  // null = showing the location cards, not a customer list.
  const [viewingLocation, setViewingLocation] = useState(null);

  const [addingLocation, setAddingLocation] = useState(false);
  const [addLocationName, setAddLocationName] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [renamingLocation, setRenamingLocation] = useState(null); // node being renamed
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  // ── Customers within the currently-viewed location ──────────────────────
  const [prospects, setProspects] = useState([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProspect, setEditProspect] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isOtherType, setIsOtherType] = useState(false);
  const [search, setSearch] = useState('');

  const fetchProduct = useCallback(async () => {
    try {
      const { data } = await api.get('/products');
      setProduct(data.find(p => p._id === productId) || null);
    } catch { toast.error('Failed to load product'); }
    finally { setLoading(false); }
  }, [productId]);

  const fetchChildren = useCallback(async () => {
    setLocLoading(true);
    try {
      const { data } = await api.get(`/products/${productId}/locations`, {
        params: { parent: currentParent?._id || undefined },
      });
      setChildren(data.nodes);
      setUnspecifiedCount(data.unspecifiedCount);
    } catch { toast.error('Failed to load locations'); }
    finally { setLocLoading(false); }
  }, [productId, currentParent]);

  const fetchProspects = useCallback(async () => {
    if (!viewingLocation) return;
    setProspectsLoading(true);
    try {
      const { data } = await api.get(`/products/${productId}/prospects`, {
        params: { location: viewingLocation === UNSPECIFIED ? 'unspecified' : viewingLocation },
      });
      setProspects(data);
    } catch { toast.error('Failed to load customers'); }
    finally { setProspectsLoading(false); }
  }, [productId, viewingLocation]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);
  useEffect(() => { if (!viewingLocation) fetchChildren(); }, [fetchChildren, viewingLocation]);
  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  const enterLocation = (node) => { setPath(p => [...p, node]); setViewingLocation(null); };
  const goToBreadcrumb = (idx) => { setPath(p => p.slice(0, idx + 1)); setViewingLocation(null); };
  const goToRoot = () => { setPath([]); setViewingLocation(null); };
  const viewCustomersHere = (nodeIdOrUnspecified) => { setViewingLocation(nodeIdOrUnspecified); setStatusFilter(''); setSearch(''); };
  const backToLocations = () => { setViewingLocation(null); setStatusFilter(''); setSearch(''); };

  const openAdd = () => {
    setEditProspect(null);
    setForm(EMPTY_FORM);
    setIsOtherType(false);
    setShowForm(true);
  };
  const openEdit = (pr) => {
    setEditProspect(pr);
    const isOther = !!pr.companyType && !STANDARD_TYPES.includes(pr.companyType);
    setIsOtherType(isOther);
    setForm({
      companyName: pr.companyName, address: pr.address, website: pr.website,
      contactNumber: pr.contactNumber, emailId: pr.emailId, linkedinUrl: pr.linkedinUrl || '',
      companyType: pr.companyType, companySize: pr.companySize,
      remarks: pr.remarks, status: pr.status,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.companyName.trim()) return toast.error('Company name is required');
    setSubmitting(true);
    try {
      if (editProspect) {
        const { data } = await api.put(`/products/${productId}/prospects/${editProspect._id}`, form);
        setProspects(prev => prev.map(p => p._id === editProspect._id ? data : p));
        toast.success('Updated');
      } else {
        const location = viewingLocation === UNSPECIFIED ? null : viewingLocation;
        const { data } = await api.post(`/products/${productId}/prospects`, { ...form, location });
        setProspects(prev => [data, ...prev]);
        toast.success('Customer added');
        fetchChildren(); // refresh counts shown on cards once we go back
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const { data } = await api.put(`/products/${productId}/prospects/${id}`, { status });
      setProspects(prev => prev.map(p => p._id === id ? data : p));
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this customer?')) return;
    try {
      await api.delete(`/products/${productId}/prospects/${id}`);
      setProspects(prev => prev.filter(p => p._id !== id));
      toast.success('Removed');
      fetchChildren();
    } catch { toast.error('Failed'); }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    const name = addLocationName.trim();
    if (!name) return toast.error('Enter a location name');
    setSavingLocation(true);
    try {
      await api.post(`/products/${productId}/locations`, { name, parent: currentParent?._id || null });
      toast.success('Location added');
      setAddingLocation(false);
      setAddLocationName('');
      fetchChildren();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSavingLocation(false); }
  };

  const handleRenameLocation = async (e) => {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name) return toast.error('Enter a location name');
    setRenaming(true);
    try {
      await api.put(`/products/${productId}/locations/${renamingLocation._id}`, { name });
      toast.success('Renamed');
      setRenamingLocation(null);
      setRenameValue('');
      fetchChildren();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setRenaming(false); }
  };

  const handleDeleteLocation = async (node) => {
    if (!window.confirm(`Delete "${node.name}"? It must have no sub-locations or customers.`)) return;
    try {
      await api.delete(`/products/${productId}/locations/${node._id}`);
      toast.success('Deleted');
      fetchChildren();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleConvertToLead = async (id) => {
    try {
      const { data } = await api.post(`/products/${productId}/prospects/${id}/convert-to-lead`);
      setProspects(prev => prev.map(p => p._id === id ? data.prospect : p));
      toast.success('Added to Leads!');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf);
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) { toast.error('File is empty'); setUploading(false); return; }

      const header = rows[0].map(h => String(h || '').toLowerCase().trim());
      const idx = {
        companyName:   header.findIndex(h => h.includes('company') && h.includes('name')),
        address:       header.findIndex(h => h.includes('address')),
        website:       header.findIndex(h => h.includes('website') || h.includes('web')),
        contactNumber: header.findIndex(h => h.includes('contact') || h.includes('phone') || h.includes('mobile')),
        emailId:       header.findIndex(h => h.includes('email')),
        companyType:   header.findIndex(h => h.includes('type')),
        companySize:   header.findIndex(h => h.includes('size')),
        remarks:       header.findIndex(h => h.includes('remark') || h.includes('note')),
      };

      const location = viewingLocation === UNSPECIFIED ? null : viewingLocation;
      const newProspects = rows.slice(1)
        .filter(row => row.length > 0 && row[idx.companyName >= 0 ? idx.companyName : 0])
        .map((row) => ({
          companyName:   String(row[idx.companyName >= 0 ? idx.companyName : 0] || '').trim(),
          address:       String(row[idx.address >= 0 ? idx.address : 1] || '').trim(),
          website:       String(row[idx.website >= 0 ? idx.website : 2] || '').trim(),
          contactNumber: String(row[idx.contactNumber >= 0 ? idx.contactNumber : 3] || '').trim(),
          emailId:       String(row[idx.emailId >= 0 ? idx.emailId : 4] || '').trim(),
          companyType:   String(row[idx.companyType >= 0 ? idx.companyType : 5] || '').trim(),
          companySize:   String(row[idx.companySize >= 0 ? idx.companySize : 6] || '').trim(),
          remarks:       String(row[idx.remarks >= 0 ? idx.remarks : 7] || '').trim(),
          location,
        }))
        .filter(p => p.companyName);

      if (newProspects.length === 0) { toast.error('No valid rows found'); setUploading(false); return; }

      const { data } = await api.post(`/products/${productId}/prospects/bulk`, { prospects: newProspects });
      toast.success(`${data.count} customers uploaded`);
      fetchProspects();
    } catch { toast.error('Failed to parse file'); }
    finally { setUploading(false); }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      EXCEL_COLUMNS,
      ['ABC Corp', '123 Main St, Mumbai', 'www.abccorp.com', '9876543210', 'contact@abccorp.com', 'Private Limited', '51-200', 'Interested in demo'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, 'customer_template.xlsx');
  };

  const downloadData = (all = false) => {
    const rows = all ? prospects : filtered;
    if (rows.length === 0) { toast.error('No data to download'); return; }
    const headers = ['Company Name', 'Location', 'Contact Number', 'Email ID', 'LinkedIn', 'Website', 'Address', 'Company Type', 'Company Size', 'Status', 'Remarks', 'Added Date'];
    const data = rows.map(p => [
      p.companyName,
      p.locationPath || '',
      p.contactNumber || '',
      p.emailId || '',
      p.linkedinUrl || '',
      p.website || '',
      p.address || '',
      p.companyType || '',
      p.companySize || '',
      STATUS_CFG[p.status]?.label || p.status,
      p.remarks || '',
      p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = [28, 20, 18, 28, 30, 24, 32, 20, 14, 14, 28, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    const label = all ? 'all' : (statusFilter || 'filtered');
    const fileName = `${product?.name || 'customers'}_${label}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Downloaded ${rows.length} customer${rows.length !== 1 ? 's' : ''}`);
  };

  const filtered = prospects.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.companyName?.toLowerCase().includes(q) ||
      p.contactNumber?.toLowerCase().includes(q) ||
      p.emailId?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.companyType?.toLowerCase().includes(q) ||
      p.website?.toLowerCase().includes(q) ||
      p.remarks?.toLowerCase().includes(q)
    );
  });
  const counts = Object.keys(STATUS_CFG).reduce((acc, k) => {
    acc[k] = prospects.filter(p => p.status === k).length;
    return acc;
  }, {});

  if (loading) return <p className="text-center py-16 text-violet-400 text-sm">Loading...</p>;
  if (!product) return <p className="text-center py-16 text-gray-400 text-sm">Product not found</p>;

  const viewingNode = viewingLocation && viewingLocation !== UNSPECIFIED
    ? children.find(c => c._id === viewingLocation) || path[path.length - 1]
    : null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/crm')}
          className="p-2 rounded-xl hover:bg-violet-50 transition-colors flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h2 className="page-title truncate">{product.name}</h2>
            {product.category && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">{product.category}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {viewingLocation && (
              <>
                <button onClick={downloadTemplate} className="btn-secondary btn-sm" title="Download Excel template">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Template
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary btn-sm">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Upload Excel'}
                </button>
                <button onClick={() => downloadData(false)} title={statusFilter || search ? 'Download filtered results' : 'Download all customers'} className="btn-secondary btn-sm">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {statusFilter || search ? 'Export Filtered' : 'Export Excel'}
                </button>
                {(statusFilter || search) && (
                  <button onClick={() => downloadData(true)} title="Download all customers (ignore filters)" className="btn-secondary btn-sm text-gray-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export All
                  </button>
                )}
                <button onClick={openAdd} className="btn-primary btn-sm">+ Add Customer</button>
              </>
            )}
            {!viewingLocation && (
              <button onClick={() => { setAddingLocation(true); setAddLocationName(''); }} className="btn-secondary btn-sm">
                + Add Location
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      {(path.length > 0 || viewingLocation) && (
        <div className="flex items-center gap-1.5 flex-wrap text-sm">
          <button onClick={viewingLocation ? backToLocations : goToRoot} className="text-violet-500 hover:text-violet-700 font-semibold">
            All Locations
          </button>
          {path.map((node, i) => (
            <span key={node._id} className="flex items-center gap-1.5">
              <span className="text-gray-300">/</span>
              <button
                onClick={() => (viewingLocation && i === path.length - 1) ? backToLocations() : goToBreadcrumb(i)}
                className={`font-semibold ${i === path.length - 1 && !viewingLocation ? 'text-gray-900' : 'text-violet-500 hover:text-violet-700'}`}>
                {node.name}
              </button>
            </span>
          ))}
          {viewingLocation === UNSPECIFIED && (
            <span className="flex items-center gap-1.5"><span className="text-gray-300">/</span><span className="font-semibold text-gray-900">Unspecified</span></span>
          )}
          {viewingLocation && viewingLocation !== UNSPECIFIED && viewingNode && !path.some(n => n._id === viewingLocation) && (
            <span className="flex items-center gap-1.5"><span className="text-gray-300">/</span><span className="font-semibold text-gray-900">{viewingNode.name}</span></span>
          )}
        </div>
      )}

      {/* Add location form */}
      <AnimatePresence>
        {addingLocation && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card p-4">
            <h3 className="font-bold text-gray-900 mb-3">
              {currentParent ? `Add Location inside "${currentParent.name}"` : 'Add Location'}
            </h3>
            <form onSubmit={handleAddLocation} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="label-text">Location name</label>
                <input className="input-field" placeholder="e.g. Telangana" value={addLocationName} autoFocus
                  onChange={e => setAddLocationName(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setAddingLocation(false); setAddLocationName(''); }} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={savingLocation} className="btn-primary btn-sm">{savingLocation ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename location form */}
      <AnimatePresence>
        {renamingLocation && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card p-4">
            <h3 className="font-bold text-gray-900 mb-3">Rename "{renamingLocation.name}"</h3>
            <form onSubmit={handleRenameLocation} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="label-text">New name</label>
                <input className="input-field" value={renameValue} autoFocus onChange={e => setRenameValue(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setRenamingLocation(null); setRenameValue(''); }} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={renaming} className="btn-primary btn-sm">{renaming ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location Cards */}
      {!viewingLocation && (
        locLoading ? (
          <p className="text-center py-10 text-violet-400 text-sm">Loading locations...</p>
        ) : children.length === 0 && unspecifiedCount === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-gray-500 font-semibold">No locations yet</p>
            <p className="text-sm text-gray-400 mt-1">Add a location to get started, then add customers to it.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map(node => (
              <motion.div key={node._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <h3 className="font-bold text-gray-900 truncate">{node.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button
                      onClick={() => { setRenamingLocation(node); setRenameValue(node.name); }}
                      title="Rename location"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteLocation(node)}
                      title="Delete location"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <p className="text-2xl font-bold text-violet-700 leading-none">{node.prospectCount}</p>
                  <p className="text-[10px] text-gray-500 mt-1">customer{node.prospectCount !== 1 ? 's' : ''} here</p>
                </div>

                <div className="mt-3 flex items-center gap-3 text-[10px] font-semibold">
                  <button onClick={() => enterLocation(node)} className="text-violet-500 hover:underline">
                    {node.hasChildren ? 'Open →' : 'Open (add sub-location) →'}
                  </button>
                  <button onClick={() => viewCustomersHere(node._id)} className="text-gray-500 hover:underline">
                    View Customers →
                  </button>
                </div>
              </motion.div>
            ))}

            {unspecifiedCount > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => viewCustomersHere(UNSPECIFIED)}
                className="glass-card p-4 cursor-pointer hover:shadow-md transition-all border-dashed border-2 border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="font-bold text-gray-600">Unspecified</h3>
                </div>
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-2xl font-bold text-gray-500 leading-none">{unspecifiedCount}</p>
                  <p className="text-[10px] text-gray-400 mt-1">customer{unspecifiedCount !== 1 ? 's' : ''} with no location</p>
                </div>
              </motion.div>
            )}
          </div>
        )
      )}

      {viewingLocation && (
        <>
          {/* Status Stats */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:grid sm:grid-cols-5 sm:gap-2">
            {Object.entries(STATUS_CFG).map(([k, cfg]) => (
              <button key={k} onClick={() => setStatusFilter(prev => prev === k ? '' : k)}
                className={`flex-shrink-0 sm:flex-shrink min-w-[70px] sm:min-w-0 rounded-xl border py-2 sm:py-3 flex flex-col items-center justify-center gap-0.5 transition-all ${statusFilter === k ? 'ring-2 ring-violet-400 border-violet-300' : 'border-gray-100'} ${cfg.cls}`}>
                <p className="text-lg sm:text-2xl font-bold leading-none">{counts[k] ?? 0}</p>
                <p className="text-[9px] sm:text-[10px] font-semibold leading-tight text-center px-0.5 whitespace-nowrap">{cfg.label}</p>
              </button>
            ))}
          </div>

          {/* Add / Edit Form */}
          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="glass-card p-4">
                <h3 className="font-bold text-gray-900 mb-3">{editProspect ? 'Edit Customer' : 'Add Customer'}</h3>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="label-text">Company Name *</label>
                      <input className="input-field" placeholder="e.g. ABC Pvt Ltd" value={form.companyName}
                        onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label-text">Contact Number</label>
                      <input className="input-field" placeholder="Mobile / Phone" value={form.contactNumber}
                        onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label-text">Email IDs <span className="font-normal text-gray-400 normal-case">(Enter or comma to add multiple)</span></label>
                      <TagInput
                        values={form.emailId}
                        onChange={v => setForm(f => ({ ...f, emailId: v }))}
                        placeholder="contact@company.com"
                        type="email"
                      />
                    </div>
                    <div>
                      <label className="label-text">LinkedIn URLs <span className="font-normal text-gray-400 normal-case">(Enter or comma to add multiple)</span></label>
                      <TagInput
                        values={form.linkedinUrl}
                        onChange={v => setForm(f => ({ ...f, linkedinUrl: v }))}
                        placeholder="linkedin.com/in/..."
                      />
                    </div>
                    <div>
                      <label className="label-text">Address</label>
                      <input className="input-field" placeholder="City / Full address" value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label-text">Website</label>
                      <input className="input-field" placeholder="www.company.com" value={form.website}
                        onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label-text">Company Type</label>
                      <select className="input-field"
                        value={isOtherType ? 'Other' : (form.companyType || '')}
                        onChange={e => {
                          if (e.target.value === 'Other') {
                            setIsOtherType(true);
                            setForm(f => ({ ...f, companyType: '' }));
                          } else {
                            setIsOtherType(false);
                            setForm(f => ({ ...f, companyType: e.target.value }));
                          }
                        }}>
                        <option value="">Select type</option>
                        {STANDARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="Other">Other (specify below)</option>
                      </select>
                      {isOtherType && (
                        <input
                          className="input-field mt-1"
                          placeholder="Type the company type e.g. Technology, Startup…"
                          value={form.companyType}
                          onChange={e => setForm(f => ({ ...f, companyType: e.target.value }))}
                          autoFocus
                        />
                      )}
                    </div>
                    <div>
                      <label className="label-text">Company Size</label>
                      <select className="input-field" value={form.companySize}
                        onChange={e => setForm(f => ({ ...f, companySize: e.target.value }))}>
                        <option value="">Select size</option>
                        {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label-text">Status</label>
                      <select className="input-field" value={form.status}
                        onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                        {Object.entries(STATUS_CFG).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="label-text">Remarks</label>
                      <input className="input-field" placeholder="Any remarks" value={form.remarks}
                        onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
                    <button type="submit" disabled={submitting} className="btn-primary btn-sm">
                      {submitting ? 'Saving...' : editProspect ? 'Update' : 'Add Customer'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Customers List */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">
                  {filtered.length} customer{filtered.length !== 1 ? 's' : ''}
                  {statusFilter && <span className="text-xs text-violet-500 ml-2">· {STATUS_CFG[statusFilter]?.label}</span>}
                  {search && <span className="text-xs text-amber-500 ml-2">· "{search}"</span>}
                </p>
                {(statusFilter || search) && (
                  <button onClick={() => { setStatusFilter(''); setSearch(''); }}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    Clear filters
                  </button>
                )}
              </div>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by company, phone, email, address, type…"
                  className="w-full pl-9 pr-9 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            </div>

            {prospectsLoading ? (
              <p className="text-center py-10 text-violet-400 text-sm">Loading customers...</p>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                {search || statusFilter ? (
                  <>
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                    <p className="text-gray-500 font-semibold text-sm">No results found</p>
                    <p className="text-xs text-gray-400 mt-1">Try a different search term or clear the filters</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 font-semibold">No customers yet</p>
                    <p className="text-sm text-gray-400 mt-1">Add customers manually or upload an Excel file.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Company Name', 'Contact', 'Email', 'Website', 'Address', 'Type', 'Size', 'Status', 'Remarks', 'Actions'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap border-r border-gray-100 last:border-r-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((pr, i) => (
                      <tr key={pr._id} className={`border-b border-gray-100 hover:bg-violet-50/40 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">
                          <p className="font-semibold text-gray-900">{pr.companyName}</p>
                          {pr.convertedToLead && <span className="text-[9px] text-violet-600 font-semibold">Lead Created</span>}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap text-gray-600">
                          {pr.contactNumber ? <a href={`tel:${pr.contactNumber}`} className="hover:text-violet-600">{pr.contactNumber}</a> : '—'}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-600 max-w-[180px] truncate" title={pr.emailId}>
                          {pr.emailId || '—'}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-600 max-w-[140px] truncate" title={pr.website}>
                          {pr.website || '—'}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-600 max-w-[180px] truncate" title={pr.address}>
                          {pr.address || '—'}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap text-gray-600">{pr.companyType || '—'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap text-gray-600">{pr.companySize || '—'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">
                          <select value={pr.status} onChange={e => handleStatusChange(pr._id, e.target.value)}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-lg border-0 cursor-pointer ${STATUS_CFG[pr.status]?.cls}`}>
                            {Object.entries(STATUS_CFG).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-500 italic max-w-[180px] truncate" title={pr.remarks}>
                          {pr.remarks || '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {!pr.convertedToLead && pr.status !== 'converted' && (
                              <button onClick={() => handleConvertToLead(pr._id)} title="Add to Leads"
                                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors whitespace-nowrap">
                                → Lead
                              </button>
                            )}
                            <button onClick={() => openEdit(pr)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button onClick={() => handleDelete(pr._id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            Excel columns: <span className="font-medium">{EXCEL_COLUMNS.join(' · ')}</span> — Click "Template" to download a sample file.
          </p>
        </>
      )}
    </div>
  );
}
