import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import Card from '../../../../components/UI/Card';
import Modal from '../../../../components/UI/Modal';
import EmptyState from '../../../../components/UI/EmptyState';
import { formatCurrency, formatDate } from '../../../../utils/helpers';
import IncomeForm from './IncomeForm';

const SI = ({ d, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />
  </svg>
);

const CATEGORY_FILTERS = [
  { value: '',                  label: 'All' },
  { value: 'deal',              label: 'Deal' },
  { value: 'client_payment',    label: 'Client Payment' },
  { value: 'investment',        label: 'Investment' },
  { value: 'product_sale',      label: 'Product Sale' },
  { value: 'talent_acquisition',label: 'Talent Acquisition' },
  { value: 'general',           label: 'General' },
];

const CATEGORY_BADGE = {
  deal:               'bg-violet-100 text-violet-700',
  client_payment:     'bg-violet-100 text-violet-700',
  investment:         'bg-violet-100 text-violet-700',
  product_sale:       'bg-amber-100 text-amber-700',
  talent_acquisition: 'bg-gray-100 text-gray-900',
  general:            'bg-gray-100 text-gray-700',
  manual:             'bg-violet-100 text-violet-700',
};

const categoryLabel = (item) => {
  if (item.type === 'deal') return 'Deal';
  const map = {
    client_payment:     'Client Payment',
    investment:         'Investment',
    product_sale:       'Product Sale',
    talent_acquisition: 'Talent Acquisition',
    general:            'General',
  };
  return map[item.category] || 'Manual';
};

const IncomeList = ({ month, year, refresh, onRefresh, canAdd = false }) => {
  const [income, setIncome] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchIncome();
  }, [month, year, categoryFilter, refresh]);

  const fetchIncome = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month, year });
      if (categoryFilter === 'deal') {
        params.set('type', 'deal');
      } else if (categoryFilter) {
        params.set('type', 'manual');
        params.set('category', categoryFilter);
      }
      const res = await api.get(`/finance/income?${params}`);
      setIncome(res.data.income);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this income entry?')) return;
    try {
      await api.delete(`/finance/income/${id}`);
      toast.success('Income deleted');
      fetchIncome();
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="filter-bar">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setCategoryFilter(f.value)}
                className={categoryFilter === f.value ? 'filter-pill-active' : 'filter-pill-inactive'}
              >
                {f.label}
              </button>
            ))}
          </div>
          {canAdd && (
            <button onClick={() => setShowAddModal(true)} className="btn-primary btn-sm">
              + Add Income
            </button>
          )}
        </div>
      </Card>

      {/* Income Table */}
      <Card>
        {loading ? (
          <p className="text-center text-gray-400 py-8 text-sm">Loading...</p>
        ) : income.length === 0 ? (
          <EmptyState
            icon={
              <SI
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                size={40}
                color="text-violet-400"
              />
            }
            title="No income entries"
            message="Income will appear here. Deal revenue auto-syncs from CRM."
          />
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="data-table min-w-[600px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Service Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {income.map((item) => (
                  <tr key={item._id}>
                    <td className="text-sm">{formatDate(item.date)}</td>
                    <td>
                      <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${CATEGORY_BADGE[item.type === 'deal' ? 'deal' : (item.category || 'general')]}`}>
                        {categoryLabel(item)}
                      </span>
                    </td>
                    <td className="text-sm text-gray-600">{item.description || '—'}</td>
                    <td className="font-semibold text-violet-600">{formatCurrency(item.amount)}</td>
                    <td className="text-xs text-gray-500">{item.serviceType || '—'}</td>
                    <td>
                      {item.type === 'manual' && canAdd && (
                        <button
                          onClick={() => handleDelete(item._id)}
                          className="text-gray-900 hover:text-gray-900 text-xs font-semibold"
                        >
                          Delete
                        </button>
                      )}
                      {item.type === 'deal' && (
                        <span className="text-xs text-gray-400">Auto-synced</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Modal */}
      <Modal isOpen={canAdd && showAddModal} onClose={() => setShowAddModal(false)} title="Add Income">
        <IncomeForm
          onSuccess={() => {
            setShowAddModal(false);
            fetchIncome();
            onRefresh();
          }}
          onClose={() => setShowAddModal(false)}
        />
      </Modal>
    </div>
  );
};

export default IncomeList;
