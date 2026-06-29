import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import Badge from '../../components/UI/Badge';
import EmptyState from '../../components/UI/EmptyState';
import { formatDate } from '../../utils/helpers';

const SI = ({ d, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />
  </svg>
);

const FILTERS = ['pending', 'approved', 'rejected', 'all'];

const TimesheetApprovals = () => {
  const [timesheets, setTimesheets] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [reviewing, setReviewing] = useState(null); // { ts, action }
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      const params = filter === 'all' ? {} : { status: filter };
      const res = await api.get('/timesheets/approvals', { params });
      setTimesheets(res.data);
    } catch {}
  };
  useEffect(() => { fetchData(); }, [filter]);

  const openReview = (ts, action) => {
    setReviewing({ ts, action });
    setComments('');
  };

  const submitReview = async () => {
    if (!reviewing) return;
    setLoading(true);
    try {
      await api.put(`/timesheets/${reviewing.ts._id}/review`, {
        status: reviewing.action,
        comments,
      });
      toast.success(`Timesheet ${reviewing.action}`);
      setReviewing(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-violet-900 text-sm sm:text-base">Timesheet Approvals</h3>
            <p className="text-xs text-violet-500 mt-0.5">{timesheets.length} timesheet{timesheets.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-1 bg-violet-50 p-1 rounded-lg">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs font-medium px-3 py-1 rounded-md capitalize transition-colors ${
                  filter === f ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {timesheets.length === 0 ? (
          <EmptyState
            icon={<SI d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={40} color="text-violet-400" />}
            title="Nothing here"
            message={`No ${filter === 'all' ? '' : filter} timesheets routed to you.`}
          />
        ) : (
          <div className="space-y-3">
            {timesheets.map(ts => (
              <motion.div key={ts._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="p-3 sm:p-4 border border-violet-100 rounded-xl">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-violet-900 text-sm">{ts.employee?.name}</span>
                    <span className="text-xs text-violet-400">{ts.employee?.employeeId}</span>
                    <span className="text-violet-300">·</span>
                    <span className="text-xs text-violet-600">{formatDate(ts.date)}</span>
                    <span className="badge badge-violet">{ts.totalHours}h</span>
                    <Badge status={ts.status} />
                  </div>
                </div>
                <div className="space-y-1 mb-2">
                  {ts.entries.map((en, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs sm:text-sm">
                      <span className="text-violet-400 font-medium whitespace-nowrap">{en.hours}h</span>
                      <span className="text-gray-700">
                        {en.project && <span className="font-medium text-violet-700">{en.project} · </span>}
                        {en.task}
                        {en.description && <span className="text-gray-500"> — {en.description}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                {ts.reviewerComments && (
                  <p className="text-xs text-violet-500 italic mb-2">Note: {ts.reviewerComments}</p>
                )}
                {ts.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => openReview(ts, 'approved')} className="btn-primary btn-sm">Approve</button>
                    <button onClick={() => openReview(ts, 'rejected')} className="btn-secondary btn-sm">Reject</button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={!!reviewing} onClose={() => setReviewing(null)}
        title={reviewing?.action === 'approved' ? 'Approve Timesheet' : 'Reject Timesheet'}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {reviewing?.action === 'approved' ? 'Approve' : 'Reject'} {reviewing?.ts.employee?.name}'s timesheet
            for {reviewing && formatDate(reviewing.ts.date)} ({reviewing?.ts.totalHours}h)?
          </p>
          <div>
            <label className="input-label">Comments (optional)</label>
            <textarea className="input-field" rows={3} value={comments}
              onChange={e => setComments(e.target.value)} placeholder="Add a note for the employee..." />
          </div>
          <div className="flex gap-3">
            <button onClick={submitReview} className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Saving...' : `Confirm ${reviewing?.action === 'approved' ? 'Approval' : 'Rejection'}`}
            </button>
            <button onClick={() => setReviewing(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TimesheetApprovals;
