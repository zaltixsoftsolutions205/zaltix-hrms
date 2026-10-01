import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/helpers';

const STATUS = {
  pending: { label: 'Pending', chip: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', chip: 'bg-rose-100 text-rose-600', dot: 'bg-rose-500' },
};

const ExpenseClaimsReview = () => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);

  const load = () => api.get('/expense-claims')
    .then(r => setClaims(r.data || []))
    .catch(() => toast.error('Could not load claims'))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const review = async (id, status) => {
    let reviewNote = '';
    if (status === 'rejected') {
      reviewNote = window.prompt('Reason for rejection (optional):') || '';
    }
    setBusyId(id);
    try {
      await api.put(`/expense-claims/${id}/review`, { status, reviewNote });
      toast.success(`Claim ${status}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setBusyId(null); }
  };

  const shown = claims.filter(c => filter === 'all' || c.status === filter);
  const pendingCount = claims.filter(c => c.status === 'pending').length;
  const pendingTotal = claims.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Expense Claims</h2>
        <p className="text-sm text-gray-400 mt-0.5">Review and approve employee reimbursement claims</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="border rounded-2xl px-4 py-3 bg-amber-50/70 border-amber-200/70">
          <p className="text-lg font-extrabold text-amber-700 tabular-nums">{pendingCount}</p>
          <p className="text-[11px] text-gray-500 font-semibold mt-1">Pending review</p>
        </div>
        <div className="border rounded-2xl px-4 py-3 bg-violet-50/70 border-violet-200/70">
          <p className="text-lg font-extrabold text-violet-700 tabular-nums">{formatCurrency(pendingTotal)}</p>
          <p className="text-[11px] text-gray-500 font-semibold mt-1">Pending amount</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {['pending', 'approved', 'rejected', 'all'].map(k => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter === k ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {k}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-300 text-sm">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-500">No {filter === 'all' ? '' : filter} claims</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map(c => {
            const st = STATUS[c.status] || STATUS.pending;
            return (
              <div key={c._id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-sm">{c.employee?.name || 'Unknown'}</p>
                      <span className="text-[11px] text-gray-400">{c.employee?.employeeId}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-600 capitalize font-semibold">{c.category.replace('-', ' ')}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${st.chip}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 break-words">{c.description}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Incurred {formatDate(c.date)} · Submitted {formatDate(c.createdAt)}
                      {c.receiptFileName && (
                        <> · <a href={`/uploads/expenses/${c.receiptFileName}`} target="_blank" rel="noreferrer" className="text-violet-600 font-semibold hover:underline">View receipt</a></>
                      )}
                    </p>
                    {c.reviewNote && (
                      <p className="text-[11px] text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-2 py-1">Note: {c.reviewNote}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-extrabold text-gray-900 tabular-nums">{formatCurrency(c.amount)}</p>
                    {c.status === 'pending' && (
                      <div className="flex gap-1.5 mt-2 justify-end">
                        <button disabled={busyId === c._id} onClick={() => review(c._id, 'rejected')}
                          className="px-3 py-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 disabled:opacity-50">Reject</button>
                        <button disabled={busyId === c._id} onClick={() => review(c._id, 'approved')}
                          className="px-3 py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                      </div>
                    )}
                    {c.status !== 'pending' && c.reviewedBy && (
                      <p className="text-[10px] text-gray-400 mt-1">by {c.reviewedBy.name}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExpenseClaimsReview;
