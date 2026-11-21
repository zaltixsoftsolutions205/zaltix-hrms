import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gantt, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { CalendarRange, Loader2, Flag, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import WorkItemModal from './work/WorkItemModal';
import { STATUS_META, hasLevel, editScope, errMsg, fmtDate, useProjectContext } from './work/workUtils';

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);
/** yyyy-mm-dd in local time (what the date inputs and API expect). */
const ymd = (d) => {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const VIEWS = [
  [ViewMode.Day, 'Day', 60],
  [ViewMode.Week, 'Week', 160],
  [ViewMode.Month, 'Month', 220],
];

const hexToRgba = (hex, a) => {
  const h = String(hex || '#7C3AED').replace('#', '');
  const n = parseInt(h.length === 6 ? h : '7C3AED', 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Bar of an item: start day → day after the deadline (end is exclusive). */
const itemSpan = (item) => {
  if (item.kind === 'milestone') {
    const d = startOfDay(item.deadline || item.startDate || new Date());
    return { start: d, end: d };
  }
  const start = startOfDay(item.startDate || item.createdAt || new Date());
  const due = item.deadline ? startOfDay(item.deadline) : start;
  return { start, end: addDays(due < start ? start : due, 1) };
};

const Tooltip = ({ task }) => {
  const meta = task.meta || {};
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-3 py-2.5 text-xs max-w-[260px]">
      <p className="font-semibold text-gray-900 text-sm mb-1">{task.name}</p>
      <p className="text-gray-500">
        {meta.kind === 'milestone'
          ? `Milestone · ${fmtDate(task.start)}`
          : `${fmtDate(task.start)} → ${fmtDate(addDays(task.end, -1))}`}
      </p>
      {meta.kind && meta.kind !== 'module' && meta.kind !== 'plan' && (
        <p className="text-gray-500 mt-0.5">{STATUS_META[meta.status]?.label || meta.status} · {task.progress}%</p>
      )}
      {(meta.kind === 'plan' || meta.kind === 'module') && <p className="text-gray-500 mt-0.5">{task.progress}% complete</p>}
      {meta.assignees?.length > 0 && <p className="text-gray-400 mt-0.5 truncate">{meta.assignees.map((a) => a.name).join(', ')}</p>}
      {meta.hint && <p className="text-violet-500 mt-1">{meta.hint}</p>}
    </div>
  );
};

const Timeline = ({ projectId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?._id;
  const ctx = useProjectContext(projectId);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState(ViewMode.Week);
  const [moduleFilter, setModuleFilter] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [editItem, setEditItem] = useState(null);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.get(`/projects/${projectId}/work/timeline`);
      setData(res.data);
    } catch (err) {
      setError(errMsg(err, 'Could not load the timeline.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const access = data?.access || {};
  const canDrag = hasLevel(access, 'timeline', 'edit');
  const canEditPlans = canDrag && hasLevel(access, 'tasks', 'edit');

  /* ---------- build Gantt rows: module → plan → tasks/milestones ---------- */
  const rows = useMemo(() => {
    if (!data) return [];
    const items = data.items.filter((i) => !hideDone || i.status !== 'completed');
    const out = [];
    let order = 0;
    const push = (row) => { out.push({ ...row, displayOrder: (order += 1) }); };

    data.modules
      .filter((m) => !moduleFilter || m._id === moduleFilter)
      .forEach((mod) => {
        const modItems = items.filter((i) => i.module?._id === mod._id);
        const modPlans = data.plans.filter((p) => String(p.module) === mod._id);
        const planRows = [];
        modPlans.forEach((p) => {
          const pItems = modItems.filter((i) => i.plan?._id === p._id);
          const spans = pItems.map(itemSpan);
          const start = p.startDate ? startOfDay(p.startDate) : spans.length ? new Date(Math.min(...spans.map((s) => s.start))) : null;
          const end = p.endDate ? addDays(p.endDate, 1) : spans.length ? new Date(Math.max(...spans.map((s) => s.end))) : null;
          if (!start || !end) return; // nothing to draw yet
          planRows.push({ plan: p, items: pItems, start, end: end <= start ? addDays(start, 1) : end });
        });
        const loose = modItems.filter((i) => !i.plan || !planRows.some((pr) => pr.plan._id === i.plan._id));
        const allSpans = [...planRows.map((pr) => ({ start: pr.start, end: pr.end })), ...modItems.map(itemSpan)];
        if (!allSpans.length) return; // empty module: no bar

        const modId = `m:${mod._id}`;
        const progressOf = modItems.filter((i) => i.kind === 'task');
        push({
          id: modId,
          type: 'project',
          name: mod.name,
          start: new Date(Math.min(...allSpans.map((s) => s.start))),
          end: new Date(Math.max(...allSpans.map((s) => s.end))),
          progress: progressOf.length ? Math.round(progressOf.reduce((s, i) => s + (i.progress || 0), 0) / progressOf.length) : 0,
          isDisabled: true,
          hideChildren: Boolean(collapsed[modId]),
          styles: { backgroundColor: hexToRgba(mod.color, 0.35), backgroundSelectedColor: hexToRgba(mod.color, 0.5), progressColor: mod.color, progressSelectedColor: mod.color },
          meta: { kind: 'module', moduleId: mod._id, hint: 'Double-click to open the module' },
        });

        const pushItem = (i, parent) => {
          const { start, end } = itemSpan(i);
          const done = i.status === 'completed';
          const color = done ? '#10B981' : mod.color;
          push({
            id: `i:${i._id}`,
            type: i.kind === 'milestone' ? 'milestone' : 'task',
            name: i.kind === 'milestone' ? `◆ ${i.title}` : i.title,
            start,
            end,
            progress: i.kind === 'milestone' ? (done ? 100 : 0) : (i.progress || 0),
            project: parent,
            isDisabled: !(canDrag && editScope(i, access, userId) === 'full'),
            styles: i.kind === 'milestone'
              ? { backgroundColor: done ? '#10B981' : '#F59E0B', backgroundSelectedColor: done ? '#059669' : '#D97706' }
              : { backgroundColor: hexToRgba(color, 0.45), backgroundSelectedColor: hexToRgba(color, 0.65), progressColor: color, progressSelectedColor: color },
            meta: { kind: i.kind, item: i, status: i.status, assignees: i.assignees },
          });
        };

        planRows.forEach(({ plan, items: pItems, start, end }) => {
          const planId = `p:${plan._id}`;
          push({
            id: planId,
            type: 'project',
            name: `${plan.name} · plan`,
            start,
            end,
            progress: plan.progress,
            project: modId,
            isDisabled: !canEditPlans,
            hideChildren: Boolean(collapsed[planId]),
            styles: { backgroundColor: '#C4B5FD', backgroundSelectedColor: '#A78BFA', progressColor: '#7C3AED', progressSelectedColor: '#6D28D9' },
            meta: { kind: 'plan', plan },
          });
          pItems.sort((a, b) => itemSpan(a).start - itemSpan(b).start).forEach((i) => pushItem(i, planId));
        });
        loose.sort((a, b) => itemSpan(a).start - itemSpan(b).start).forEach((i) => pushItem(i, modId));
      });
    return out;
  }, [data, moduleFilter, hideDone, collapsed, canDrag, canEditPlans, access, userId]);

  /* ---------- edits by dragging ---------- */
  const onDateChange = async (task) => {
    const meta = task.meta || {};
    try {
      if (meta.kind === 'plan') {
        await api.put(`/projects/${projectId}/work/plans/${meta.plan._id}`, { startDate: ymd(task.start), endDate: ymd(addDays(task.end, -1)) });
      } else if (meta.kind === 'milestone') {
        await api.put(`/projects/${projectId}/work/items/${meta.item._id}`, { deadline: ymd(task.start) });
      } else if (meta.kind === 'task') {
        const lastDay = addDays(task.end, -1);
        await api.put(`/projects/${projectId}/work/items/${meta.item._id}`, {
          startDate: ymd(task.start),
          deadline: ymd(lastDay < startOfDay(task.start) ? task.start : lastDay),
        });
      } else {
        return false;
      }
      toast.success('Dates updated');
      load();
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Could not change the dates'));
      load();
      return false;
    }
  };

  const onProgressChange = async (task) => {
    const meta = task.meta || {};
    if (meta.kind !== 'task') return false;
    try {
      await api.put(`/projects/${projectId}/work/items/${meta.item._id}`, { progress: Math.round(task.progress) });
      load();
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Could not change progress'));
      load();
      return false;
    }
  };

  const onDoubleClick = (task) => {
    const meta = task.meta || {};
    if (meta.kind === 'task' || meta.kind === 'milestone') setEditItem(meta.item);
    else if (meta.kind === 'plan') navigate(`/projects/${projectId}/modules/${meta.plan.module}`);
    else if (meta.kind === 'module') navigate(`/projects/${projectId}/modules/${meta.moduleId}`);
  };

  /* ---------- render ---------- */
  if (loading) {
    return <div className="h-[50vh] flex items-center justify-center text-violet-500"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (error) {
    return <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-6 text-center">{error}</p>;
  }

  const counts = {
    tasks: data.items.filter((i) => i.kind === 'task').length,
    milestones: data.items.filter((i) => i.kind === 'milestone').length,
    plans: data.plans.length,
  };
  const colWidth = VIEWS.find(([v]) => v === view)?.[2] || 160;
  const inputCls = 'text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center"><CalendarRange className="w-4 h-4" /></div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Timeline</h3>
            <p className="text-xs text-gray-400">{counts.plans} plans · {counts.tasks} tasks · {counts.milestones} milestones · bugs are not shown</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Module" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className={inputCls}>
            <option value="">All modules</option>
            {data.modules.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer px-1">
            <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-200" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            Hide done
          </label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="tablist" aria-label="Zoom">
            {VIEWS.map(([mode, label]) => (
              <button key={label} type="button" role="tab" aria-selected={view === mode} onClick={() => setView(mode)}
                className={`px-3 py-2 text-xs font-semibold ${view === mode ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!canDrag && rows.length > 0 && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
          <Eye className="w-3 h-3" /> View only — double-click a bar to see details
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <Flag className="w-8 h-8 text-violet-200 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-700">Nothing on the timeline yet</p>
          <p className="text-xs text-gray-400 mt-1">Tasks, plans and milestones from the project's modules appear here once they have dates.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden gantt-wrap">
          <Gantt
            tasks={rows}
            viewMode={view}
            columnWidth={colWidth}
            listCellWidth={narrow ? '' : '180px'}
            rowHeight={42}
            barCornerRadius={6}
            barFill={62}
            fontSize="12px"
            ganttHeight={Math.min(560, rows.length * 42 + 10)}
            todayColor="rgba(124, 58, 237, 0.08)"
            locale="en-IN"
            TooltipContent={Tooltip}
            onDateChange={onDateChange}
            onProgressChange={onProgressChange}
            onDoubleClick={onDoubleClick}
            onExpanderClick={(task) => setCollapsed((c) => ({ ...c, [task.id]: !task.hideChildren }))}
          />
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        {canDrag ? 'Drag a bar to move it, drag its ends to change dates, drag the progress handle to update progress. ' : ''}
        Double-click a task or milestone to open it, or a module / plan to open the module.
      </p>

      <WorkItemModal
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        projectId={projectId}
        item={editItem}
        people={ctx.people}
        modules={ctx.modules}
        access={ctx.access}
        userId={userId}
        onSaved={() => load()}
        onDeleted={() => load()}
      />
    </div>
  );
};

export default Timeline;
