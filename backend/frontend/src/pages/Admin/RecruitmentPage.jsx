import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { formatDate } from '../../utils/helpers';
import Modal from '../../components/UI/Modal';

const Icon = ({ d, size = 16, className = '', strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const IC = {
  folder:  "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  plus:    "M12 4v16m8-8H4",
  arrow:   "M9 5l7 7-7 7",
  users:   "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  job:     "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  star:    "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  pencil:  "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash:   "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  chart:   "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
};

/* ── Pipeline stage badge ── */
const PipelineBadge = ({ label, count, total, color }) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <p className={`text-[10px] font-semibold ${color.text}`}>{label}</p>
        <p className={`text-[10px] font-bold ${color.text}`}>{count}</p>
      </div>
      <div className={`h-1 rounded-full ${color.bg}`}>
        <div className={`h-full rounded-full ${color.fill} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const PALETTE = [
  { bg: 'bg-violet-600', icon: 'text-white', card: 'bg-violet-50 border-violet-100', metric: 'text-violet-700', fill: 'bg-violet-500', textBg: 'bg-violet-100 text-violet-700' },
  { bg: 'bg-amber-500',  icon: 'text-white', card: 'bg-amber-50  border-amber-100',  metric: 'text-amber-700',  fill: 'bg-amber-400',  textBg: 'bg-amber-100  text-amber-700'  },
  { bg: 'bg-blue-600',   icon: 'text-white', card: 'bg-blue-50   border-blue-100',   metric: 'text-blue-700',   fill: 'bg-blue-500',   textBg: 'bg-blue-100   text-blue-700'   },
  { bg: 'bg-emerald-600',icon: 'text-white', card: 'bg-emerald-50 border-emerald-100',metric:'text-emerald-700',fill: 'bg-emerald-500', textBg: 'bg-emerald-100 text-emerald-700'},
  { bg: 'bg-rose-500',   icon: 'text-white', card: 'bg-rose-50    border-rose-100',  metric: 'text-rose-700',   fill: 'bg-rose-400',   textBg: 'bg-rose-100   text-rose-700'   },
];
const palette = (i) => PALETTE[i % PALETTE.length];

/* ══════════════════════ COMPONENT ══════════════════════ */
export default function RecruitmentPage() {
  const navigate = useNavigate();
  const [projects, setProjects]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [editForm, setEditForm]     = useState({ name: '', description: '' });

  const fetchProjects = async () => {
    setLoading(true);
    try { const r = await api.get('/recruitment/projects'); setProjects(r.data); }
    catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchProjects(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Project name required');
    setSubmitting(true);
    try {
      const r = await api.post('/recruitment/projects', form);
      setProjects(prev => [r.data, ...prev]);
      setForm({ name: '', description: '' });
      setShowForm(false);
      toast.success('Project created');
      navigate('/admin/recruitment/p/' + r.data._id);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) return toast.error('Name required');
    try {
      await api.put('/recruitment/projects/' + editProject._id, editForm);
      setProjects(prev => prev.map(p => p._id === editProject._id ? { ...p, ...editForm } : p));
      setEditProject(null); toast.success('Updated');
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project? Jobs will be unassigned.')) return;
    try {
      await api.delete('/recruitment/projects/' + id);
      setProjects(prev => prev.filter(p => p._id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  };

  /* ── aggregate stats ── */
  const totalJobs      = projects.reduce((s, p) => s + (p.jobCount || 0), 0);
  const totalResumes   = projects.reduce((s, p) => s + (p.resumeCount || 0), 0);
  const totalShortlist = projects.reduce((s, p) => s + (p.shortlisted || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Recruitment</h2>
          <p className="text-sm text-gray-400 mt-0.5">Manage hiring projects, job postings and candidate pipelines</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 transition-colors shadow-sm">
          <Icon d={IC.plus} size={13} className="text-white" />
          {showForm ? 'Cancel' : 'New Project'}
        </button>
      </div>

      {/* ── Pipeline overview stats ── */}
      {projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Jobs',      value: totalJobs,      icon: IC.job,   bg: 'bg-violet-50 border-violet-100', text: 'text-violet-700' },
            { label: 'Total Resumes',   value: totalResumes,   icon: IC.users, bg: 'bg-blue-50   border-blue-100',   text: 'text-blue-700'   },
            { label: 'Shortlisted',     value: totalShortlist, icon: IC.star,  bg: 'bg-amber-50  border-amber-100',  text: 'text-amber-700'  },
          ].map(s => (
            <div key={s.label} className={`bg-white border border-gray-100 rounded-2xl p-5 shadow-sm`}>
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3 ${s.bg} ${s.text}`}>
                <Icon d={s.icon} size={16} />
              </div>
              <p className={`text-3xl font-extrabold leading-none ${s.text}`}>{s.value}</p>
              <p className="text-xs text-gray-400 font-medium mt-1">{s.label}</p>
              {/* Pipeline bar */}
              {totalResumes > 0 && s.label !== 'Total Jobs' && (
                <div className="mt-3 h-1 bg-gray-100 rounded-full">
                  <div className={`h-full rounded-full ${s.text.replace('text', 'bg')} transition-all duration-700`}
                    style={{ width: `${Math.min(100, (s.value / totalResumes) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Hiring pipeline visualization (when projects exist) ── */}
      {projects.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="font-bold text-gray-900 text-sm mb-4">Hiring Funnel</p>
          <div className="flex items-stretch gap-2">
            {[
              { label: 'Applied',     value: totalResumes,                     pct: 100,                                          color: 'bg-violet-100 text-violet-700',    bar: 'bg-violet-500' },
              { label: 'Shortlisted', value: totalShortlist,                   pct: totalResumes > 0 ? (totalShortlist / totalResumes) * 100 : 0,  color: 'bg-amber-100 text-amber-700',      bar: 'bg-amber-500'  },
              { label: 'Jobs Open',   value: totalJobs,                        pct: null,                                         color: 'bg-blue-100 text-blue-700',        bar: 'bg-blue-500'   },
              { label: 'Projects',    value: projects.length,                  pct: null,                                         color: 'bg-gray-100 text-gray-600',        bar: 'bg-gray-400'   },
            ].map((stage, i) => (
              <div key={stage.label} className={`flex-1 rounded-xl px-3 py-3 ${stage.color}`}>
                <p className="text-2xl font-extrabold leading-none">{stage.value}</p>
                <p className="text-[10px] font-semibold mt-1 opacity-70">{stage.label}</p>
                {stage.pct !== null && (
                  <div className="mt-2 h-0.5 bg-white/50 rounded-full">
                    <div className={`h-full rounded-full ${stage.bar} transition-all duration-700`}
                      style={{ width: `${stage.pct}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Create form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 text-sm mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                <Icon d={IC.plus} size={12} className="text-violet-600" />
              </span>
              New Project
            </h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Project Name *</label>
                  <input className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g. Lancesoft" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                  <input className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Short description (optional)" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50">
                  {submitting ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Projects grid ── */}
      {loading ? (
        <div className="py-16 text-center text-gray-300 text-sm">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center shadow-sm">
          <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Icon d={IC.folder} size={28} className="text-violet-300" />
          </div>
          <p className="text-gray-500 font-bold mb-1">No projects yet</p>
          <p className="text-sm text-gray-400 mb-4">Create a project to organise your recruitment pipeline.</p>
          <button onClick={() => setShowForm(true)}
            className="px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors">
            Create First Project
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project, idx) => {
            const pal = palette(idx);
            const fillPct = project.resumeCount > 0
              ? Math.min(100, (project.shortlisted / project.resumeCount) * 100)
              : 0;
            return (
              <motion.div key={project._id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                onClick={() => navigate('/admin/recruitment/p/' + project._id)}
                className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">

                {/* Project header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className={`${pal.bg} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon d={IC.folder} size={18} className={pal.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 group-hover:text-violet-700 transition-colors truncate">{project.name}</h3>
                    {project.description && <p className="text-[11px] text-gray-400 truncate mt-0.5">{project.description}</p>}
                  </div>
                  <Icon d={IC.arrow} size={14} className="text-gray-300 group-hover:text-violet-500 flex-shrink-0 mt-1 transition-colors" />
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: 'Jobs',        value: project.jobCount,    color: pal.metric },
                    { label: 'Resumes',     value: project.resumeCount, color: 'text-gray-600' },
                    { label: 'Shortlisted', value: project.shortlisted, color: 'text-amber-600' },
                  ].map(m => (
                    <div key={m.label} className="text-center py-2 bg-gray-50 rounded-xl">
                      <p className={`text-xl font-extrabold leading-none ${m.color}`}>{m.value}</p>
                      <p className="text-[9px] text-gray-400 font-medium mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Shortlist progress bar */}
                {project.resumeCount > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[9px] text-gray-400 font-medium">Shortlist rate</p>
                      <p className="text-[9px] font-bold text-amber-600">{fillPct.toFixed(0)}%</p>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${fillPct}%` }} />
                    </div>
                  </div>
                )}

                {/* Status indicator */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-50"
                  onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      project.jobCount > 0 ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {project.jobCount > 0 ? `${project.jobCount} open ${project.jobCount === 1 ? 'role' : 'roles'}` : 'No jobs yet'}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setEditProject(project); setEditForm({ name: project.name, description: project.description || '' }); }}
                      className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-violet-600 transition-colors">
                      <Icon d={IC.pencil} size={11} />Rename
                    </button>
                    <button onClick={() => handleDelete(project._id)}
                      className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-red-500 transition-colors">
                      <Icon d={IC.trash} size={11} />Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      <Modal isOpen={!!editProject} onClose={() => setEditProject(null)} title="Rename Project" size="sm">
        {editProject && (
          <form onSubmit={handleUpdate} className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Project Name *</label>
              <input className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
              <input className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => setEditProject(null)}
                className="px-4 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button type="submit"
                className="px-4 py-2 text-sm font-semibold bg-violet-600 text-white rounded-xl hover:bg-violet-700">Save</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
