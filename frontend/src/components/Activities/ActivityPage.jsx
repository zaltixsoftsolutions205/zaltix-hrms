import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarDays, ChevronLeft, ChevronRight, Eye, Loader2, Search, X,
} from 'lucide-react';
import { FollowUpKanban, VIEW_OPTIONS, ViewSwitcher } from '../LeadViews/LeadViews';
import { useAuth } from '../../contexts/AuthContext';
import { getAssignableUsers } from '../../services/Userservice';
import VisitCalendar from '../Visits/VisitCalendar';
import VisitListView from '../Visits/VisitListView';
import MiniCalendar from '../Visits/MiniCalendar';
import {
  addDays, placeFollowUp, rangeTitle, shiftCursor, startOfDay, visibleRange,
} from '../Visits/visitDates';
import ActivityLeadInfo from './ActivityLeadInfo';
import ActivityCards from './ActivityCards';
import ActivityFormModal from './ActivityFormModal';
import { entryDate, getPage } from './activityTypes';
import ActivityLeadTable from './ActivityLeadTable';
import ConfirmDialog from '../GlobalTable/ConfirmDialog';
import { updateLeadStage } from '../../services/ActivityService';
import { isClient, stageLabel } from '../../hooks/useGlobalTableColumns';
import { canAccessEdit } from '../../constants/modules';
import { canEditLead } from './pipelineAccess';

/**
 * A lead activity page (Visits, Demos, Data Updation, Registration, Feedback):
 * three panels that drive each other and fill the page. `type` picks the stage,
 * the API and the main fields (activityTypes.js).
 * (Described for Visits; every type works the same way.)
 *   Left:   no lead selected -> the leads of the shown period (pick one);
 *           a lead selected  -> its main fields, stage edit, "show in calendar", "add visit".
 *   Middle: leads in the Visit stage by follow-up date (calendar or list; day / week / month;
 *           search; employee filter for admin / HR / managers). Clicking a lead selects it.
 *   Right:  mini calendar (tints the shown period, dots for planned days and the selected
 *           lead's visits, ring on its follow-up) and the lead's visits as cards + "Add visit".
 * Rules (who sees / changes what) are enforced by the backend (visitController,
 * activityController).
 */

const RANGES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

// calendar / list: the leads of the shown period; table / kanban: every lead in the stage.
const MODES = VIEW_OPTIONS.map((v) => v.value);

const readPrefs = (key, defaultMode) => {
  try {
    const p = JSON.parse(localStorage.getItem(key)) || {};
    return {
      range: RANGES.some((r) => r.value === p.range) ? p.range : 'week',
      mode: MODES.includes(p.mode) ? p.mode : defaultMode,
    };
  } catch {
    return { range: 'week', mode: defaultMode };
  }
};

const panel = 'bg-white rounded-2xl border border-violet-100 shadow-sm';

export default function ActivityPage({ type }) {
  const page = useMemo(() => getPage(type), [type]);
  const PREFS_KEY = `${type}.views`;
  const { user } = useAuth();
  // Module access: view opens the page; edit adds / changes entries (the server checks both).
  const editable = canAccessEdit(user, page.module);
  const canChangeStage = editable && canEditLead(user);
  const rowAdds = page.layout === 'table' && editable; // Registration: a table row opens the add form
  const [prefs, setPrefs] = useState(() => readPrefs(PREFS_KEY, page.layout === 'table' ? 'table' : 'calendar'));
  const { range, mode } = prefs;
  const tableMode = mode === 'table' || mode === 'kanban'; // every lead of the stage, no period
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [employee, setEmployee] = useState('');

  const [calendar, setCalendar] = useState({ leads: [], truncated: false, canFilterByEmployee: false });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const [selected, setSelected] = useState(null); // the lead object that was clicked
  const [detail, setDetail] = useState(null); // page.api.getDetail(leadId)
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm] = useState(null); // { entry: null | entry }
  const [hoverKey, setHoverKey] = useState(null); // day of the card under the pointer
  const [pendingAdd, setPendingAdd] = useState(null); // table row clicked: open its add form once loaded
  const [winPrompt, setWinPrompt] = useState(null); // { lead } after a new registration
  const [winBusy, setWinBusy] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    getAssignableUsers().then((list) => setUsers(Array.isArray(list) ? list : [])).catch(() => setUsers([]));
  }, []);
  const userLookup = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);

  const { from, to } = useMemo(() => visibleRange(range, cursor), [range, cursor]);

  /* ---- middle: calendar data ---- */
  const requestRef = useRef(0);
  const loadCalendar = useCallback(async () => {
    const id = requestRef.current + 1;
    requestRef.current = id;
    setLoading(true);
    try {
      // One day of margin on each side: plain dates are stored as UTC midnight.
      const data = await page.api.getCalendar({
        ...(tableMode ? { all: '1' } : { from: addDays(from, -1).toISOString(), to: addDays(to, 1).toISOString() }),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(employee ? { assignedTo: employee } : {}),
      });
      if (requestRef.current !== id) return;
      const leads = tableMode ? (data.leads || []) : (data.leads || []).filter((l) => {
        const place = placeFollowUp(l.followUpDate);
        return place && place.day >= from && place.day < to;
      });
      setCalendar({ leads, truncated: data.truncated, canFilterByEmployee: data.canFilterByEmployee });
    } catch (err) {
      if (requestRef.current === id) toast.error(err.message);
    } finally {
      if (requestRef.current === id) setLoading(false);
    }
  }, [page, tableMode, from, to, debouncedSearch, employee]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  /* ---- the selected lead (left + right) ---- */
  // A slow answer for a lead that is no longer selected is dropped.
  const selectedRef = useRef(null);
  const loadDetail = useCallback(async (leadId) => {
    if (!leadId) return;
    setDetailLoading(true);
    try {
      const data = await page.api.getDetail(leadId);
      if (selectedRef.current === leadId) setDetail(data);
    } catch (err) {
      if (selectedRef.current !== leadId) return;
      toast.error(err.message);
      if (err.status === 404) { selectedRef.current = null; setSelected(null); setDetail(null); }
    } finally {
      if (selectedRef.current === leadId) setDetailLoading(false);
    }
  }, [page]);

  const selectLead = useCallback((lead) => {
    selectedRef.current = lead._id;
    setSelected(lead);
    setDetail((current) => (current?.lead._id === lead._id ? current : null));
    loadDetail(lead._id);
  }, [loadDetail]);

  const clearSelection = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
    setDetail(null);
    setHoverKey(null);
  }, []);

  // Esc closes the selected lead (unless a dialog is open).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !form && selectedRef.current) clearSelection(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [form, clearSelection]);

  // ?lead=<id> (from the lead drawer / lead page): open that lead and show its follow-up day.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRef = useRef(searchParams.get('lead'));
  useEffect(() => {
    const id = deepLinkRef.current;
    if (id && /^[a-f0-9]{24}$/i.test(id)) selectLead({ _id: id, name: '' });
    if (searchParams.has('lead')) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!detail || detail.lead._id !== deepLinkRef.current) return;
    deepLinkRef.current = null;
    const place = placeFollowUp(detail.lead.followUpDate);
    if (place) setCursor(place.day);
  }, [detail]);

  // Table row clicked: once its details are loaded, open the add form (when adding is allowed).
  useEffect(() => {
    if (!pendingAdd || !detail || detail.lead._id !== pendingAdd) return;
    setPendingAdd(null);
    if (detail.canAdd) setForm({ entry: null });
  }, [pendingAdd, detail]);

  const lead = detail?.lead || selected;
  const selectedId = lead?._id || null;
  const focusKey = placeFollowUp(lead?.followUpDate)?.key || null;

  const planned = useMemo(() => new Set(calendar.leads.map((l) => placeFollowUp(l.followUpDate)?.key).filter(Boolean)), [calendar.leads]);
  const done = useMemo(() => new Set((detail?.entries || []).map((e) => placeFollowUp(entryDate(detail.mainFields, e))?.key).filter(Boolean)), [detail]);

  const refreshAll = () => {
    if (selectedRef.current) loadDetail(selectedRef.current);
    loadCalendar();
  };
  const afterChange = (saved, { isNew } = {}) => {
    setForm(null);
    refreshAll();
    // A new registration: offer to make the lead a customer. Not for clients: they are already won.
    if (isNew && page.wins && detail?.lead && !isClient(detail.lead)) setWinPrompt({ lead: detail.lead });
  };

  const markWon = async () => {
    if (!winPrompt || winBusy) return;
    setWinBusy(true);
    try {
      await updateLeadStage(winPrompt.lead._id, 'lead-won', winPrompt.lead.pipelineStage);
      toast.success(`${winPrompt.lead.name} is now ${stageLabel('lead-won')}`);
      setWinPrompt(null);
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWinBusy(false);
    }
  };

  const showFollowUp = () => {
    const place = placeFollowUp(lead?.followUpDate);
    if (place) setCursor(place.day);
  };

  const setRange = (value) => setPrefs((p) => ({ ...p, range: value }));
  const setMode = (value) => setPrefs((p) => ({ ...p, mode: value }));
  const periodTitle = tableMode ? `All leads in ${page.label}` : rangeTitle(range, cursor);

  return (
    <div className="flex flex-col gap-3 xl:h-full xl:min-h-[640px]">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{page.title}</h1>
          <p className="text-xs text-gray-500">
            {mode === 'table' ? `Every lead in the ${page.label} stage.${rowAdds ? ` Click a row to add a ${page.noun}.` : ' Click a row to open the lead.'}`
              : mode === 'kanban' ? `Every lead in the ${page.label} stage, by when its follow-up is due.`
                : `Leads in the ${page.label} stage, placed by their follow-up date.`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {!editable && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2.5 py-1 font-semibold" title={`You can see ${page.title} but not add or change entries`}>
              <Eye size={13} /> View only
            </span>
          )}
          <span className="rounded-full bg-violet-100 text-violet-700 px-2.5 py-1 font-semibold">{calendar.leads.length} in {page.label}{tableMode ? '' : ` · ${periodTitle}`}</span>
        </div>
      </div>

      <div className="grid gap-4 flex-1 min-h-0 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_340px]">
        {/* LEFT */}
        <aside className={`${panel} p-4 order-2 lg:order-1 flex flex-col min-h-[320px] lg:max-h-[calc(100vh-11rem)] xl:max-h-none xl:min-h-0 overflow-hidden`} aria-label="Lead details">
          <ActivityLeadInfo
            page={page}
            lead={lead}
            detail={detail}
            loading={detailLoading}
            periodLeads={calendar.leads}
            periodTitle={periodTitle}
            onSelect={selectLead}
            onClose={clearSelection}
            onLeadChanged={refreshAll}
            onShowFollowUp={showFollowUp}
            onAdd={() => setForm({ entry: null })}
            onOpenEntry={(entry) => setForm({ entry })}
            editable={editable}
            canChangeStage={canChangeStage}
          />
        </aside>

        {/* MIDDLE */}
        <section className={`${panel} order-1 lg:order-2 flex flex-col min-h-[560px] xl:min-h-0 overflow-hidden`} aria-label={`${page.title} calendar`}>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-violet-100">
            {!tableMode && (
              <>
                <button type="button" onClick={() => setCursor(startOfDay(new Date()))} className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">Today</button>
                <div className="flex items-center">
                  <button type="button" aria-label="Previous" onClick={() => setCursor((c) => shiftCursor(range, c, -1))} className="w-8 h-8 rounded-lg hover:bg-violet-50 text-violet-600"><ChevronLeft size={17} /></button>
                  <button type="button" aria-label="Next" onClick={() => setCursor((c) => shiftCursor(range, c, 1))} className="w-8 h-8 rounded-lg hover:bg-violet-50 text-violet-600"><ChevronRight size={17} /></button>
                </div>
              </>
            )}
            <h2 className="text-sm font-bold text-gray-900 mr-auto">{periodTitle}</h2>
            {loading && <Loader2 size={15} className="animate-spin text-violet-400" aria-label="Loading" />}

            <label className="relative">
              <span className="sr-only">Search leads</span>
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lead, Mandal…" className="input-field !py-1.5 !pl-8 !text-xs w-44" />
            </label>

            {calendar.canFilterByEmployee && (
              <select aria-label="Employee" value={employee} onChange={(e) => setEmployee(e.target.value)} className="input-field !py-1.5 !text-xs w-40">
                <option value="">All employees</option>
                {users.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((u) => (
                  <option key={u._id} value={u._id}>{u.name}{u.employeeId ? ` (${u.employeeId})` : ''}</option>
                ))}
              </select>
            )}

            {!tableMode && (
            <div className="inline-flex rounded-lg bg-violet-50 p-0.5" role="group" aria-label="Period">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={range === r.value}
                  onClick={() => setRange(r.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${range === r.value ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            )}

            <ViewSwitcher value={mode} onChange={setMode} />
          </div>

          {(search || employee) && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-violet-50 bg-violet-50/50 text-[11px] text-violet-700">
              Filtered{search ? ` by “${search}”` : ''}{employee ? ` · ${userLookup[employee]?.name || 'employee'}` : ''}
              <button type="button" onClick={() => { setSearch(''); setEmployee(''); }} className="ml-auto gap-1 font-semibold hover:text-violet-900">
                <X size={12} /> Clear
              </button>
            </div>
          )}
          {calendar.truncated && (
            <p className="px-3 py-1.5 text-[11px] bg-amber-50 text-amber-700 border-b border-amber-100">Showing the first 1000 leads. Narrow the period or search to see the rest.</p>
          )}

          {mode === 'table' ? (
            <ActivityLeadTable
              page={page}
              leads={calendar.leads}
              selectedId={selectedId}
              addOnClick={rowAdds}
              onRowClick={(row) => { selectLead(row); if (rowAdds) setPendingAdd(row._id); }}
            />
          ) : mode === 'kanban' ? (
            <FollowUpKanban leads={calendar.leads} userLookup={userLookup} selectedId={selectedId} onSelect={selectLead} />
          ) : mode === 'calendar' ? (
            <VisitCalendar
              range={range}
              cursor={cursor}
              leads={calendar.leads}
              selectedId={selectedId}
              focusKey={focusKey}
              noun={page.noun}
              onSelect={selectLead}
              onPickDay={(day) => { setCursor(day); setRange('day'); }}
            />
          ) : (
            <VisitListView from={from} to={to} leads={calendar.leads} selectedId={selectedId} onSelect={selectLead} noun={page.noun} />
          )}
        </section>

        {/* RIGHT */}
        <aside className="order-3 lg:col-span-2 xl:col-span-1 flex flex-col gap-4 min-h-0" aria-label={`Mini calendar and ${page.title.toLowerCase()}`}>
          {!tableMode && (
          <div className={`${panel} p-4 flex-shrink-0`}>
            <MiniCalendar
              value={cursor}
              from={from}
              to={to}
              onPick={(day) => setCursor(day)}
              planned={planned}
              done={done}
              focusKey={focusKey}
              hoverKey={hoverKey}
            />
          </div>
          )}
          <div className={`${panel} p-4 flex flex-col flex-1 min-h-[240px] overflow-hidden`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-gray-900">{page.title}</h2>
                {lead && <p className="text-[11px] text-gray-500 truncate">{lead.name}</p>}
              </div>
              {detail && <span className="flex-shrink-0 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-semibold">{detail.entries.length} done</span>}
            </div>
            {!lead ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                <CalendarDays size={24} className="text-violet-200" />
                <p className="mt-2 text-xs text-gray-500">Select a lead in the calendar or the list<br />to see and add its {page.title.toLowerCase()}.</p>
              </div>
            ) : !detail ? (
              <p className="flex items-center gap-2 text-xs text-violet-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
            ) : (
              <ActivityCards
                detail={detail}
                page={page}
                userLookup={userLookup}
                onOpen={(entry) => setForm({ entry })}
                onAdd={() => setForm({ entry: null })}
                onHoverDay={setHoverKey}
                readOnly={!editable}
              />
            )}
          </div>
        </aside>
      </div>

      {form && detail && (
        <ActivityFormModal
          key={form.entry?._id || 'new'}
          page={page}
          detail={detail}
          entry={form.entry}
          currentUser={user}
          onClose={() => setForm(null)}
          onSaved={afterChange}
          onDeleted={afterChange}
          viewOnly={!editable}
        />
      )}

      {winPrompt && (
        <ConfirmDialog
          title="Mark this lead as Lead Won?"
          confirmLabel="Mark Lead Won"
          busy={winBusy}
          onConfirm={markWon}
          onCancel={() => setWinPrompt(null)}
        >
          <p>
            The registration for <strong>{winPrompt.lead.name}</strong> is saved. Mark the lead as a customer
            (<strong>{stageLabel('lead-won')}</strong>)? It then moves to CRM › Clients, where it can be sent to activities or converted to lost.
            Choose Cancel to keep it in {page.label} (for more registrations or feedback).
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
