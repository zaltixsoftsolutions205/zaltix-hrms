import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const STAGE_FLOW = ['lead', 'called', 'demo_booked', 'visit_scheduled', 'visit_done', 'converted'];

const STAGES = {
  lead:             { label: 'New Lead',        short: 'Lead',    chip: 'bg-gray-100 text-gray-600',        dot: 'bg-gray-400'    },
  called:           { label: 'Called',          short: 'Called',  chip: 'bg-violet-100 text-violet-700',    dot: 'bg-violet-500'  },
  demo_booked:      { label: 'Demo Booked',     short: 'Demo',    chip: 'bg-violet-200 text-violet-800',    dot: 'bg-violet-700'  },
  visit_scheduled:  { label: 'Visit Scheduled', short: 'V.Sched', chip: 'bg-golden-100 text-golden-700',   dot: 'bg-golden-500'  },
  visit_done:       { label: 'Visit Done',      short: 'V.Done',  chip: 'bg-golden-200 text-golden-800',   dot: 'bg-golden-700'  },
  converted:        { label: 'Converted',       short: 'Won',     chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

const NEXT_STAGE = {
  lead: 'called', called: 'demo_booked', demo_booked: 'visit_scheduled',
  visit_scheduled: 'visit_done', visit_done: 'converted',
};

const NEXT_LABEL = {
  lead: 'Mark Called', called: 'Book Demo', demo_booked: 'Schedule Visit',
  visit_scheduled: 'Visit Done', visit_done: 'Convert →',
};

const initials = (name) =>
  name ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';

export default function AdminFieldSales() {
  const [leads, setLeads]               = useState([]);
  const [stats, setStats]               = useState({});
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedRep, setSelectedRep]   = useState('all');
  const [search, setSearch]             = useState('');
  const [expandedId, setExpandedId]     = useState(null);

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

  /* ── Advance stage (admin can do this) ── */
  const advanceStage = async (lead, e) => {
    e.stopPropagation();
    const next = NEXT_STAGE[lead.stage];
    if (!next) return;
    try {
      await api.put(`/field-leads/${lead._id}/stage`, { stage: next });
      toast.success(`→ ${STAGES[next].label}`);
      fetchAll();
    } catch { toast.error('Failed'); }
  };

  /* ── Per-rep summary (computed from leads) ── */
  const repMap = {};
  leads.forEach(lead => {
    const id   = lead.assignedTo?._id || 'unknown';
    const name = lead.assignedTo?.name || 'Unknown';
    const eid  = lead.assignedTo?.employeeId || '';
    if (!repMap[id]) repMap[id] = { id, name, eid, total: 0, converted: 0 };
    repMap[id].total++;
    STAGE_FLOW.forEach(s => { repMap[id][s] = repMap[id][s] || 0; });
    repMap[id][lead.stage]++;
    if (lead.stage === 'converted') repMap[id].converted++;
  });
  const reps = Object.values(repMap);

  /* ── Unique reps for filter ── */
  const uniqueReps = reps.map(r => ({ id: r.id, name: r.name }));

  /* ── Filtered leads ── */
  const filtered = leads.filter(l => {
    if (selectedStage !== 'all' && l.stage !== selectedStage) return false;
    if (selectedRep !== 'all' && l.assignedTo?._id !== selectedRep) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q) && !(l.company || '').toLowerCase().includes(q) && !(l.assignedTo?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white px-5 pt-5 pb-0 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Field Sales Pipeline</h2>
            <p className="text-xs text-gray-400 mt-0.5">{total} total leads across {reps.length} rep{reps.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Rep filter */}
            {uniqueReps.length > 0 && (
              <select value={selectedRep} onChange={e => setSelectedRep(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-xl px-3 py-2 focus:outline-none focus:border-violet-400">
                <option value="all">All Reps</option>
                {uniqueReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            {/* Search */}
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-gray-700 placeholder:text-gray-300 text-xs rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-violet-400 w-36"
                placeholder="Search…" />
            </div>
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

      {/* ── Pipeline Visual Bar ── */}
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
              </button>
              {i < STAGE_FLOW.length - 1 && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-gray-200 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              )}
            </div>
          ))}
          {/* Conversion rate */}
          {total > 0 && (
            <div className="ml-6 flex flex-col items-center px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
              <span className="text-lg font-extrabold text-emerald-700 leading-none">
                {Math.round(((stats.converted || 0) / total) * 100)}%
              </span>
              <span className="text-[9px] font-semibold uppercase text-emerald-500 tracking-wide mt-0.5">Conv. Rate</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* ── Per-Rep Summary Cards ── */}
        {reps.length > 0 && (selectedStage === 'all' || selectedStage === '') && selectedRep === 'all' && !search && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">By Rep</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {reps.map(rep => (
                <motion.div key={rep.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedRep(rep.id)}
                  className="bg-white border border-gray-100 rounded-2xl p-4 cursor-pointer hover:border-violet-200 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0">
                      {initials(rep.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{rep.name}</p>
                      <p className="text-[10px] text-gray-400">{rep.eid} · {rep.total} leads</p>
                    </div>
                    {rep.converted > 0 && (
                      <span className="ml-auto text-[10px] font-bold px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg flex-shrink-0">
                        {rep.converted} Won
                      </span>
                    )}
                  </div>
                  {/* Mini pipeline bar */}
                  <div className="flex gap-1.5 flex-wrap">
                    {STAGE_FLOW.map(s => (rep[s] || 0) > 0 && (
                      <span key={s} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${STAGES[s].chip}`}>
                        {STAGES[s].short}: {rep[s]}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── Lead List ── */}
        <div>
          {selectedRep !== 'all' && (
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {reps.find(r => r.id === selectedRep)?.name || 'Rep'} — {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
              </p>
              <button onClick={() => setSelectedRep('all')} className="text-[10px] text-violet-500 hover:text-violet-700 font-semibold">
                Clear ×
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-gray-300 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-gray-300">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-400">No leads found</p>
            </div>
          ) : (
            <AnimatePresence>
              {filtered.map((lead, idx) => {
                const stage  = STAGES[lead.stage];
                const isExp  = expandedId === lead._id;
                const repName = lead.assignedTo?.name || 'Unknown';

                return (
                  <motion.div key={lead._id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ delay: idx * 0.02 }}
                    className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group mb-2.5">

                    <div className="px-4 py-3.5 flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedId(isExp ? null : lead._id)}>

                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-extrabold ${
                        lead.stage === 'converted'   ? 'bg-emerald-500 text-white'      :
                        lead.priority === 'high'     ? 'bg-golden-500 text-white'       :
                        lead.priority === 'medium'   ? 'bg-violet-100 text-violet-700'  :
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
                          <span className="text-[10px] text-gray-400">{lead.phone}</span>
                          <span className="text-gray-200">·</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${stage.chip}`}>{stage.label}</span>
                          {lead.priority === 'high' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-golden-100 text-golden-700">High</span>
                          )}
                          {/* Rep badge */}
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600">{repName}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {NEXT_STAGE[lead.stage] ? (
                          <button onClick={e => advanceStage(lead, e)}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-xl transition-colors whitespace-nowrap opacity-0 group-hover:opacity-100 ${
                              lead.stage === 'visit_done'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-violet-600 hover:bg-violet-700 text-white'
                            }`}>
                            {NEXT_LABEL[lead.stage]}
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-xl">✓ Won</span>
                        )}
                        {/* Activity count */}
                        {lead.activities?.length > 0 && (
                          <span className="text-[10px] text-gray-400 font-medium px-2 flex items-center gap-1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                              <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
                            </svg>
                            {lead.activities.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded: full detail + activities */}
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
                                <p className="text-xs text-gray-500">
                                  <span className="font-semibold text-golden-700">Visit Date:</span>{' '}
                                  {new Date(lead.visitDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                              )}
                              {lead.demoDate && (
                                <p className="text-xs text-gray-500">
                                  <span className="font-semibold text-violet-700">Demo Date:</span>{' '}
                                  {new Date(lead.demoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                              )}
                              <p className="text-xs text-gray-500">
                                <span className="font-semibold text-gray-700">Added:</span>{' '}
                                {new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>

                            {/* Activity log */}
                            {lead.activities?.length > 0 && (
                              <div className="mt-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Activity Log</p>
                                <div className="space-y-1.5">
                                  {[...lead.activities].reverse().slice(0, 8).map((a, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                        a.type === 'call'  ? 'bg-violet-400'  :
                                        a.type === 'visit' ? 'bg-golden-500'  :
                                        a.type === 'demo'  ? 'bg-violet-600'  :
                                        'bg-gray-300'
                                      }`} />
                                      <div>
                                        <p className="text-xs text-gray-700">{a.note}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                          <span className="capitalize font-medium">{a.type}</span>
                                          {a.by?.name && <span> · by {a.by.name}</span>}
                                          {' · '}{new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
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
    </div>
  );
}
