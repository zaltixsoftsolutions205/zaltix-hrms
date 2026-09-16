import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatDate } from '../../utils/helpers';

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

const EXCEL_COLUMNS = ['Company Name', 'Location', 'Address', 'Website', 'Contact Number', 'Email ID', 'Company Type', 'Company Size', 'Remarks'];

const EMPTY_FORM = { companyName: '', location: '', address: '', website: '', contactNumber: '', emailId: '', linkedinUrl: '', companyType: '', companySize: '', remarks: '', status: 'new' };

const UNSPECIFIED_LOCATION = 'Unspecified';

export default function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [product, setProduct] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProspect, setEditProspect] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isOtherType, setIsOtherType] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [assigningLocation, setAssigningLocation] = useState(null); // location name being reassigned
  const [newLocationName, setNewLocationName] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false); // showing the "add location" form
  const [addLocationName, setAddLocationName] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pRes, proRes] = await Promise.all([
        api.get('/products'),
        api.get(`/products/${productId}/prospects`),
      ]);
      const found = pRes.data.find(p => p._id === productId);
      setProduct(found || null);
      setProspects(proRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [productId]);

  const openAdd = () => {
    setEditProspect(null);
    setForm({ ...EMPTY_FORM, location: selectedLocation && selectedLocation !== UNSPECIFIED_LOCATION ? selectedLocation : '' });
    setIsOtherType(false);
    setShowForm(true);
  };
  const openEdit = (pr) => {
    setEditProspect(pr);
    const isOther = !!pr.companyType && !STANDARD_TYPES.includes(pr.companyType);
    setIsOtherType(isOther);
    setForm({
      companyName: pr.companyName, location: pr.location || '', address: pr.address, website: pr.website,
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
        const { data } = await api.post(`/products/${productId}/prospects`, form);
        setProspects(prev => [data, ...prev]);
        toast.success('Customer added');
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
    } catch { toast.error('Failed'); }
  };

  const handleAssignLocation = async (e) => {
    e.preventDefault();
    if (!newLocationName.trim()) return toast.error('Enter a location name');
    setAssigning(true);
    try {
      const fromLocation = assigningLocation === UNSPECIFIED_LOCATION ? '' : assigningLocation;
      const { data } = await api.post(`/products/${productId}/prospects/bulk-location`, {
        fromLocation, toLocation: newLocationName.trim(),
      });
      toast.success(`Updated ${data.updated} customer${data.updated !== 1 ? 's' : ''}`);
      setAssigningLocation(null);
      setNewLocationName('');
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setAssigning(false); }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    const name = addLocationName.trim();
    if (!name) return toast.error('Enter a location name');
    setSavingLocation(true);
    try {
      await api.post(`/products/${productId}/locations`, { name });
      toast.success('Location added');
      setAddingLocation(false);
      setAddLocationName('');
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSavingLocation(false); }
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
        location:      header.findIndex(h => h.includes('location')),
        address:       header.findIndex(h => h.includes('address')),
        website:       header.findIndex(h => h.includes('website') || h.includes('web')),
        contactNumber: header.findIndex(h => h.includes('contact') || h.includes('phone') || h.includes('mobile')),
        emailId:       header.findIndex(h => h.includes('email')),
        companyType:   header.findIndex(h => h.includes('type')),
        companySize:   header.findIndex(h => h.includes('size')),
        remarks:       header.findIndex(h => h.includes('remark') || h.includes('note')),
      };

      const prospects = rows.slice(1)
        .filter(row => row.length > 0 && row[idx.companyName >= 0 ? idx.companyName : 0])
        .map((row, i) => ({
          companyName:   String(row[idx.companyName >= 0 ? idx.companyName : 0] || '').trim(),
          location:      String(row[idx.location >= 0 ? idx.location : 1] || '').trim(),
          address:       String(row[idx.address >= 0 ? idx.address : 2] || '').trim(),
          website:       String(row[idx.website >= 0 ? idx.website : 3] || '').trim(),
          contactNumber: String(row[idx.contactNumber >= 0 ? idx.contactNumber : 4] || '').trim(),
          emailId:       String(row[idx.emailId >= 0 ? idx.emailId : 5] || '').trim(),
          companyType:   String(row[idx.companyType >= 0 ? idx.companyType : 6] || '').trim(),
          companySize:   String(row[idx.companySize >= 0 ? idx.companySize : 7] || '').trim(),
          remarks:       String(row[idx.remarks >= 0 ? idx.remarks : 8] || '').trim(),
        }))
        .filter(p => p.companyName);

      if (prospects.length === 0) { toast.error('No valid rows found'); setUploading(false); return; }

      const { data } = await api.post(`/products/${productId}/prospects/bulk`, { prospects });
      toast.success(`${data.count} customers uploaded`);
      fetchAll();
    } catch { toast.error('Failed to parse file'); }
    finally { setUploading(false); }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      EXCEL_COLUMNS,
      ['ABC Corp', 'Mumbai', '123 Main St, Mumbai', 'www.abccorp.com', '9876543210', 'contact@abccorp.com', 'Private Limited', '51-200', 'Interested in demo'],
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
      p.location || '',
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
    // Auto column widths
    ws['!cols'] = [28, 16, 18, 28, 30, 24, 32, 20, 14, 14, 28, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    const label = all ? 'all' : (statusFilter || 'filtered');
    const fileName = `${product?.name || 'customers'}_${label}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Downloaded ${rows.length} customer${rows.length !== 1 ? 's' : ''}`);
  };

  const locationOf = (p) => (p.location || '').trim() || UNSPECIFIED_LOCATION;

  const locations = Object.values(
    prospects.reduce((acc, p) => {
      const loc = locationOf(p);
      if (!acc[loc]) acc[loc] = { name: loc, count: 0 };
      acc[loc].count += 1;
      return acc;
    }, (product?.locations || []).reduce((acc, name) => {
      // Seed with locations that exist on the product but have no
      // customers yet, so they show up as selectable (empty) cards.
      if (name?.trim()) acc[name] = { name, count: 0 };
      return acc;
    }, {}))
  ).sort((a, b) => a.name === UNSPECIFIED_LOCATION ? 1 : b.name === UNSPECIFIED_LOCATION ? -1 : a.name.localeCompare(b.name));

  const scoped = selectedLocation ? prospects.filter(p => locationOf(p) === selectedLocation) : prospects;

  const filtered = scoped.filter(p => {
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
    acc[k] = scoped.filter(p => p.status === k).length;
    return acc;
  }, {});

  if (loading) return <p className="text-center py-16 text-violet-400 text-sm">Loading...</p>;
  if (!product) return <p className="text-center py-16 text-gray-400 text-sm">Product not found</p>;

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
            {!selectedLocation && (
              <button onClick={() => { setAddingLocation(true); setAddLocationName(''); }} className="btn-secondary btn-sm">
                + Add Location
              </button>
            )}
            <button onClick={openAdd} disabled={!selectedLocation} title={!selectedLocation ? 'Select a location first' : undefined}
              className="btn-primary btn-sm disabled:opacity-40 disabled:cursor-not-allowed">
              + Add Customer
            </button>
          </div>
        </div>
      </div>

      {/* Add location form */}
      <AnimatePresence>
        {addingLocation && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card p-4">
            <h3 className="font-bold text-gray-900 mb-3">Add Location</h3>
            <form onSubmit={handleAddLocation} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="label-text">Location name</label>
                <input className="input-field" placeholder="e.g. Mumbai" value={addLocationName} autoFocus
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

      {/* Location Cards (top level) */}
      {!selectedLocation && (
        locations.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-gray-500 font-semibold">No locations yet</p>
            <p className="text-sm text-gray-400 mt-1">Add a location to get started, then add customers to it.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map(loc => (
              <motion.div key={loc.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedLocation(loc.name)}
                className="glass-card p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <h3 className="font-bold text-gray-900 group-hover:text-violet-700 transition-colors truncate">{loc.name}</h3>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setAssigningLocation(loc.name); setNewLocationName(loc.name === UNSPECIFIED_LOCATION ? '' : loc.name); }}
                    title={loc.name === UNSPECIFIED_LOCATION ? 'Assign a location' : 'Rename location'}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors flex-shrink-0 ml-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <p className="text-2xl font-bold text-violet-700 leading-none">{loc.count}</p>
                  <p className="text-[10px] text-gray-500 mt-1">customer{loc.count !== 1 ? 's' : ''}</p>
                </div>

                <div className="mt-2 flex items-center justify-end">
                  <span className="text-[10px] text-violet-500 font-semibold group-hover:underline">View Customers →</span>
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}

      {/* Assign / rename location form */}
      <AnimatePresence>
        {assigningLocation && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card p-4">
            <h3 className="font-bold text-gray-900 mb-3">
              {assigningLocation === UNSPECIFIED_LOCATION ? 'Assign Location' : `Rename "${assigningLocation}"`}
            </h3>
            <form onSubmit={handleAssignLocation} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="label-text">
                  {assigningLocation === UNSPECIFIED_LOCATION
                    ? 'Set this location for all customers currently marked Unspecified'
                    : `New name for all customers currently under "${assigningLocation}"`}
                </label>
                <input className="input-field" placeholder="e.g. Mumbai" value={newLocationName} autoFocus
                  onChange={e => setNewLocationName(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setAssigningLocation(null); setNewLocationName(''); }} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={assigning} className="btn-primary btn-sm">{assigning ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedLocation && (
        <>
      <button onClick={() => { setSelectedLocation(null); setStatusFilter(''); setSearch(''); }}
        className="inline-flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-700 font-semibold transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Locations
        <span className="text-gray-400 font-normal">/ {selectedLocation}</span>
      </button>

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
                  <label className="label-text">Location *</label>
                  <input className="input-field" placeholder="e.g. Mumbai" value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
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
        {/* List header: search + count + clear */}
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
          {/* Search input */}
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

        {filtered.length === 0 ? (
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
                  {['Company Name', 'Location', 'Contact', 'Email', 'Website', 'Address', 'Type', 'Size', 'Status', 'Remarks', 'Actions'].map(h => (
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
                    <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap text-gray-600">{pr.location || '—'}</td>
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
