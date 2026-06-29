import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatDate, getUploadUrl } from '../../utils/helpers';
import Modal from '../../components/UI/Modal';

const STATUSES = [
  { key: 'interested',     label: 'Interested',     bg: 'bg-violet-100',   text: 'text-violet-700',   dot: 'bg-violet-500',   border: 'border-violet-300'   },
  { key: 'not-interested', label: 'Not Interested', bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   border: 'border-gray-300'   },
  { key: 'shortlisted',    label: 'Shortlisted',    bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-300'  },
  { key: 'processed',      label: 'Processed',      bg: 'bg-violet-100', text: 'text-violet-700', dot: 'bg-violet-500', border: 'border-violet-300' },
  { key: 'rejected',       label: 'Rejected',       bg: 'bg-gray-100',    text: 'text-gray-900',    dot: 'bg-gray-200',    border: 'border-gray-300'    },
  { key: 'onboarded',      label: 'Onboarded',      bg: 'bg-violet-100',   text: 'text-violet-700',   dot: 'bg-violet-500',   border: 'border-violet-300'   },
  { key: 'joined',         label: 'Joined',         bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500',  border: 'border-violet-300'  },
];

const JOB_TYPES  = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', internship: 'Internship' };
const JOB_STATUS = {
  open:      { label: 'Open',    bg: 'bg-violet-100', text: 'text-violet-700', dot: 'bg-violet-500'  },
  'on-hold': { label: 'On Hold', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500'  },
  closed:    { label: 'Closed',  bg: 'bg-gray-100',  text: 'text-gray-600',  dot: 'bg-gray-400'   },
};

const statusOf = (key) => STATUSES.find(s => s.key === key) || STATUSES[0];

const downloadFile = async (url, filename) => {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename || 'resume';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    toast.error('Download failed');
  }
};

/* ── Resume card ── */
const ResumeCard = ({ app, onClick }) => {
  const st = statusOf(app.status);
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-gray-100 hover:shadow-md hover:border-violet-200 transition-all cursor-pointer group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${st.bg} group-hover:scale-105 transition-transform`}>
          <span className={`text-sm font-bold ${st.text}`}>{app.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-violet-900 truncate">{app.name}</p>
          <p className="text-xs text-gray-400">
            {formatDate(app.createdAt)}
            {app.yearsOfExperience != null && (
              <span className="ml-2 text-violet-500 font-medium">{app.yearsOfExperience} yr{app.yearsOfExperience !== 1 ? 's' : ''} exp</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {app.resumeUrl ? (
          <>
            <a href={getUploadUrl(app.resumeUrl)} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View
            </a>
            <button
              onClick={e => { e.stopPropagation(); downloadFile(getUploadUrl(app.resumeUrl), `${app.name}_resume`); }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-300">No file</span>
        )}
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
          {st.label}
        </span>
      </div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════ */

const RecruitmentJobPage = () => {
  const { jobId }    = useParams();
  const navigate     = useNavigate();

  const [job, setJob]               = useState(null);
  const [resumes, setResumes]       = useState([]);
  const [loading, setLoading]       = useState(true);

  /* add-resume form */
  const [showForm, setShowForm]               = useState(false);
  const [resumeName, setResumeName]           = useState('');
  const [resumeFile, setResumeFile]           = useState(null);
  const [resumeStatus, setResumeStatus]       = useState('interested');
  const [resumeExpYears, setResumeExpYears]   = useState('');
  const [submitting, setSubmitting]           = useState(false);

  /* status filter */
  const [statusFilter, setStatusFilter] = useState('');

  /* detail modal */
  const [selected, setSelected] = useState(null);

  /* ── fetch ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, appRes] = await Promise.all([
        api.get('/recruitment/jobs'),
        api.get(`/recruitment/applicants?jobId=${jobId}`),
      ]);
      const found = jobsRes.data.find(j => j._id === jobId);
      if (!found) { toast.error('Job not found'); navigate('/admin/recruitment'); return; }
      setJob({ ...found, _projectId: found.project?._id || found.project || null });
      setResumes(appRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [jobId, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── job status change ── */
  const handleJobStatusChange = async (status) => {
    try {
      await api.put(`/recruitment/jobs/${jobId}`, { status });
      setJob(prev => ({ ...prev, status }));
      toast.success('Status updated');
    } catch { toast.error('Failed'); }
  };

  /* ── add resume ── */
  const handleAddResume = async (e) => {
    e.preventDefault();
    if (!resumeName.trim()) return toast.error('Name is required');
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('jobPosting', jobId);
      fd.append('name', resumeName.trim());
      fd.append('status', resumeStatus);
      if (resumeExpYears !== '') fd.append('yearsOfExperience', resumeExpYears);
      if (resumeFile) fd.append('resume', resumeFile);
      const r = await api.post('/recruitment/applicants', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Resume added');
      setResumes(prev => [r.data, ...prev]);
      setResumeName(''); setResumeFile(null); setResumeStatus('interested'); setResumeExpYears('');
      setShowForm(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  /* ── update status ── */
  const handleStatusChange = async (id, status) => {
    try {
      const r = await api.put(`/recruitment/applicants/${id}/status`, { status });
      setResumes(prev => prev.map(a => a._id === id ? r.data : a));
      if (selected?._id === id) setSelected(r.data);
      toast.success('Status updated');
    } catch { toast.error('Failed'); }
  };

  /* ── delete resume ── */
  const handleDelete = async (id) => {
    if (!window.confirm('Remove this resume?')) return;
    try {
      await api.delete(`/recruitment/applicants/${id}`);
      setResumes(prev => prev.filter(a => a._id !== id));
      setSelected(null);
      toast.success('Removed');
    } catch { toast.error('Failed'); }
  };

  /* filtered list */
  const filtered = statusFilter ? resumes.filter(a => a.status === statusFilter) : resumes;

  /* per-status counts */
  const counts = STATUSES.reduce((acc, s) => {
    acc[s.key] = resumes.filter(a => a.status === s.key).length;
    return acc;
  }, {});

  if (loading) return <div className="text-center py-20 text-violet-400 text-sm">Loading...</div>;
  if (!job)    return null;

  const jsCfg = JOB_STATUS[job.status] || JOB_STATUS.open;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">

      {/* ── Back + Header ── */}
      <div>
        <button onClick={() => navigate(job._projectId ? '/admin/recruitment/p/' + job._projectId : '/admin/recruitment')}
          className="inline-flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-700 font-semibold mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {job._projectId ? 'Back to Project' : 'Back to Recruitment'}
        </button>

        <div className="glass-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-2xl font-bold text-violet-900">{job.title}</h1>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-lg ${jsCfg.bg} ${jsCfg.text}`}>{jsCfg.label}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-lg font-semibold">{JOB_TYPES[job.type]}</span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                {job.department && <span className="flex items-center gap-1"><span className="text-gray-300">›</span>{job.department}</span>}
                {job.location   && <span className="flex items-center gap-1"><span className="text-gray-300">›</span>{job.location}</span>}
                <span className="flex items-center gap-1"><span className="text-gray-300">›</span>{job.openings} opening{job.openings > 1 ? 's' : ''}</span>
              </div>
              {job.description && <p className="text-sm text-gray-500 mt-2">{job.description}</p>}
              {job.requirements && <p className="text-xs text-gray-400 mt-1 italic">{job.requirements}</p>}
            </div>

            {/* Job status switcher */}
            <div className="flex gap-1.5 flex-shrink-0">
              {Object.entries(JOB_STATUS).map(([s, cfg]) => (
                <button key={s} onClick={() => handleJobStatusChange(s)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                    job.status === s
                      ? `${cfg.bg} ${cfg.text} border-transparent shadow-sm`
                      : 'border-gray-200 text-gray-400 hover:border-violet-300'
                  }`}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-status stat cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {STATUSES.map(s => (
          <button key={s.key}
            onClick={() => setStatusFilter(prev => prev === s.key ? '' : s.key)}
            className={`rounded-xl p-3 text-center transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${s.bg}
              ${statusFilter === s.key ? `ring-2 ${s.border} shadow-md -translate-y-0.5` : ''}`}
          >
            <span className={`text-2xl font-bold block ${s.text}`}>{counts[s.key]}</span>
            <span className={`text-[10px] font-semibold leading-tight block ${s.text}`}>{s.label}</span>
            {statusFilter === s.key && <span className={`text-[9px] font-bold block mt-0.5 opacity-60 ${s.text}`}>▲ filtered</span>}
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Active filter badge */}
          {statusFilter && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${statusOf(statusFilter).bg} ${statusOf(statusFilter).text}`}>
              <span className={`w-2 h-2 rounded-full ${statusOf(statusFilter).dot}`} />
              {statusOf(statusFilter).label}
              <button onClick={() => setStatusFilter('')} className="ml-1 opacity-60 hover:opacity-100 font-bold">×</button>
            </div>
          )}
          <span className="text-sm text-gray-400">
            {filtered.length} resume{filtered.length !== 1 ? 's' : ''}
            {statusFilter ? ` (filtered from ${resumes.length})` : ''}
          </span>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className={`btn-sm font-semibold text-sm px-4 py-2 rounded-lg transition-colors ${
            showForm ? 'bg-gray-100 text-gray-600' : 'bg-violet-600 text-white hover:bg-violet-700'
          }`}>
          {showForm ? '✕ Cancel' : '+ Add Resume'}
        </button>
      </div>

      {/* ── Add Resume Form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass-card p-4">
            <h3 className="font-bold text-violet-900 mb-4">Add Resume — {job.title}</h3>
            <form onSubmit={handleAddResume} className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="input-label">Candidate Name *</label>
                  <input className="input-field" placeholder="Full name" value={resumeName}
                    onChange={e => setResumeName(e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Years of Experience</label>
                  <input className="input-field" placeholder="e.g. 3" type="number" min="0" max="50"
                    value={resumeExpYears}
                    onChange={e => setResumeExpYears(e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Resume File</label>
                  <input type="file" className="input-field text-sm py-1.5"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={e => setResumeFile(e.target.files[0] || null)} />
                  <p className="text-[11px] text-gray-400 mt-0.5">PDF, DOC, DOCX, JPG — max 5 MB</p>
                </div>
                <div>
                  <label className="input-label">Initial Status</label>
                  <select className="input-field" value={resumeStatus}
                    onChange={e => setResumeStatus(e.target.value)}>
                    {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary btn-sm">
                  {submitting ? 'Adding...' : 'Add Resume'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Resume List ── */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 font-semibold">
            {statusFilter ? `No resumes with status "${statusOf(statusFilter).label}"` : 'No resumes yet'}
          </p>
          {!statusFilter && (
            <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-3">Add First Resume</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(app => (
            <ResumeCard key={app._id} app={app} onClick={() => setSelected(app)} />
          ))}
        </div>
      )}

      {/* ── Detail Modal ── */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Resume Details" size="md">
        {selected && (() => {
          const st = statusOf(selected.status);
          return (
            <div className="space-y-5">
              {/* Name + status */}
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold flex-shrink-0 ${st.bg} ${st.text}`}>
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-violet-900 text-xl">{selected.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                    <span className={`text-sm font-semibold ${st.text}`}>{st.label}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-6 text-sm text-gray-500">
                <div>
                  <span className="text-gray-400 text-xs">Added</span>
                  <p>{formatDate(selected.createdAt)}</p>
                </div>
                {selected.yearsOfExperience != null && (
                  <div>
                    <span className="text-gray-400 text-xs">Experience</span>
                    <p className="font-semibold text-violet-700">{selected.yearsOfExperience} yr{selected.yearsOfExperience !== 1 ? 's' : ''}</p>
                  </div>
                )}
              </div>

              {/* Resume file actions */}
              {selected.resumeUrl ? (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Resume Document</p>
                  <div className="flex gap-2">
                    <a href={getUploadUrl(selected.resumeUrl)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 text-violet-700 text-sm font-semibold hover:bg-violet-100 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </a>
                    <button
                      onClick={() => downloadFile(getUploadUrl(selected.resumeUrl), `${selected.name}_resume`)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 text-violet-700 text-sm font-semibold hover:bg-violet-100 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No resume file uploaded.</p>
              )}

              {/* Status update */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <button key={s.key} onClick={() => handleStatusChange(selected._id, s.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        selected.status === s.key
                          ? `${s.bg} ${s.text} ${s.border} shadow-sm`
                          : 'border-gray-200 text-gray-500 hover:border-violet-300'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {selected.status === 'joined' && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-sm text-violet-700">
                  <p className="font-semibold">Candidate Joined!</p>
                  <p className="text-xs mt-0.5">Go to <strong>Employees &rarr; Add Employee</strong> to onboard them.</p>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100">
                <button onClick={() => handleDelete(selected._id)}
                  className="text-xs font-semibold text-gray-900 border border-gray-200 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors">
                  Remove Resume
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default RecruitmentJobPage;
