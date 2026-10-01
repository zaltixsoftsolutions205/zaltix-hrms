import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { canEditModule } from '../../constants/modules';
import Card from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import Spinner from '../../components/UI/Spinner';
import EmptyState from '../../components/UI/EmptyState';

const STATUS_META = {
  open:        { label: 'Open',        cls: 'bg-golden-50 text-golden-700 border-golden-200' },
  in_progress: { label: 'In Progress', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  resolved:    { label: 'Resolved',    cls: 'bg-green-50 text-green-700 border-green-200' },
};

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.open;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
      {meta.label}
    </span>
  );
};

const emptyForm = { product: '', query: '', resolution: '', responsible: '', status: 'open' };

const QueryManagement = () => {
  const { user } = useAuth();
  const canEdit = canEditModule(user, 'query_management');

  const [queries, setQueries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchQueries = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/queries');
      setQueries(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load queries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueries();
    // Employee list for the "responsible employee" dropdown.
    api.get('/employees').then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (q) => {
    setEditingId(q._id);
    setForm({
      product: q.product || '',
      query: q.query || '',
      resolution: q.resolution || '',
      responsible: q.responsible?._id || '',
      status: q.status || 'open',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.product.trim()) return toast.error('Product is required');
    if (!form.query.trim()) return toast.error('Query is required');
    setSaving(true);
    try {
      const payload = { ...form, responsible: form.responsible || null };
      if (editingId) {
        await api.put(`/queries/${editingId}`, payload);
        toast.success('Query updated');
      } else {
        await api.post('/queries', payload);
        toast.success('Query added');
      }
      setModalOpen(false);
      fetchQueries();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save query');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this query?')) return;
    try {
      await api.delete(`/queries/${id}`);
      toast.success('Query deleted');
      setQueries(qs => qs.filter(q => q._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const filtered = queries.filter(q => {
    const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
    const s = search.trim().toLowerCase();
    const matchesSearch = !s ||
      q.product?.toLowerCase().includes(s) ||
      q.query?.toLowerCase().includes(s) ||
      q.responsible?.name?.toLowerCase().includes(s);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-violet-900">Query Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track product queries, resolutions, and who's responsible.</p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 self-start sm:self-auto">
            + Add Query
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="input-field text-sm flex-1"
          placeholder="Search by product, query, or employee…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input-field text-sm sm:w-48"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No queries yet"
          message={canEdit ? 'Add your first product query to get started.' : 'No queries have been added yet.'}
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-violet-50/60 text-left text-xs uppercase tracking-wide text-violet-500">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Query</th>
                  <th className="px-4 py-3 font-semibold">Resolution</th>
                  <th className="px-4 py-3 font-semibold">Responsible</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canEdit && <th className="px-4 py-3 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-50">
                {filtered.map(q => (
                  <tr key={q._id} className="hover:bg-violet-50/30">
                    <td className="px-4 py-3 font-medium text-violet-900 align-top">{q.product}</td>
                    <td className="px-4 py-3 text-gray-700 align-top max-w-xs">
                      <p className="whitespace-pre-wrap break-words">{q.query}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 align-top max-w-xs">
                      <p className="whitespace-pre-wrap break-words">{q.resolution || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 align-top">
                      {q.responsible
                        ? <span>{q.responsible.name}<span className="text-xs text-violet-400 block">{q.responsible.employeeId}</span></span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top"><StatusBadge status={q.status} /></td>
                    {canEdit && (
                      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                        <button onClick={() => openEdit(q)} className="text-violet-600 hover:text-violet-800 text-xs font-medium mr-3">Edit</button>
                        <button onClick={() => handleDelete(q._id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Query' : 'Add Query'}>
        <div className="space-y-4">
          <div>
            <label className="input-label text-sm">Product <span className="text-red-500">*</span></label>
            <input
              className="input-field text-sm"
              value={form.product}
              onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
              placeholder="Which product is the query about?"
            />
          </div>
          <div>
            <label className="input-label text-sm">Query <span className="text-red-500">*</span></label>
            <textarea
              className="input-field text-sm min-h-[80px]"
              value={form.query}
              onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
              placeholder="Describe the query…"
            />
          </div>
          <div>
            <label className="input-label text-sm">Resolution</label>
            <textarea
              className="input-field text-sm min-h-[80px]"
              value={form.resolution}
              onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))}
              placeholder="How was it resolved? (optional)"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="input-label text-sm">Responsible Employee</label>
              <select
                className="input-field text-sm"
                value={form.responsible}
                onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
              >
                <option value="">— Unassigned —</option>
                {employees.map(emp => (
                  <option key={emp._id} value={emp._id}>{emp.name} ({emp.employeeId})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label text-sm">Status</label>
              <select
                className="input-field text-sm"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm py-2 px-4">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Query'}
            </button>
            <button onClick={() => setModalOpen(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default QueryManagement;
