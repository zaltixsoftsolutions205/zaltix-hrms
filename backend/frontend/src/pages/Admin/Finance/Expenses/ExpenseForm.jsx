import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';

const ExpenseForm = ({ onSuccess, onClose }) => {
  const [form, setForm] = useState({
    category: 'operational',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    notes: '',
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const categories = ['salary', 'commission', 'rent', 'software', 'marketing', 'operational', 'miscellaneous'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category || !form.amount || parseFloat(form.amount) <= 0 || !form.date || !form.description) {
      return toast.error('Category, amount, date, and description are required');
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('category', form.category);
      formData.append('amount', parseFloat(form.amount));
      formData.append('date', form.date);
      formData.append('description', form.description);
      formData.append('notes', form.notes);
      if (file) {
        formData.append('receipt', file);
      }

      await api.post('/finance/expenses', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Expense added');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="input-label">Category *</label>
        <select
          className="input-field"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          required
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="input-label">Amount (₹) *</label>
        <input
          type="text"
          inputMode="decimal"
          className="input-field"
          value={form.amount}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || /^\d*\.?\d*$/.test(v)) setForm((f) => ({ ...f, amount: v }));
          }}
          placeholder="Enter amount"
          required
        />
      </div>

      <div>
        <label className="input-label">Date *</label>
        <input
          type="date"
          className="input-field"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          required
        />
      </div>

      <div>
        <label className="input-label">Description *</label>
        <input
          type="text"
          className="input-field"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="What is this expense for?"
          required
        />
      </div>

      <div>
        <label className="input-label">Receipt/Invoice (Optional)</label>
        <input
          type="file"
          className="input-field"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          accept=".jpg,.jpeg,.png,.pdf"
        />
        <p className="text-xs text-gray-500 mt-1">Allowed: JPG, PNG, PDF (Max 5MB)</p>
        {file && <p className="text-xs text-violet-600 mt-1">✓ {file.name}</p>}
      </div>

      <div>
        <label className="input-label">Notes</label>
        <textarea
          className="input-field"
          rows={3}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Additional notes..."
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? 'Adding...' : 'Add Expense'}
        </button>
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default ExpenseForm;
