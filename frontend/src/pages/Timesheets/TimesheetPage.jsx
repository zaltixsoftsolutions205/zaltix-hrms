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

const emptyEntry = () => ({ project: '', task: '', hours: '', description: '' });

const TimesheetPage = () => {
  const [timesheets, setTimesheets] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState([emptyEntry()]);

  const fetchData = async () => {
    try {
      const res = await api.get('/timesheets/my');
      setTimesheets(res.data);
    } catch {}
  };
  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setEntries([emptyEntry()]);
    setShowModal(true);
  };

  const openEdit = (ts) => {
    setDate(new Date(ts.date).toISOString().split('T')[0]);
    setEntries(ts.entries.length ? ts.entries.map(e => ({ ...e, hours: String(e.hours) })) : [emptyEntry()]);
    setShowModal(true);
  };

  const updateEntry = (i, field, value) =>
    setEntries(es => es.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  const addEntry = () => setEntries(es => [...es, emptyEntry()]);
  const removeEntry = (i) => setEntries(es => es.length > 1 ? es.filter((_, idx) => idx !== i) : es);

  const totalHours = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const clean = entries
      .filter(en => en.task.trim())
      .map(en => ({
        project: en.project.trim(),
        task: en.task.trim(),
        hours: parseFloat(en.hours) || 0,
        description: en.description.trim(),
      }));
    if (clean.length === 0) return toast.error('Add at least one task.');

    setLoading(true);
    try {
      await api.post('/timesheets', { date, entries: clean });
      toast.success('Timesheet submitted!');
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-violet-900 text-sm sm:text-base">My Timesheets</h3>
            <p className="text-xs text-violet-500 mt-0.5">{timesheets.length} day{timesheets.length !== 1 ? 's' : ''} logged</p>
          </div>
          <button onClick={openNew} className="btn-primary btn-sm">+ Log Time</button>
        </div>

        {timesheets.length === 0 ? (
          <EmptyState
            icon={<SI d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={40} color="text-violet-400" />}
            title="No timesheets yet"
            message="Log the hours you worked each day for approval."
            action={{ label: 'Log Time', onClick: openNew }}
          />
        ) : (
          <div className="space-y-3">
            {timesheets.map(ts => (
              <motion.div key={ts._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="p-3 sm:p-4 border border-violet-100 rounded-xl hover:bg-violet-50/40 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-violet-900 text-sm">{formatDate(ts.date)}</span>
                    <span className="badge badge-violet">{ts.totalHours}h</span>
                    <Badge status={ts.status} />
                    {ts.routedTo && (
                      <span className="text-xs text-violet-400">→ {ts.routedTo.name}</span>
                    )}
                  </div>
                  {ts.status !== 'approved' && (
                    <button onClick={() => openEdit(ts)} className="text-xs text-violet-600 font-medium hover:underline flex-shrink-0">Edit</button>
                  )}
                </div>
                <div className="space-y-1">
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
                  <p className="text-xs text-violet-500 mt-2 italic">Note: {ts.reviewerComments}</p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Log Timesheet">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">Date</label>
            <input type="date" className="input-field" required value={date}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setDate(e.target.value)} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="input-label mb-0">Tasks</label>
              <span className="text-xs text-violet-500">Total: <b>{totalHours}h</b></span>
            </div>
            {entries.map((en, i) => (
              <div key={i} className="p-3 bg-violet-50 rounded-lg border border-violet-100 space-y-2">
                <div className="flex gap-2">
                  <input className="input-field flex-1" placeholder="Task *" required value={en.task}
                    onChange={e => updateEntry(i, 'task', e.target.value)} />
                  <input className="input-field w-20" type="number" step="0.5" min="0" max="24" placeholder="Hrs *" required value={en.hours}
                    onChange={e => updateEntry(i, 'hours', e.target.value)} />
                  {entries.length > 1 && (
                    <button type="button" onClick={() => removeEntry(i)}
                      className="text-red-400 hover:text-red-600 px-1" title="Remove">
                      <SI d="M6 18L18 6M6 6l12 12" size={16} />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input className="input-field flex-1 text-xs" placeholder="Project (optional)" value={en.project}
                    onChange={e => updateEntry(i, 'project', e.target.value)} />
                  <input className="input-field flex-1 text-xs" placeholder="Notes (optional)" value={en.description}
                    onChange={e => updateEntry(i, 'description', e.target.value)} />
                </div>
              </div>
            ))}
            <button type="button" onClick={addEntry} className="text-sm text-violet-600 font-medium hover:underline">
              + Add task
            </button>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Timesheet'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TimesheetPage;
