import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const STAGE_FLOW = ['lead', 'called', 'demo_booked', 'visit_scheduled', 'visit_done', 'converted'];

const STAGES = {
  lead:             { label: 'New Lead',        short: 'Lead',     chip: 'bg-gray-100 text-gray-600',         dot: 'bg-gray-400'     },
  called:           { label: 'Called',          short: 'Called',   chip: 'bg-violet-100 text-violet-700',     dot: 'bg-violet-500'   },
  demo_booked:      { label: 'Demo Booked',     short: 'Demo',     chip: 'bg-violet-200 text-violet-800',     dot: 'bg-violet-700'   },
  visit_scheduled:  { label: 'Visit Scheduled', short: 'V.Sched',  chip: 'bg-golden-100 text-golden-700',    dot: 'bg-golden-500'   },
  visit_done:       { label: 'Visit Done',      short: 'V.Done',   chip: 'bg-golden-200 text-golden-800',    dot: 'bg-golden-700'   },
  converted:        { label: 'Converted',       short: 'Won',      chip: 'bg-emerald-100 text-emerald-700',  dot: 'bg-emerald-500'  },
};

const NEXT_STAGE = {
  lead:             'called',
  called:           'demo_booked',
  demo_booked:      'visit_scheduled',
  visit_scheduled:  'visit_done',
  visit_done:       'converted',
};

const NEXT_LABEL = {
  lead:             'Mark Called',
  called:           'Book Demo',
  demo_booked:      'Schedule Visit',
  visit_scheduled:  'Visit Done',
  visit_done:       'Convert →',
};

const ACTIVITY_TYPE = {
  lead:             'note',
  called:           'call',
  demo_booked:      'demo',
  visit_scheduled:  'visit',
  visit_done:       'visit',
  converted:        'note',
};

const initials = (name) =>
  name ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';

const EMPTY_FORM = { name: '', phone: '', email: '', company: '', address: '', source: 'other', priority: 'medium' };

/* ══════════════════════════ COMPONENT ══════════════════════════ */
export default function FieldLeadsPage() {
  const [leads, setLeads]               = useState([]);
  const [stats, setStats]               = useState({});
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [selectedStage, setSelectedStage] = useState('all');
  const [search, setSearch]             = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [editLead, setEditLead]         = useState(null);
  const [expandedId, setExpandedId]     = useState(null);
  const [noteInputId, setNoteInputId]   = useState(null);
  const [noteText, setNoteText]         = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);

  const fetchAll = async () => {
    try {
      const [leadsRes, statsRes] = await Promise.all([
        api.get('/field-leads'),
        api.get('/field-leads/stats'),
      ]);
      setLeads(leadsRes.data.leads || []);
      setStats(statsRes.data.stats || {});
      setTotal(statsRes.data.total || 0);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ── Submit: add or edit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return toast.error('Name and phone required');
    setSubmitting(true);
    try {
      if (editLead) {
        await api.put(`/field-leads/${editLead._id}`, form);
        toast.success('Lead updated');
      } else {
        await api.post('/field-leads', form);
        toast.success('Lead added to pipeline');
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditLead(null);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  /* ── Advance stage ── */
  const advanceStage = async (lead, e) => {
    e.stopPropagation();
    const next = NEXT_STAGE[lead.stage];
    if (!next) return;
    try {
      await api.put(`/field-leads/${lead._id}/stage`, { stage: next });
      toast.success(`→ ${STAGES[next].label}`);
      fetchAll();
    } catch { toast.error('Failed to update stage'); }
  };

  /* ── Add note/activity ── */
  const addNote = async (lead) => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/field-leads/${lead._id}/activity`, {
        type: ACTIVITY_TYPE[lead.stage] || 'note',
        note: noteText,
      });
      setNoteText('');
      setNoteInputId(null);
      fetchAll();
      toast.success('Note saved');
    } catch { toast.error('Failed'); }
  };

  /* ── Delete ── */
  const deleteLead = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/field-leads/${id}`);
      setLeads(prev => prev.filter(l => l._id !== id));
      fetchAll();
    } catch { toast.error('Failed to delete'); }
  };

  /* ── Open edit ── */
  const openEdit = (lead, e) => {
    e.stopPropagation();
    setEditLead(lead);
    setForm({ name: lead.name, phone: lead.phone, email: lead.email || '', company: lead.company || '', address: lead.address || '', source: lead.source || 'other', priority: lead.priority || 'medium' });
    setShowForm(true);
  };

  /* ── Filtered leads ── */
  const filtered = leads.filter(l => {
    if (selectedStage !== 'all' && l.stage !== selectedStage) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q) && !(l.company || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const showPanel = showForm;

  return (
    <div className="flex h-full min-h-screen bg-gray-50">

      {/* ════════ LEFT: PIPELINE LIST ════════ */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${showPanel ? 'hidden sm:flex' : 'flex'}`}>

        {/* Header */}
        <div className="bg-white px-5 pt-5 pb-0 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">My Pipeline</h2>
              <p className="text-xs text-gray-400 mt-0.5">{total} total lead{total !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-gray-700 placeholder:text-gray-300 text-xs rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-violet-400 w-36"
                  placeholder="Search…" />
              </div>
              <button onClick={() => { setShowForm(true); setEditLead(null); setForm(EMPTY_FORM); }}
                className="w-8 h-8 bg-violet-600 hover:bg-violet-700 text-white rounded-xl flex items-center justify-center transition-colors shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4">
                  <path d="M12 4v16m8-8H4"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Stage filter tabs */}
          <div className="flex gap-0 overflow-x-auto scrollbar-hide">
            <button onClick={() => setSelectedStage('all')}
              className={`px-3 pb-3 pt-1 text-xs font-semibold border-b-2 flex-shrink-0 transition-all flex items-center gap-1.5 ${
                selectedStage === 'all' ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              All
              <span className={`text-[10px] min-w-[16px] h-4 px-1 rounded-full font-bold flex items-center justify-center ${
                selectedStage === 'all' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>{total}</span>
            </button>
            {STAGE_FLOW.map(s => (
              <button key={s} onClick={() => setSelectedStage(s)}
                className={`px-3 pb-3 pt-1 text-xs font-semibold border-b-2 flex-shrink-0 transition-all flex items-center gap-1.5 ${
                  selectedStage === s ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {STAGES[s].short}
                {(stats[s] || 0) > 0 && (
                  <span className={`text-[10px] min-w-[16px] h-4 px-1 rounded-full font-bold flex items-center justify-center ${
                    selectedStage === s ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>{stats[s]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Pipeline visual flow bar */}
        <div className="bg-white px-5 py-3 border-b border-gray-100 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-0 min-w-max">
            {STAGE_FLOW.map((s, i) => (
              <div key={s} className="flex items-center">
                <button onClick={() => setSelectedStage(selectedStage === s ? 'all' : s)}
                  className={`flex flex-col items-center px-4 py-2 rounded-xl transition-all ${
                    selectedStage === s ? 'bg-violet-600 shadow-md' : 'hover:bg-gray-50'
                  }`}>
                  <span className={`text-lg font-extrabold leading-none ${selectedStage === s ? 'text-white' : 'text-gray-800'}`}>
                    {stats[s] || 0}
                  </span>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide mt-0.5 ${selectedStage === s ? 'text-violet-200' : 'text-gray-400'}`}>
                    {STAGES[s].short}
                  </span>
                  {s === 'converted' && (stats[s] || 0) > 0 && selectedStage !== s && (
                    <span className="text-[9px] text-emerald-500 font-bold mt-0.5">✓</span>
                  )}
                </button>
                {i < STAGE_FLOW.length - 1 && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-gray-200 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
          {loading ? (
            <div className="py-20 text-center text-gray-300 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-gray-300">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-400">No leads here</p>
              <p className="text-xs text-gray-300 mt-1">Tap + to add your first lead</p>
            </div>
          ) : (
            <AnimatePresence>
              {filtered.map((lead, idx) => {
                const stage     = STAGES[lead.stage];
                const isExp     = expandedId === lead._id;
                const showNote  = noteInputId === lead._id;

                return (
                  <motion.div key={lead._id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group">

                    {/* Main row */}
                    <div className="px-4 py-3.5 flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedId(isExp ? null : lead._id)}>

                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-extrabold ${
                        lead.stage === 'converted'   ? 'bg-emerald-500 text-white'       :
                        lead.priority === 'high'     ? 'bg-golden-500 text-white'        :
                        lead.priority === 'medium'   ? 'bg-violet-100 text-violet-700'   :
                                                       'bg-gray-100 text-gray-500'
                      }`}>
                        {initials(lead.name)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 truncate">{lead.name}</p>
                          {lead.company && <span className="text-[10px] text-gray-400 truncate hidden sm:block">{lead.company}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-gray-400 font-medium">{lead.phone}</span>
                          <span className="text-gray-200">·</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${stage.chip}`}>{stage.label}</span>
                          {lead.priority === 'high' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-golden-100 text-golden-700">High</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {/* Advance stage */}
                        {NEXT_STAGE[lead.stage] ? (
                          <button onClick={e => advanceStage(lead, e)}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-xl transition-colors whitespace-nowrap ${
                              lead.stage === 'visit_done'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-violet-600 hover:bg-violet-700 text-white'
                            }`}>
                            {NEXT_LABEL[lead.stage]}
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-xl">✓ Won</span>
                        )}

                        {/* Note */}
                        <button onClick={e => { e.stopPropagation(); setNoteInputId(showNote ? null : lead._id); setNoteText(''); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-violet-600 hover:bg-violet-50 opacity-0 group-hover:opacity-100 transition-all">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
                          </svg>
                        </button>

                        {/* Edit */}
                        <button onClick={e => openEdit(lead, e)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>

                        {/* Delete */}
                        <button onClick={e => deleteLead(lead._id, e)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Note input row */}
                    <AnimatePresence>
                      {showNote && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden px-4 pb-3">
                          <div className="flex gap-2 pt-2 border-t border-gray-50">
                            <input value={noteText} onChange={e => setNoteText(e.target.value)}
                              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-violet-400 placeholder:text-gray-300"
                              placeholder="Add a note about this lead…" autoFocus
                              onKeyDown={e => e.key === 'Enter' && addNote(lead)} />
                            <button onClick={() => addNote(lead)}
                              className="px-3 py-2 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 transition-colors">
                              Save
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Expanded: lead details + activity log */}
                    <AnimatePresence>
                      {isExp && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden">
                          <div className="px-4 pb-4 pt-3 border-t border-gray-50 space-y-2">
                            <div className="flex flex-wrap gap-4">
                              {lead.email && (
                                <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Email:</span> {lead.email}</p>
                              )}
                              {lead.address && (
                                <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Address:</span> {lead.address}</p>
                              )}
                              {lead.source && (
                                <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Source:</span> <span className="capitalize">{lead.source.replace('-', ' ')}</span></p>
                              )}
                              {lead.visitDate && (
                                <p className="text-xs text-gray-500"><span className="font-semibold text-golden-700">Visit:</span> {new Date(lead.visitDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              )}
                              {lead.demoDate && (
                                <p className="text-xs text-gray-500"><span className="font-semibold text-violet-700">Demo:</span> {new Date(lead.demoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              )}
                            </div>

                            {lead.activities && lead.activities.length > 0 && (
                              <div className="mt-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Activity Log</p>
                                <div className="space-y-1.5">
                                  {[...lead.activities].reverse().slice(0, 6).map((a, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                        a.type === 'call' ? 'bg-violet-400' :
                                        a.type === 'visit' ? 'bg-golden-500' :
                                        a.type === 'demo' ? 'bg-violet-600' :
                                        'bg-gray-300'
                                      }`} />
                                      <div>
                                        <p className="text-xs text-gray-700">{a.note}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                          {a.type} · {new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                                          {new Date(a.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ════════ RIGHT PANEL: ADD / EDIT ════════ */}
      <AnimatePresence>
        {showPanel && (
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2 }}
            className="w-full sm:w-80 lg:w-96 bg-white border-l border-gray-100 flex flex-col shadow-xl">

            {/* Panel header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <button onClick={() => { setShowForm(false); setEditLead(null); }}
                className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>
              <h3 className="text-sm font-extrabold text-gray-900 flex-1">
                {editLead ? 'Edit Lead' : 'Add New Lead'}
              </h3>
              <div className="w-8 h-8 bg-violet-50 rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-violet-500">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Name */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name *</label>
                  <input
                    className="w-full pb-2 text-sm font-semibold text-gray-900 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent placeholder:text-gray-300 transition-colors"
                    placeholder="Enter name…"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    autoFocus
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Phone *</label>
                  <input
                    className="w-full pb-2 text-sm font-semibold text-gray-900 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent placeholder:text-gray-300 transition-colors"
                    placeholder="Mobile number…"
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  />
                </div>

                {/* Company */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Company</label>
                  <input
                    className="w-full pb-2 text-sm text-gray-900 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent placeholder:text-gray-300 transition-colors"
                    placeholder="Company name…"
                    value={form.company}
                    onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Email</label>
                  <input type="email"
                    className="w-full pb-2 text-sm text-gray-900 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent placeholder:text-gray-300 transition-colors"
                    placeholder="Email address…"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>

                {/* Source */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Source</label>
                  <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}
                    className="w-full pb-2 text-sm text-gray-900 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent transition-colors">
                    {['walk-in','referral','cold-call','social','other'].map(s => (
                      <option key={s} value={s} className="capitalize">{s.replace('-', ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Priority</label>
                  <div className="flex gap-2">
                    {['low', 'medium', 'high'].map(p => (
                      <button key={p} type="button"
                        onClick={() => setForm(prev => ({ ...prev, priority: p }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                          form.priority === p ? 'bg-violet-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600'
                        }`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Address / Location</label>
                  <textarea rows={2}
                    className="w-full text-sm text-gray-700 border-0 border-b-2 border-gray-100 focus:border-violet-600 focus:outline-none bg-transparent resize-none placeholder:text-gray-300 transition-colors"
                    placeholder="Area / city…"
                    value={form.address}
                    onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  />
                </div>

                <button type="submit" disabled={submitting}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm mt-4">
                  {submitting ? 'Saving…' : editLead ? 'Save Changes' : 'Add to Pipeline'}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
