import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatDate } from '../../utils/helpers';

export default function RecruitmentProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', department: '', location: '', type: 'full-time', openings: 1, description: '', requirements: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pRes, jRes, sRes] = await Promise.all([
        api.get('/recruitment/projects'),
        api.get('/recruitment/jobs?projectId=' + projectId),
        api.get('/recruitment/stats?projectId=' + projectId),
      ]);
      const found = pRes.data.find(p => p._id === projectId);
      setProject(found || null);
      setJobs(jRes.data);
      setStats(sRes.data);
    } catch {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [projectId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    setSubmitting(true);
    try {
      const r = await api.post('/recruitment/jobs', { ...form, project: projectId });
      setJobs(prev => [r.data, ...prev]);
      setForm({ title: '', department: '', location: '', type: 'full-time', openings: 1, description: '', requirements: '' });
      setShowForm(false);
      toast.success('Job posted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this job posting and all its applicants?')) return;
    try {
      await api.delete('/recruitment/jobs/' + id);
      setJobs(prev => prev.filter(j => j._id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed');
    }
  };

  const handleStatusChange = async (jobId, status) => {
    try {
      const r = await api.put('/recruitment/jobs/' + jobId, { status });
      setJobs(prev => prev.map(j => j._id === jobId ? { ...j, status: r.data.status } : j));
    } catch {
      toast.error('Failed to update');
    }
  };

  const filtered = jobs.filter(j => tab === 'all' ? true : j.status === tab);

  if (loading) return <p className="text-center text-sm text-violet-400 py-16">Loading...</p>;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/recruitment')} className="p-2 rounded-xl hover:bg-violet-50 transition-colors">
          <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1">
          <h2 className="page-title">{project?.name || 'Project'}</h2>
          <p className="page-subtitle">{project?.description || 'Job postings and candidate pipeline'}</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm">
          {showForm ? 'Cancel' : '+ Post Job'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {[
            { label: 'Open Jobs',     val: stats.totalJobs,       cls: 'text-violet-700 bg-violet-50 border-violet-200' },
            { label: 'Resumes',       val: stats.totalApplicants, cls: 'text-gray-700 bg-gray-50 border-gray-200' },
            { label: 'Interested',    val: stats.interested,      cls: 'text-violet-700 bg-violet-50 border-violet-200' },
            { label: 'Not Interested',val: stats.notInterested,   cls: 'text-gray-600 bg-gray-50 border-gray-200' },
            { label: 'Shortlisted',   val: stats.shortlisted,     cls: 'text-amber-700 bg-amber-50 border-amber-200' },
            { label: 'Processed',     val: stats.processed,       cls: 'text-violet-700 bg-violet-50 border-violet-200' },
            { label: 'Rejected',      val: stats.rejected,        cls: 'text-gray-900 bg-gray-100 border-gray-200' },
            { label: 'Joined',        val: stats.joined,          cls: 'text-violet-700 bg-violet-50 border-violet-200' },
          ].map(s => (
            <div key={s.label} className={'rounded-xl border px-2 py-2 text-center ' + s.cls}>
              <p className="text-xl font-bold">{s.val ?? 0}</p>
              <p className="text-[10px] font-semibold leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Post Job Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card p-4">
            <h3 className="font-bold text-violet-900 mb-3">New Job Posting</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="label-text">Job Title *</label>
                  <input className="input-field" placeholder="e.g. React Developer" value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">Department</label>
                  <input className="input-field" placeholder="Engineering" value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">Location</label>
                  <input className="input-field" placeholder="Remote / Delhi" value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">Type</label>
                  <select className="input-field" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="label-text">Openings</label>
                  <input type="number" min="1" className="input-field" value={form.openings}
                    onChange={e => setForm(f => ({ ...f, openings: e.target.value }))} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Description</label>
                  <textarea rows={3} className="input-field" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">Requirements</label>
                  <textarea rows={3} className="input-field" value={form.requirements}
                    onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary btn-sm">{submitting ? 'Posting...' : 'Post Job'}</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 bg-violet-50 rounded-xl p-1 w-fit">
        {['open', 'on-hold', 'closed', 'all'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ' + (tab === t ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-400 hover:text-violet-600')}>
            {t === 'all' ? 'All' : t === 'on-hold' ? 'On Hold' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Jobs Grid */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-gray-500 font-semibold mb-1">No jobs found</p>
          <p className="text-sm text-gray-400">Post a job to start building your pipeline.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(job => (
            <motion.div key={job._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all group"
              onClick={() => navigate('/admin/recruitment/' + job._id)}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-violet-900 group-hover:text-violet-700 transition-colors truncate">{job.title}</h3>
                  {job.department && <p className="text-xs text-gray-500 truncate">{job.department}</p>}
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(job._id); }}
                  className="ml-2 text-gray-900 hover:text-gray-900 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {job.location && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{job.location}</span>}
                <span className="text-[10px] bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">{job.type}</span>
                <span className="text-[10px] bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">{job.openings} opening{job.openings !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-sm font-bold text-gray-700">{job.applicantCount ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Resumes</p>
                </div>
                <div className="flex-1 bg-amber-50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-sm font-bold text-amber-700">{job.shortlistedCount ?? 0}</p>
                  <p className="text-[10px] text-amber-600">Shortlisted</p>
                </div>
                <div className="flex-1 bg-violet-50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-sm font-bold text-violet-700">{job.joinedCount ?? 0}</p>
                  <p className="text-[10px] text-violet-600">Joined</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-2" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] text-gray-400">{formatDate(job.createdAt)}</span>
                <select value={job.status} onClick={e => e.stopPropagation()} onChange={e => handleStatusChange(job._id, e.target.value)}
                  className={'text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer ' + (job.status === 'open' ? 'bg-violet-100 text-violet-700' : job.status === 'on-hold' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>
                  <option value="open">Open</option>
                  <option value="on-hold">On Hold</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
