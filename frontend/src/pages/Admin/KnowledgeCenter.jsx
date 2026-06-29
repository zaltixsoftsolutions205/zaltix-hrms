import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';

const CATEGORIES = [
  { value: 'company_overview',    label: 'Company Overview',    bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500' },
  { value: 'department_training', label: 'Department Training', bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'   },
  { value: 'work_processes',      label: 'Work Processes',      bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500'},
  { value: 'tool_tutorials',      label: 'Tool Tutorials',      bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  { value: 'product_training',    label: 'Product Training',    bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'  },
];

const ROLES = ['employee', 'sales', 'field_sales', 'hr', 'admin'];

const ALL_ROLES_OPTION = { value: '', label: 'All Roles' };

function cat(value) {
  return CATEGORIES.find(c => c.value === value) || CATEGORIES[0];
}

const EMPTY_FORM = {
  title: '', description: '', category: 'company_overview',
  content: '', assignedRoles: [], isRequired: true,
  estimatedDuration: 30, order: 0, tags: '',
  attachments: [],
};

/* ── small chip ── */
const CatChip = ({ value }) => {
  const c = cat(value);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};

export default function AdminKnowledgeCenter() {
  const [tab, setTab]           = useState('topics'); // topics | report
  const [topics, setTopics]     = useState([]);
  const [report, setReport]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing]   = useState(null); // null = create
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [viewTopic, setViewTopic] = useState(null);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCat) params.category = filterCat;
      if (search)    params.search   = search;
      const { data } = await api.get('/kt', { params });
      setTopics(data.data || []);
    } catch {/* ignore */} finally { setLoading(false); }
  }, [filterCat, search]);

  const fetchReport = useCallback(async () => {
    try {
      const { data } = await api.get('/kt/progress/report');
      setReport(data.data || []);
    } catch {/* ignore */}
  }, []);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);
  useEffect(() => { if (tab === 'report') fetchReport(); }, [tab, fetchReport]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function openEdit(t) {
    setEditing(t);
    setForm({
      title: t.title, description: t.description, category: t.category,
      content: t.content, assignedRoles: t.assignedRoles || [],
      isRequired: t.isRequired, estimatedDuration: t.estimatedDuration || 30,
      order: t.order || 0, tags: (t.tags || []).join(', '),
      attachments: t.attachments || [],
    });
    setPanelOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      if (editing) {
        await api.put(`/kt/${editing._id}`, payload);
      } else {
        await api.post('/kt', payload);
      }
      setPanelOpen(false);
      fetchTopics();
    } catch {/* ignore */} finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this topic?')) return;
    await api.delete(`/kt/${id}`);
    fetchTopics();
  }

  function toggleRole(role) {
    setForm(f => ({
      ...f,
      assignedRoles: f.assignedRoles.includes(role)
        ? f.assignedRoles.filter(r => r !== role)
        : [...f.assignedRoles, role],
    }));
  }

  /* ── attachment helpers ── */
  function addAttachment() {
    setForm(f => ({
      ...f,
      attachments: [...f.attachments, { name: '', url: '', type: 'link' }],
    }));
  }
  function updateAttachment(i, field, val) {
    setForm(f => {
      const att = [...f.attachments];
      att[i] = { ...att[i], [field]: val };
      return { ...f, attachments: att };
    });
  }
  function removeAttachment(i) {
    setForm(f => ({ ...f, attachments: f.attachments.filter((_, idx) => idx !== i) }));
  }

  const displayed = topics.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">

      {/* ── LEFT PANEL ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Knowledge Center</h1>
              <p className="text-xs text-gray-400 mt-0.5">Create and manage training materials for your team</p>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-violet-600 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-violet-700 transition-colors shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New Topic
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-4">
            {[['topics', 'Topics'], ['report', 'Progress Report']].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)}
                className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-all ${tab === v ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'topics' && (
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white w-44 focus:outline-none focus:border-violet-400" />
              </div>
              <button onClick={() => setFilterCat('')}
                className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${!filterCat ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 text-gray-500 hover:border-violet-300'}`}>
                All
              </button>
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setFilterCat(filterCat === c.value ? '' : c.value)}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${filterCat === c.value ? `${c.bg} ${c.text} border-transparent` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'topics' ? (
            loading ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading topics…</div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-gray-400">
                <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                <p className="text-sm font-medium">No topics yet</p>
                <p className="text-xs mt-1">Click "New Topic" to create your first training material</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayed.map(t => (
                  <motion.div key={t._id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow group">
                    <div className="flex items-start justify-between mb-2">
                      <CatChip value={t.category} />
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setViewTopic(t)}
                          className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-violet-50 flex items-center justify-center transition-colors">
                          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-violet-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                        <button onClick={() => openEdit(t)}
                          className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-violet-50 flex items-center justify-center transition-colors">
                          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-violet-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(t._id)}
                          className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-red-50 flex items-center justify-center transition-colors">
                          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-gray-900 mb-1 leading-snug">{t.title}</h3>
                    {t.description && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{t.description}</p>}

                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                        {t.estimatedDuration || 30} min
                      </span>
                      {t.isRequired && (
                        <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Required</span>
                      )}
                      {t.assignedRoles?.length > 0 && (
                        <span className="text-[10px] text-gray-400 ml-auto">
                          {t.assignedRoles.length} role{t.assignedRoles.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {t.attachments?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.attachments.slice(0, 3).map((a, i) => (
                          <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a.type}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )
          ) : (
            /* ── REPORT TAB ── */
            <div className="space-y-3">
              {report.length === 0 ? (
                <div className="text-center text-gray-400 py-20 text-sm">No data yet</div>
              ) : report.map(r => (
                <div key={r.employee._id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {r.employee.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900">{r.employee.name}</p>
                      <span className={`text-xs font-bold ${r.percentage === 100 ? 'text-emerald-600' : r.percentage >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {r.percentage}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${r.percentage === 100 ? 'bg-emerald-500' : r.percentage >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                        style={{ width: `${r.percentage}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {r.completed}/{r.total} topics · {r.employee.role} · {r.employee.employeeId}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL — Create / Edit ── */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div initial={{ x: 360, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-[360px] bg-white border-l border-gray-100 flex flex-col overflow-hidden flex-shrink-0 shadow-xl">

            {/* Panel header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-bold text-gray-900">{editing ? 'Edit Topic' : 'New Topic'}</h2>
              <button onClick={() => setPanelOpen(false)}
                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. CRM Lead Creation Process"
                  className="w-full border-b border-gray-200 focus:border-violet-500 outline-none text-sm text-gray-800 py-1.5 bg-transparent transition-colors" />
              </div>

              {/* Category */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Category *</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c.value} onClick={() => setForm(f => ({ ...f, category: c.value }))}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${form.category === c.value ? `${c.bg} ${c.text} border-transparent` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Short Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Brief summary of this topic"
                  className="w-full border border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-violet-300 resize-none" />
              </div>

              {/* Content */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Content / Guide</label>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={6} placeholder="Write training content here. Step-by-step guides, processes, instructions..."
                  className="w-full border border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-violet-300 resize-none font-mono leading-relaxed" />
              </div>

              {/* Assign Roles */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Assign to Roles <span className="text-gray-400 font-normal normal-case">(empty = all roles)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map(r => (
                    <button key={r} onClick={() => toggleRole(r)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-full border capitalize transition-all ${form.assignedRoles.includes(r) ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 text-gray-500 hover:border-violet-300'}`}>
                      {r.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration + Order */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Duration (min)</label>
                  <input type="number" value={form.estimatedDuration}
                    onChange={e => setForm(f => ({ ...f, estimatedDuration: +e.target.value }))}
                    className="w-full border-b border-gray-200 focus:border-violet-500 outline-none text-sm text-gray-800 py-1.5 bg-transparent" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Order</label>
                  <input type="number" value={form.order}
                    onChange={e => setForm(f => ({ ...f, order: +e.target.value }))}
                    className="w-full border-b border-gray-200 focus:border-violet-500 outline-none text-sm text-gray-800 py-1.5 bg-transparent" />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Tags <span className="text-gray-400 font-normal normal-case">(comma separated)</span></label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="onboarding, crm, sales"
                  className="w-full border-b border-gray-200 focus:border-violet-500 outline-none text-sm text-gray-800 py-1.5 bg-transparent transition-colors" />
              </div>

              {/* Required toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Required for Onboarding</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">New employees must complete this</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, isRequired: !f.isRequired }))}
                  className={`w-10 h-5 rounded-full transition-colors relative ${form.isRequired ? 'bg-violet-600' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isRequired ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Attachments / Links</label>
                  <button onClick={addAttachment} className="text-[10px] text-violet-600 font-semibold hover:underline">+ Add</button>
                </div>
                <div className="space-y-2">
                  {form.attachments.map((a, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex gap-2">
                        <input value={a.name} onChange={e => updateAttachment(i, 'name', e.target.value)}
                          placeholder="Name" className="flex-1 text-xs border-b border-gray-200 focus:border-violet-400 outline-none bg-transparent py-0.5" />
                        <select value={a.type} onChange={e => updateAttachment(i, 'type', e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 bg-white focus:outline-none focus:border-violet-400">
                          {['link', 'pdf', 'video', 'image', 'document'].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button onClick={() => removeAttachment(i)} className="text-red-400 hover:text-red-600">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <input value={a.url} onChange={e => updateAttachment(i, 'url', e.target.value)}
                        placeholder="https://..." className="w-full text-xs border-b border-gray-200 focus:border-violet-400 outline-none bg-transparent py-0.5 text-blue-600" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={() => setPanelOpen(false)}
                className="flex-1 text-xs font-semibold py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()}
                className="flex-1 text-xs font-semibold py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : editing ? 'Update' : 'Create Topic'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOPIC PREVIEW MODAL ── */}
      <AnimatePresence>
        {viewTopic && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setViewTopic(null)}>
            <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
                <div>
                  <CatChip value={viewTopic.category} />
                  <h2 className="text-base font-bold text-gray-900 mt-1">{viewTopic.title}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{viewTopic.estimatedDuration} min · by {viewTopic.createdBy?.name}</p>
                </div>
                <button onClick={() => setViewTopic(null)}
                  className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {viewTopic.description && <p className="text-sm text-gray-600">{viewTopic.description}</p>}
                {viewTopic.content && (
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 font-sans leading-relaxed border border-gray-100">
                    {viewTopic.content}
                  </pre>
                )}
                {viewTopic.attachments?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">Attachments</p>
                    <div className="space-y-1.5">
                      {viewTopic.attachments.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-blue-600 hover:underline">
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{a.type}</span>
                          {a.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
