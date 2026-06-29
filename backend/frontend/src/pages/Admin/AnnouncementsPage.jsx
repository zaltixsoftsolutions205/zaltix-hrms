import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const priorityConfig = {
  urgent:    { label: 'Urgent',    bg: 'bg-gray-100',    text: 'text-gray-900',    border: 'border-gray-200',   dot: 'bg-gray-200' },
  important: { label: 'Important', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500' },
  normal:    { label: 'Normal',    bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200',  dot: 'bg-gray-400' },
};

const AnnouncementsPage = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', priority: 'normal', expiresAt: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await api.get('/announcements');
      setAnnouncements(r.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return toast.error('Title and content required');
    setSubmitting(true);
    try {
      await api.post('/announcements', {
        title: form.title,
        content: form.content,
        priority: form.priority,
        expiresAt: form.expiresAt || null,
      });
      toast.success('Announcement posted');
      setForm({ title: '', content: '', priority: 'normal', expiresAt: '' });
      setShowForm(false);
      fetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      toast.success('Deleted');
      setAnnouncements(prev => prev.filter(a => a._id !== id));
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Announcements</h2>
          <p className="page-subtitle">Post notices visible to all employees</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm">
          {showForm ? 'Cancel' : '+ New Announcement'}
        </button>
      </div>

      {/* Post Form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4">
          <h3 className="font-bold text-violet-900 mb-4">New Announcement</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-text">Title *</label>
              <input
                className="input-field"
                placeholder="e.g. Office closed on Friday"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="label-text">Content *</label>
              <textarea
                className="input-field resize-none"
                rows={4}
                placeholder="Announcement details..."
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label-text">Priority</label>
                <select className="input-field" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="label-text">Expires On (optional)</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.expiresAt}
                  onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary btn-sm">
                {submitting ? 'Posting...' : 'Post Announcement'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-center text-sm text-violet-400 py-8">Loading...</p>
      ) : announcements.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-violet-400 text-sm">No announcements yet.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-3">Post First Announcement</button>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(ann => {
            const cfg = priorityConfig[ann.priority] || priorityConfig.normal;
            const expired = ann.expiresAt && new Date(ann.expiresAt) < new Date();
            return (
              <motion.div key={ann._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`glass-card p-4 border-l-4 ${ann.priority === 'urgent' ? 'border-l-red-500' : ann.priority === 'important' ? 'border-l-amber-500' : 'border-l-violet-300'} ${expired ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="font-bold text-violet-900">{ann.title}</h4>
                      {ann.priority !== 'normal' && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      )}
                      {expired && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">Expired</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{ann.content}</p>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-violet-400">
                      <span>Posted by {ann.createdBy?.name}</span>
                      <span>{new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      {ann.expiresAt && !expired && (
                        <span>Expires {new Date(ann.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(ann._id)}
                    className="text-xs font-semibold text-gray-900 hover:text-gray-900 flex-shrink-0 mt-0.5">
                    Delete
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnnouncementsPage;
