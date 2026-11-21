import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bug, Plus, Settings2, LayoutGrid, List, Search, Lock, Loader2, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import WorkItemModal from './work/WorkItemModal';
import StageManager from './work/StageManager';
import {
  PRIORITY_META, Pill, AvatarStack, hasLevel, editScope, errMsg, fmtDate, isOverdue, useProjectContext,
} from './work/workUtils';

const COL_PREFIX = 'col:';

/* ------------------------------------------------------------------ */
/* Board pieces                                                        */
/* ------------------------------------------------------------------ */

const BugCard = ({ bug, onOpen, draggable, overlay = false }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bug._id, disabled: !draggable || overlay });
  const style = overlay ? undefined : { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={() => !overlay && onOpen(bug)}
      className={`rounded-xl border bg-white p-2.5 shadow-sm text-left select-none
        ${isDragging ? 'opacity-40' : ''} ${overlay ? 'shadow-lg ring-2 ring-violet-200 rotate-1' : 'hover:border-violet-200'}
        ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} border-gray-100`}
      style={{ ...style, borderLeft: `3px solid ${bug.module?.color || '#7C3AED'}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-gray-800 leading-snug line-clamp-3">{bug.title}</p>
        {bug.isPrivate && <Lock className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" aria-label="Private" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-gray-400">{bug.taskCode}</span>
        <Pill meta={PRIORITY_META[bug.priority]} />
        {bug.module?.name && <span className="text-[10px] text-gray-500 truncate max-w-[110px]">· {bug.module.name}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <AvatarStack people={bug.assignees} />
        {bug.deadline && (
          <span className={`inline-flex items-center gap-1 text-[10px] ${isOverdue(bug) ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>
            <CalendarClock className="w-3 h-3" /> {fmtDate(bug.deadline)}
          </span>
        )}
      </div>
    </div>
  );
};

const Column = ({ stage, bugs, onOpen, canDrag }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${stage._id}` });
  return (
    <div className="w-72 shrink-0 flex flex-col max-h-full">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold text-gray-800 truncate">{stage.name}</span>
          {stage.isCompleted && <span className="text-[10px] text-emerald-600 font-semibold">done</span>}
        </div>
        <span className="text-xs text-gray-400">{bugs.length}</span>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-2xl p-2 space-y-2 overflow-y-auto transition-colors ${isOver ? 'bg-violet-50 ring-2 ring-violet-200' : 'bg-gray-50'}`}>
        <SortableContext items={bugs.map((b) => b._id)} strategy={verticalListSortingStrategy}>
          {bugs.map((b) => <BugCard key={b._id} bug={b} onOpen={onOpen} draggable={canDrag(b)} />)}
        </SortableContext>
        {bugs.length === 0 && <p className="text-[11px] text-gray-300 text-center py-6">Drop bugs here</p>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const BugSheet = ({ projectId, initialModule = '' }) => {
  const { user } = useAuth();
  const userId = user?._id;
  const ctx = useProjectContext(projectId);
  const { access, people, modules } = ctx;

  const [stages, setStages] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => { try { return localStorage.getItem('bugSheetView') || 'board'; } catch { return 'board'; } });
  const [filters, setFilters] = useState({ module: initialModule, mine: false, priority: '', search: '' });
  const [modal, setModal] = useState(null); // { item } | { create: true }
  const [stagesOpen, setStagesOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const canSee = hasLevel(access, 'bugs', 'view');
  const canManageStages = hasLevel(access, 'bugs', 'edit');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [st, it] = await Promise.all([
        api.get(`/projects/${projectId}/work/bug-stages`),
        api.get(`/projects/${projectId}/work/items`, { params: { kind: 'bug' } }),
      ]);
      setStages(st.data.stages || []);
      setBugs(it.data.items || []);
    } catch (err) {
      toast.error(errMsg(err, 'Could not load the bug sheet'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { if (!ctx.loading && canSee) load(); else if (!ctx.loading) setLoading(false); }, [ctx.loading, canSee, load]);
  useEffect(() => { try { localStorage.setItem('bugSheetView', view); } catch { /* ignore */ } }, [view]);

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return bugs.filter((b) => (
      (!filters.module || b.module?._id === filters.module)
      && (!filters.priority || b.priority === filters.priority)
      && (!filters.mine || b.assignees.some((a) => String(a._id) === String(userId)) || String(b.reporter?._id) === String(userId))
      && (!q || b.title.toLowerCase().includes(q) || (b.taskCode || '').toLowerCase().includes(q))
    ));
  }, [bugs, filters, userId]);

  const byStage = useMemo(() => {
    const map = new Map(stages.map((s) => [s._id, []]));
    visible.forEach((b) => { const k = b.stage?._id; if (map.has(k)) map.get(k).push(b); });
    map.forEach((list) => list.sort((a, b) => (a.boardOrder - b.boardOrder) || (new Date(a.createdAt) - new Date(b.createdAt))));
    return map;
  }, [visible, stages]);

  const canDrag = useCallback((b) => Boolean(editScope(b, access, userId)), [access, userId]);

  const upsert = (item) => setBugs((list) => (list.some((b) => b._id === item._id) ? list.map((b) => (b._id === item._id ? item : b)) : [...list, item]));

  /* ---------- drag & drop ---------- */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findStageOf = (id) => {
    if (String(id).startsWith(COL_PREFIX)) return String(id).slice(COL_PREFIX.length);
    return bugs.find((b) => b._id === id)?.stage?._id;
  };

  const onDragEnd = async ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const bug = bugs.find((b) => b._id === active.id);
    const targetStage = findStageOf(over.id);
    if (!bug || !targetStage) return;

    // New position: between the neighbours at the drop index (orders are floats).
    const column = (byStage.get(targetStage) || []).filter((b) => b._id !== bug._id);
    let index = String(over.id).startsWith(COL_PREFIX) ? column.length : column.findIndex((b) => b._id === over.id);
    if (index < 0) index = column.length;
    const before = column[index - 1]?.boardOrder;
    const after = column[index]?.boardOrder;
    let order;
    if (before === undefined && after === undefined) order = 1024;
    else if (before === undefined) order = after - 1024;
    else if (after === undefined) order = before + 1024;
    else order = (before + after) / 2;

    if (bug.stage?._id === targetStage && bug.boardOrder === order) return;
    const stage = stages.find((s) => s._id === targetStage);
    const previous = bugs;
    setBugs((list) => list.map((b) => (b._id === bug._id ? { ...b, stage: { ...b.stage, ...stage, _id: targetStage }, boardOrder: order } : b)));
    try {
      const res = await api.patch(`/projects/${projectId}/work/items/${bug._id}/move`, { stage: targetStage, order });
      upsert(res.data.item);
      setStages((st) => st.map((s) => ({
        ...s,
        bugCount: s.bugCount + (s._id === targetStage ? 1 : 0) - (s._id === bug.stage?._id ? 1 : 0),
      })));
    } catch (err) {
      setBugs(previous);
      toast.error(errMsg(err, 'Could not move bug'));
    }
  };

  /* ---------- list view stage change ---------- */
  const changeStage = async (bug, stageId) => {
    try {
      const res = await api.patch(`/projects/${projectId}/work/items/${bug._id}/move`, { stage: stageId });
      upsert(res.data.item);
    } catch (err) {
      toast.error(errMsg(err, 'Could not change stage'));
    }
  };

  /* ---------- render ---------- */
  if (ctx.loading || loading) {
    return <div className="h-[50vh] flex items-center justify-center text-violet-500"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (ctx.error) return <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-4">{ctx.error}</p>;
  if (!canSee) {
    return <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-6 text-center">Your role does not have access to this project's Bug Sheet.</p>;
  }

  const activeBug = activeId ? bugs.find((b) => b._id === activeId) : null;
  const open = bugs.filter((b) => b.status !== 'completed').length;
  const inputCls = 'text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Bug className="w-4 h-4" /></div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Bug Sheet</h3>
            <p className="text-xs text-gray-400">{open} open · {bugs.length - open} done · {bugs.length} total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="tablist" aria-label="View">
            {[['board', LayoutGrid, 'Board'], ['list', List, 'List']].map(([key, Icon, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold ${view === key ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          {canManageStages && (
            <button type="button" onClick={() => setStagesOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              <Settings2 className="w-3.5 h-3.5" /> Stages
            </button>
          )}
          <button type="button" onClick={() => (modules.length ? setModal({ create: true }) : toast.error('Add a module on the Module Tree first'))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700">
            <Plus className="w-3.5 h-3.5" /> Report bug
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search bugs…"
            aria-label="Search bugs" className={`${inputCls} pl-8 w-44 sm:w-56`} />
        </div>
        <select aria-label="Module" value={filters.module} onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))} className={inputCls}>
          <option value="">All modules</option>
          {modules.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
        </select>
        <select aria-label="Severity" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className={inputCls}>
          <option value="">Any severity</option>
          {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 px-2 cursor-pointer">
          <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-200" checked={filters.mine}
            onChange={(e) => setFilters((f) => ({ ...f, mine: e.target.checked }))} />
          Mine
        </label>
      </div>

      {/* Board */}
      {view === 'board' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners}
          onDragStart={({ active }) => setActiveId(active.id)} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3 h-[calc(100vh-330px)] min-h-[420px]">
            {stages.map((s) => (
              <Column key={s._id} stage={s} bugs={byStage.get(s._id) || []} onOpen={(b) => setModal({ item: b })} canDrag={canDrag} />
            ))}
          </div>
          <DragOverlay>{activeBug ? <BugCard bug={activeBug} onOpen={() => {}} draggable overlay /> : null}</DragOverlay>
        </DndContext>
      ) : (
        /* List */
        <div className="rounded-2xl border border-gray-100 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                {['Bug', 'Module', 'Stage', 'Severity', 'Assignees', 'Reporter', 'Due', 'Updated'].map((h) => (
                  <th key={h} scope="col" className="text-left font-bold px-3 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-gray-400">No bugs match these filters.</td></tr>
              )}
              {visible.map((b) => {
                const scope = editScope(b, access, userId);
                return (
                  <tr key={b._id} className="hover:bg-violet-50/30">
                    <td className="px-3 py-2.5 min-w-[220px]">
                      <button type="button" onClick={() => setModal({ item: b })} className="text-left">
                        <span className="flex items-center gap-1.5 font-medium text-gray-800 hover:text-violet-700">
                          {b.isPrivate && <Lock className="w-3.5 h-3.5 text-violet-400" aria-label="Private" />}
                          {b.title}
                        </span>
                        <span className="text-[11px] text-gray-400">{b.taskCode}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.module?.color }} />{b.module?.name || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {scope ? (
                        <select aria-label={`Stage of ${b.title}`} value={b.stage?._id || ''} onChange={(e) => changeStage(b, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                          {stages.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.stage?.color }} />{b.stage?.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><Pill meta={PRIORITY_META[b.priority]} /></td>
                    <td className="px-3 py-2.5"><AvatarStack people={b.assignees} /></td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{b.reporter?.name || '—'}</td>
                    <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${isOverdue(b) ? 'text-rose-600 font-semibold' : 'text-gray-500'}`}>{fmtDate(b.deadline)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WorkItemModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        projectId={projectId}
        item={modal?.item || null}
        defaults={{ kind: 'bug', module: filters.module || undefined }}
        lockKind
        people={people}
        modules={modules}
        stages={stages}
        access={access}
        userId={userId}
        onSaved={(item) => { upsert(item); load(); }}
        onDeleted={(id) => { setBugs((list) => list.filter((b) => b._id !== id)); load(); }}
      />
      <StageManager open={stagesOpen} onClose={() => setStagesOpen(false)} projectId={projectId} stages={stages}
        onChange={(next) => { setStages(next); load(); }} />
    </div>
  );
};

export default BugSheet;
