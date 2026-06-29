import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';

const CATEGORIES = [
  { value: 'company_overview',    label: 'Company Overview',    bg: 'bg-violet-50',  border: 'border-violet-200', accent: 'bg-violet-500',  text: 'text-violet-700',  chip: 'bg-violet-100' },
  { value: 'department_training', label: 'Department Training', bg: 'bg-blue-50',    border: 'border-blue-200',   accent: 'bg-blue-500',    text: 'text-blue-700',    chip: 'bg-blue-100'   },
  { value: 'work_processes',      label: 'Work Processes',      bg: 'bg-emerald-50', border: 'border-emerald-200',accent: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-100'},
  { value: 'tool_tutorials',      label: 'Tool Tutorials',      bg: 'bg-orange-50',  border: 'border-orange-200', accent: 'bg-orange-500',  text: 'text-orange-700',  chip: 'bg-orange-100' },
  { value: 'product_training',    label: 'Product Training',    bg: 'bg-amber-50',   border: 'border-amber-200',  accent: 'bg-amber-500',   text: 'text-amber-700',   chip: 'bg-amber-100'  },
];

const CAT_ICONS = {
  company_overview:    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  department_training: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  work_processes:      "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  tool_tutorials:      "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2",
  product_training:    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
};

function cat(value) {
  return CATEGORIES.find(c => c.value === value) || CATEGORIES[0];
}

export default function KnowledgeCenter() {
  const [topics, setTopics]         = useState([]);
  const [myProgress, setMyProgress] = useState({ total: 0, completed: 0, percentage: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterCat, setFilterCat]   = useState('');
  const [activeTopic, setActiveTopic] = useState(null);
  const [completing, setCompleting] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [topicsRes, progressRes] = await Promise.all([
        api.get('/kt'),
        api.get('/kt/progress/me'),
      ]);
      setTopics(topicsRes.data.data || []);
      setMyProgress(progressRes.data.data || { total: 0, completed: 0, percentage: 0 });
    } catch {/* ignore */} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleStart(topicId) {
    await api.post(`/kt/${topicId}/start`);
  }

  async function handleComplete(topicId) {
    setCompleting(topicId);
    try {
      await api.post(`/kt/${topicId}/complete`);
      setTopics(prev => prev.map(t =>
        t._id === topicId
          ? { ...t, progress: { completed: true, completedAt: new Date() } }
          : t
      ));
      setMyProgress(prev => {
        const completed = prev.completed + 1;
        return { ...prev, completed, percentage: Math.round((completed / prev.total) * 100) };
      });
    } catch {/* ignore */} finally { setCompleting(null); }
  }

  const displayed = topics.filter(t => {
    if (filterCat && t.category !== filterCat) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by category
  const grouped = CATEGORIES.map(c => ({
    ...c,
    items: displayed.filter(t => t.category === c.value),
  })).filter(g => g.items.length > 0);

  const requiredTopics = topics.filter(t => t.isRequired && !t.progress?.completed);
  const isNewEmployee  = myProgress.percentage < 100 && requiredTopics.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading your training materials…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* ── Onboarding Banner ── */}
      {isNewEmployee && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-violet-600 to-violet-700 rounded-2xl p-5 text-white shadow-lg shadow-violet-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-violet-200 mb-1">ONBOARDING TRAINING</p>
              <h2 className="text-base font-bold mb-1">Welcome! Please complete your training</h2>
              <p className="text-xs text-violet-200 mb-3">
                Complete the required topics below before starting your work.
              </p>
              <div className="space-y-1">
                {requiredTopics.slice(0, 3).map((t, i) => (
                  <div key={t._id} className="flex items-center gap-2 text-xs text-violet-100">
                    <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    {t.title}
                  </div>
                ))}
                {requiredTopics.length > 3 && (
                  <p className="text-xs text-violet-300">+{requiredTopics.length - 3} more topics</p>
                )}
              </div>
            </div>
            {/* Progress circle */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
                  <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - myProgress.percentage / 100)}`}
                    strokeLinecap="round" className="transition-all duration-700" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                  {myProgress.percentage}%
                </span>
              </div>
              <p className="text-[10px] text-violet-200 mt-1 text-center">{myProgress.completed}/{myProgress.total}<br />done</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Progress Summary (always visible) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Your Training Progress</h2>
            <p className="text-xs text-gray-400 mt-0.5">{myProgress.completed} of {myProgress.total} topics completed</p>
          </div>
          <span className={`text-lg font-black ${myProgress.percentage === 100 ? 'text-emerald-600' : myProgress.percentage >= 50 ? 'text-amber-600' : 'text-violet-600'}`}>
            {myProgress.percentage}%
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div className={`h-full rounded-full ${myProgress.percentage === 100 ? 'bg-emerald-500' : 'bg-violet-600'}`}
            initial={{ width: 0 }} animate={{ width: `${myProgress.percentage}%` }}
            transition={{ duration: 1, ease: 'easeOut' }} />
        </div>
        {myProgress.percentage === 100 && (
          <p className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            All training completed!
          </p>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics…"
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white w-44 focus:outline-none focus:border-violet-400" />
        </div>
        <button onClick={() => setFilterCat('')}
          className={`text-xs px-3 py-1.5 rounded-xl border font-medium ${!filterCat ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 text-gray-500 hover:border-violet-300'}`}>
          All
        </button>
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setFilterCat(filterCat === c.value ? '' : c.value)}
            className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${filterCat === c.value ? `${c.chip} ${c.text} border-transparent` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* ── Topic Groups ── */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          <p className="text-sm">No topics found</p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.value}>
            {/* Section header */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${group.bg} border ${group.border} mb-3`}>
              <div className={`w-8 h-8 rounded-xl ${group.accent} flex items-center justify-center`}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={CAT_ICONS[group.value]} />
                </svg>
              </div>
              <div>
                <h3 className={`text-sm font-bold ${group.text}`}>{group.label}</h3>
                <p className="text-[10px] text-gray-500">{group.items.length} topic{group.items.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="ml-auto text-xs text-gray-500">
                {group.items.filter(t => t.progress?.completed).length}/{group.items.length} done
              </div>
            </div>

            {/* Topic cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {group.items.map(t => {
                const isDone = t.progress?.completed;
                return (
                  <motion.div key={t._id} layout
                    className={`bg-white rounded-2xl border transition-all hover:shadow-md ${isDone ? 'border-emerald-200' : 'border-gray-100'}`}>
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Completion circle */}
                        <button
                          onClick={() => !isDone && handleComplete(t._id)}
                          disabled={isDone || completing === t._id}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${isDone ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-violet-400'}`}>
                          {isDone && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {completing === t._id && !isDone && (
                            <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`text-sm font-semibold leading-snug ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              {t.title}
                            </h4>
                            {t.isRequired && !isDone && (
                              <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full flex-shrink-0">REQ</span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-xs text-gray-500 line-clamp-2">{t.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                              {t.estimatedDuration || 30} min
                            </span>
                            {t.attachments?.length > 0 && (
                              <span className="text-[10px] text-gray-400">{t.attachments.length} resource{t.attachments.length > 1 ? 's' : ''}</span>
                            )}
                            {isDone && (
                              <span className="text-[10px] text-emerald-600 font-semibold ml-auto">✓ Completed</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => { setActiveTopic(t); handleStart(t._id); }}
                          className="flex-shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                          {isDone ? 'Review' : 'Open'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* ── Topic Detail Modal ── */}
      <AnimatePresence>
        {activeTopic && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setActiveTopic(null)}>
            <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}>

              {/* Modal header */}
              <div className={`px-6 py-4 border-b border-gray-100 flex items-start justify-between ${cat(activeTopic.category).bg}`}>
                <div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cat(activeTopic.category).chip} ${cat(activeTopic.category).text} mb-1`}>
                    {cat(activeTopic.category).label}
                  </span>
                  <h2 className="text-base font-bold text-gray-900">{activeTopic.title}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{activeTopic.estimatedDuration} min estimated reading time</p>
                </div>
                <button onClick={() => setActiveTopic(null)}
                  className="w-8 h-8 rounded-xl bg-white/70 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {activeTopic.description && (
                  <p className="text-sm text-gray-600 border-l-2 border-violet-300 pl-3">{activeTopic.description}</p>
                )}
                {activeTopic.content ? (
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {activeTopic.content}
                  </pre>
                ) : (
                  <p className="text-sm text-gray-400 italic">No content added yet.</p>
                )}

                {activeTopic.attachments?.length > 0 && (
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Resources & Attachments</p>
                    <div className="space-y-2">
                      {activeTopic.attachments.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2.5 text-sm text-blue-600 hover:text-blue-800 hover:underline group">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            a.type === 'video' ? 'bg-red-100 text-red-600' :
                            a.type === 'pdf' ? 'bg-orange-100 text-orange-600' :
                            a.type === 'image' ? 'bg-green-100 text-green-600' :
                            'bg-blue-100 text-blue-600'
                          }`}>{a.type.toUpperCase()}</span>
                          {a.name}
                          <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
                <p className="text-xs text-gray-400">
                  {activeTopic.progress?.completed
                    ? `Completed on ${new Date(activeTopic.progress.completedAt).toLocaleDateString()}`
                    : 'Mark as completed when done reading'}
                </p>
                {!activeTopic.progress?.completed ? (
                  <button
                    onClick={async () => {
                      await handleComplete(activeTopic._id);
                      setActiveTopic(prev => ({
                        ...prev,
                        progress: { completed: true, completedAt: new Date() }
                      }));
                    }}
                    disabled={completing === activeTopic._id}
                    className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {completing === activeTopic._id ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    )}
                    Mark as Completed
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Completed
                  </span>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
