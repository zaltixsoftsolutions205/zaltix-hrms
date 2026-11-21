import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Plus, Flag, ListChecks, Bug, Loader2, Lock, CalendarClock, Pencil, ChevronDown, ChevronRight, CheckCircle2, Circle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import WorkItemModal from './work/WorkItemModal';
import PlanModal from './work/PlanModal';
import {
  STATUS_META, PRIORITY_META, Pill, AvatarStack, hasLevel, editScope, errMsg, fmtDate, isOverdue, useProjectContext,
} from './work/workUtils';

const MODULE_STATUS = { planning: 'Planning', 'in-progress': 'In progress', done: 'Done' };

/* One task / milestone row. The circle toggles completed when allowed. */
const ItemRow = ({ item, scope, onOpen, onToggle }) => {
  const done = item.status === 'completed';
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50/30">
      <button type="button" disabled={!scope} onClick={() => onToggle(item)}
        aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
        className="shrink-0 text-gray-300 hover:text-emerald-500 disabled:cursor-not-allowed disabled:hover:text-gray-300">
        {done ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
      </button>
      <button type="button" onClick={() => onOpen(item)} className="flex-1 min-w-0 text-left">
        <span className={`flex items-center gap-1.5 text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {item.kind === 'milestone' && <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          {item.isPrivate && <Lock className="w-3.5 h-3.5 text-violet-400 shrink-0" aria-label="Private" />}
          <span className="truncate">{item.title}</span>
        </span>
        <span className="text-[11px] text-gray-400">{item.taskCode}</span>
      </button>
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <Pill meta={PRIORITY_META[item.priority]} />
        <Pill meta={STATUS_META[item.status]} />
      </div>
      <AvatarStack people={item.assignees} max={2} />
      <span className={`hidden md:inline-flex items-center gap-1 text-[11px] w-24 justify-end shrink-0 ${isOverdue(item) ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>
        {item.deadline && <><CalendarClock className="w-3 h-3" /> {fmtDate(item.deadline)}</>}
      </span>
    </li>
  );
};

const ProgressBar = ({ value }) => (
  <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-full rounded-full transition-all ${value >= 100 ? 'bg-emerald-500' : 'bg-violet-500'}`} style={{ width: `${Math.min(100, value)}%` }} />
  </div>
);

const ModuleWorkspace = () => {
  const { id: projectId, moduleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?._id;
  const ctx = useProjectContext(projectId);
  const { access, people, modules, project } = ctx;
  const mod = modules.find((m) => m._id === moduleId);

  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemModal, setItemModal] = useState(null); // { item } | { defaults }
  const [planModal, setPlanModal] = useState(null); // { plan } | {}
  const [collapsed, setCollapsed] = useState({});
  const [hideDone, setHideDone] = useState(false);

  const canSeeTasks = hasLevel(access, 'tasks', 'view');
  const canEditTasks = hasLevel(access, 'tasks', 'edit');
  const canSeeBugs = hasLevel(access, 'bugs', 'view');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [it, pl] = await Promise.all([
        api.get(`/projects/${projectId}/work/items`, { params: { kind: 'task,milestone', module: moduleId } }),
        api.get(`/projects/${projectId}/work/plans`, { params: { module: moduleId } }),
      ]);
      setItems(it.data.items || []);
      setPlans(pl.data.plans || []);
    } catch (err) {
      toast.error(errMsg(err, 'Could not load this module'));
    } finally {
      setLoading(false);
    }
  }, [projectId, moduleId]);

  useEffect(() => { if (!ctx.loading && canSeeTasks) load(); else if (!ctx.loading) setLoading(false); }, [ctx.loading, canSeeTasks, load]);

  const shown = useMemo(() => (hideDone ? items.filter((i) => i.status !== 'completed') : items), [items, hideDone]);
  const milestones = useMemo(() => items.filter((i) => i.kind === 'milestone').sort((a, b) => new Date(a.deadline) - new Date(b.deadline)), [items]);
  const groups = useMemo(() => {
    const byPlan = new Map(plans.map((p) => [p._id, []]));
    const loose = [];
    shown.forEach((i) => { const k = i.plan?._id; if (k && byPlan.has(k)) byPlan.get(k).push(i); else loose.push(i); });
    return { byPlan, loose };
  }, [plans, shown]);

  const stats = useMemo(() => {
    const tasks = items.filter((i) => i.kind === 'task');
    return {
      tasks: tasks.length,
      done: tasks.filter((t) => t.status === 'completed').length,
      overdue: items.filter(isOverdue).length,
      milestones: milestones.length,
    };
  }, [items, milestones]);

  const refreshPlans = async () => {
    try {
      const pl = await api.get(`/projects/${projectId}/work/plans`, { params: { module: moduleId } });
      setPlans(pl.data.plans || []);
    } catch { /* keep current */ }
  };

  const toggleDone = async (item) => {
    const next = item.status === 'completed' ? 'in-progress' : 'completed';
    try {
      const res = await api.put(`/projects/${projectId}/work/items/${item._id}`, { status: next });
      setItems((list) => list.map((i) => (i._id === item._id ? res.data.item : i)));
      refreshPlans();
    } catch (err) {
      toast.error(errMsg(err, 'Could not update'));
    }
  };

  /* ---------- states ---------- */
  if (ctx.loading || loading) {
    return <div className="h-[60vh] flex items-center justify-center text-violet-500"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (ctx.error || !mod) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <p className="text-sm text-gray-600">{ctx.error || 'This module no longer exists.'}</p>
        <button type="button" onClick={() => navigate(`/projects/${projectId}?tab=module-tree`)} className="mt-4 text-sm font-semibold text-violet-700 underline">Back to the module tree</button>
      </div>
    );
  }

  const renderList = (list, emptyText) => (
    list.length === 0
      ? <p className="px-3 py-4 text-xs text-gray-400">{emptyText}</p>
      : (
        <ul className="divide-y divide-gray-50">
          {list.map((i) => (
            <ItemRow key={i._id} item={i} scope={editScope(i, access, userId)} onOpen={(it) => setItemModal({ item: it })} onToggle={toggleDone} />
          ))}
        </ul>
      )
  );

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm" style={{ borderTop: `4px solid ${mod.color}` }}>
        <Link to={`/projects/${projectId}?tab=module-tree`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-violet-700">
          <ArrowLeft className="w-3.5 h-3.5" /> {project?.name || 'Project'} · Module Tree
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight truncate">{mod.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {MODULE_STATUS[mod.status] || mod.status} · Lead: {mod.lead?.name || 'not set'}
            </p>
            {mod.description && <p className="text-sm text-gray-600 mt-2 max-w-2xl">{mod.description}</p>}
          </div>
          {canEditTasks && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPlanModal({})}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-50">
                <ListChecks className="w-3.5 h-3.5" /> New plan
              </button>
              <button type="button" onClick={() => setItemModal({ defaults: { kind: 'milestone', module: moduleId } })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-50">
                <Flag className="w-3.5 h-3.5" /> Milestone
              </button>
              <button type="button" onClick={() => setItemModal({ defaults: { kind: 'task', module: moduleId } })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
                <Plus className="w-3.5 h-3.5" /> Task
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Tasks done', `${stats.done}/${stats.tasks}`],
            ['Overdue', stats.overdue],
            ['Milestones', stats.milestones],
            ['Open bugs', mod.counts?.bug?.open ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-lg font-bold text-gray-900 leading-none">{value}</p>
              <p className="text-[11px] text-gray-400 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {!canSeeTasks ? (
        <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-6 text-center">
          Your role does not have access to Tasks &amp; Plans in this project.
          {canSeeBugs && <> You can still <Link className="text-violet-700 underline" to={`/projects/${projectId}?tab=bug-sheet&module=${moduleId}`}>see this module's bugs</Link>.</>}
        </p>
      ) : (
        <>
          {/* Milestones */}
          {milestones.length > 0 && (
            <section aria-label="Milestones" className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-2 px-1">Milestones</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {milestones.map((m) => (
                  <button key={m._id} type="button" onClick={() => setItemModal({ item: m })}
                    className={`shrink-0 rounded-xl border bg-white px-3 py-2 text-left hover:border-amber-300 ${m.status === 'completed' ? 'border-emerald-200' : isOverdue(m) ? 'border-rose-200' : 'border-amber-100'}`}>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                      {m.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Flag className="w-3.5 h-3.5 text-amber-500" />}
                      {m.title}
                    </span>
                    <span className={`text-[11px] ${isOverdue(m) ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>{fmtDate(m.deadline)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Plans &amp; tasks</h3>
            <div className="flex items-center gap-3">
              {canSeeBugs && (
                <Link to={`/projects/${projectId}?tab=bug-sheet&module=${moduleId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline">
                  <Bug className="w-3.5 h-3.5" /> Module bugs
                </Link>
              )}
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-200" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                Hide done
              </label>
            </div>
          </div>

          {/* Plans */}
          {plans.map((p) => {
            const list = groups.byPlan.get(p._id) || [];
            const isOpen = !collapsed[p._id];
            return (
              <section key={p._id} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [p._id]: isOpen }))} aria-expanded={isOpen}
                    className="text-gray-400 hover:text-gray-600" aria-label={isOpen ? 'Collapse plan' : 'Expand plan'}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <span className="text-xs font-bold text-gray-700 shrink-0">{p.progress}%</span>
                    </div>
                    <div className="mt-1.5"><ProgressBar value={p.progress} /></div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {p.completedCount}/{p.taskCount} done
                      {(p.startDate || p.endDate) && ` · ${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}`}
                    </p>
                  </div>
                  {canEditTasks && (
                    <button type="button" onClick={() => setPlanModal({ plan: p })} className="text-gray-300 hover:text-violet-600" aria-label={`Edit plan ${p.name}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="border-t border-gray-50">
                    {renderList(list, hideDone && p.taskCount ? 'Everything here is done.' : 'No tasks in this plan yet.')}
                    {canEditTasks && (
                      <button type="button" onClick={() => setItemModal({ defaults: { kind: 'task', module: moduleId, plan: p._id } })}
                        className="w-full text-left px-4 py-2 text-xs font-semibold text-violet-600 hover:bg-violet-50/50 border-t border-gray-50">
                        + Add task to {p.name}
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {/* Not in a plan */}
          <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <p className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-50">
              {plans.length ? 'Not in a plan' : 'Tasks'} <span className="text-gray-400 font-normal">· {groups.loose.length}</span>
            </p>
            {renderList(groups.loose, canEditTasks ? 'No tasks yet. Use “Task” to add the first one.' : 'No tasks yet.')}
          </section>
        </>
      )}

      <WorkItemModal
        open={Boolean(itemModal)}
        onClose={() => setItemModal(null)}
        projectId={projectId}
        item={itemModal?.item || null}
        defaults={itemModal?.defaults || {}}
        people={people}
        modules={modules}
        access={access}
        userId={userId}
        onSaved={(item) => {
          setItems((list) => {
            const others = list.filter((i) => i._id !== item._id);
            return item.module?._id === moduleId && item.kind !== 'bug' ? [...others, item] : others;
          });
          refreshPlans();
        }}
        onDeleted={(id) => { setItems((list) => list.filter((i) => i._id !== id)); refreshPlans(); }}
      />
      <PlanModal
        open={Boolean(planModal)}
        onClose={() => setPlanModal(null)}
        projectId={projectId}
        moduleId={moduleId}
        plan={planModal?.plan || null}
        items={items}
        onSaved={() => load()}
        onDeleted={() => load()}
      />
    </motion.div>
  );
};

export default ModuleWorkspace;
