import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Check, LayoutDashboard, Move, Pencil, Plus, Trash2,
} from 'lucide-react';
import AnalyticsService, { errorOf } from '../../services/AnalyticsService';
import Modal from '../UI/Modal';
import Spinner from '../UI/Spinner';
import DashboardGrid, { defaultSize, findSpot } from './DashboardGrid';
import DashboardFilterBar, { cleanDashboardFilters } from './DashboardFilterBar';
import { CHART_ICONS } from './WidgetBuilder';
import { inputCls } from './ConditionList';

const MAX_ITEMS = 50;

/**
 * Server dashboard -> grid items (widget objects come from the library when known).
 * A widget appears once per dashboard, so its id is the grid key: it stays the same
 * across saves and the charts are not reloaded.
 */
const toItems = (dash, library) => dash.items.map((it) => ({
  id: it.widget._id,
  widget: library.find((w) => w._id === it.widget._id) || it.widget,
  layout: it.layout,
}));
const toPayload = (items) => items.map((it) => ({ widget: it.widget._id, layout: it.layout }));

/** Title + description form, for a new dashboard or renaming one. */
export function DashboardDetailsDialog({
  open, initial, onClose, onSubmit, title,
}) {
  const [form, setForm] = useState({ title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setForm({ title: initial?.title || '', description: initial?.description || '' }); setError(''); }
  }, [open, initial]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Enter a title'); return; }
    setSaving(true);
    try {
      await onSubmit({ title: form.title.trim(), description: form.description.trim() });
    } catch (err) {
      setError(errorOf(err).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Title</span>
          <input autoFocus className={inputCls} value={form.title} maxLength={120} placeholder="e.g. Sales overview" onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(''); }} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Description (optional)</span>
          <textarea className={inputCls} rows={2} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Pick saved widgets to place on the dashboard, or create a new one. */
function AddWidgetsDialog({
  open, library, onDashboard, room, onClose, onAdd, onCreate,
}) {
  const [picked, setPicked] = useState([]);
  useEffect(() => { if (open) setPicked([]); }, [open]);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < room ? [...p, id] : p));
  return (
    <Modal isOpen={open} onClose={onClose} title="Add widgets" size="lg">
      <div className="space-y-3">
        <button type="button" onClick={onCreate} className="!flex w-full !justify-start gap-3 rounded-xl border-2 border-dashed border-violet-200 px-4 py-3 text-left hover:border-violet-400 hover:bg-violet-50/50">
          <span className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0"><Plus size={18} /></span>
          <span>
            <span className="block text-sm font-bold text-gray-900">Create a new widget</span>
            <span className="block text-xs text-gray-500">Build a chart and place it on this dashboard</span>
          </span>
        </button>
        {library.length > 0 && <p className="text-xs font-semibold text-gray-500 pt-1">Or choose saved widgets</p>}
        <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          {library.map((w) => {
            const Icon = CHART_ICONS[w.chartType] || LayoutDashboard;
            const placed = onDashboard.has(w._id);
            const on = picked.includes(w._id);
            return (
              <li key={w._id}>
                <label className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${placed ? 'opacity-50 cursor-not-allowed border-gray-100' : on ? 'border-violet-400 bg-violet-50 cursor-pointer' : 'border-gray-200 hover:border-violet-300 cursor-pointer'}`}>
                  <input type="checkbox" className="accent-violet-600" disabled={placed} checked={on} onChange={() => toggle(w._id)} />
                  <Icon size={18} className="text-violet-600 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{w.title}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{w.description || w.source}</span>
                  </span>
                  {placed && <span className="text-[11px] text-gray-500 whitespace-nowrap">On this dashboard</span>}
                </label>
              </li>
            );
          })}
        </ul>
        {room <= 0 && <p className="text-xs text-amber-700">This dashboard is full ({MAX_ITEMS} widgets).</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" disabled={!picked.length} onClick={() => onAdd(library.filter((w) => picked.includes(w._id)))} className="btn-primary">
            Add {picked.length || ''} widget{picked.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One dashboard: filter bar + widget grid.
 *   library       the user's saved widgets (kept up to date by the panel)
 *   openBuilder   (widget | null, onSaved) -> opens the widget builder
 *   onChanged     (summary) after a rename / item change
 *   onDeleted     ()
 */
export default function DashboardView({
  dashboardId, catalog, library, openBuilder, onChanged, onDeleted, onEditingChange,
}) {
  const [dash, setDash] = useState(null);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [breakpoint, setBreakpoint] = useState('lg');
  const [dialog, setDialog] = useState(null); // 'add' | 'details' | 'delete'
  const libraryRef = useRef(library);
  libraryRef.current = library;

  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);

  /* load */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEditing(false);
    AnalyticsService.getDashboard(dashboardId)
      .then((d) => {
        if (!alive) return;
        setDash(d);
        setItems(toItems(d, libraryRef.current));
        setFilters(d.filters || {});
        setLoadError(null);
      })
      .catch((err) => alive && setLoadError(errorOf(err).message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [dashboardId]);

  /* keep widget objects in step with the library (edited / deleted widgets) */
  useEffect(() => {
    setItems((list) => {
      const next = list
        .filter((it) => library.some((w) => w._id === it.widget._id))
        .map((it) => ({ ...it, widget: library.find((w) => w._id === it.widget._id) }));
      return next.length === list.length && next.every((it, i) => it.widget === list[i].widget) ? list : next;
    });
  }, [library]);

  /* dashboard filters: applied at once, saved quietly */
  const applied = useMemo(() => cleanDashboardFilters(filters), [filters]);
  const appliedKey = JSON.stringify(applied);
  const savedKey = useRef(null);
  useEffect(() => {
    if (!dash) return undefined;
    if (savedKey.current === null) { savedKey.current = JSON.stringify(cleanDashboardFilters(dash.filters || {})); }
    if (appliedKey === savedKey.current) return undefined;
    const t = setTimeout(() => {
      AnalyticsService.updateDashboard(dashboardId, { filters: applied })
        .then(() => { savedKey.current = appliedKey; })
        .catch((err) => toast.error(`Filters not saved: ${errorOf(err).message}`));
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey, dash]);
  useEffect(() => { savedKey.current = null; }, [dashboardId]);

  /* save items (layout / added / removed) */
  const commit = async (next) => {
    setSaving(true);
    try {
      const d = await AnalyticsService.updateDashboard(dashboardId, { items: toPayload(next) });
      setDash(d);
      setItems(toItems(d, libraryRef.current));
      onChanged?.({ _id: d._id, title: d.title, description: d.description, widgetCount: d.items.length });
      return true;
    } catch (err) {
      toast.error(errorOf(err).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => { setSnapshot(items); setEditing(true); };
  const cancelEditing = () => { setItems(snapshot || items); setEditing(false); setSnapshot(null); };
  const saveEditing = async () => {
    if (await commit(items)) { setEditing(false); setSnapshot(null); toast.success('Layout saved'); }
  };

  const addWidgets = async (widgets) => {
    setDialog(null);
    let next = [...items];
    widgets.filter((w) => !items.some((it) => it.id === w._id)).forEach((w) => {
      const [wd, h] = defaultSize(w.chartType);
      const spot = findSpot(next.map((it) => it.layout), wd, h);
      next = [...next, { id: w._id, widget: w, layout: { ...spot, w: wd, h } }];
    });
    if (editing) setItems(next);
    else if (await commit(next)) toast.success(widgets.length > 1 ? `${widgets.length} widgets added` : 'Widget added');
  };

  const removeItem = async (id) => {
    const next = items.filter((it) => it.id !== id);
    if (editing) setItems(next);
    else if (await commit(next)) toast.success('Removed from dashboard');
  };

  const rename = async (body) => {
    const d = await AnalyticsService.updateDashboard(dashboardId, body);
    setDash(d);
    onChanged?.({ _id: d._id, title: d.title, description: d.description, widgetCount: d.items.length });
    setDialog(null);
  };

  const remove = async () => {
    try {
      await AnalyticsService.deleteDashboard(dashboardId);
      toast.success('Dashboard deleted');
      setDialog(null);
      onDeleted?.();
    } catch (err) {
      toast.error(errorOf(err).message);
    }
  };

  if (loading) return <div className="py-20 flex justify-center"><Spinner size="lg" /></div>;
  if (loadError) return <div className="glass-card p-8 text-center text-sm text-gray-700">{loadError}</div>;

  const onDashboard = new Set(items.map((it) => it.widget._id));
  const wide = breakpoint === 'lg';

  return (
    <div className="space-y-3">
      {/* Title + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-extrabold text-gray-900 truncate">{dash.title}</h3>
          {dash.description && <p className="text-xs text-gray-500">{dash.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <span className="text-xs text-violet-700 font-semibold hidden sm:inline">Drag a card by its title · resize from the corner</span>
              <button type="button" onClick={() => setDialog('add')} className="btn-secondary !py-1.5" disabled={items.length >= MAX_ITEMS}><Plus size={15} /> Add widgets</button>
              <button type="button" onClick={cancelEditing} className="btn-secondary !py-1.5" disabled={saving}>Cancel</button>
              <button type="button" onClick={saveEditing} className="btn-primary !py-1.5" disabled={saving}><Check size={15} /> {saving ? 'Saving…' : 'Save layout'}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setDialog('add')} className="btn-primary !py-1.5" disabled={items.length >= MAX_ITEMS}><Plus size={15} /> Add widgets</button>
              {items.length > 0 && wide && <button type="button" onClick={startEditing} className="btn-secondary !py-1.5"><Move size={15} /> Edit layout</button>}
              <button type="button" onClick={() => setDialog('details')} className="btn-secondary !py-1.5 !px-2.5" title="Rename" aria-label="Rename dashboard"><Pencil size={15} /></button>
              <button type="button" onClick={() => setDialog('delete')} className="btn-secondary !py-1.5 !px-2.5 hover:!text-red-600" title="Delete dashboard" aria-label="Delete dashboard"><Trash2 size={15} /></button>
            </>
          )}
        </div>
      </div>

      <DashboardFilterBar catalog={catalog} value={filters} onChange={setFilters} />

      {items.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center"><LayoutDashboard size={24} /></div>
          <div>
            <p className="font-bold text-gray-900">This dashboard is empty</p>
            <p className="text-sm text-gray-500 mt-1">Add saved widgets or create a new one.</p>
          </div>
          <button type="button" onClick={() => setDialog('add')} className="btn-primary"><Plus size={16} /> Add widgets</button>
        </div>
      ) : (
        <DashboardGrid
          items={items}
          filters={applied}
          editing={editing && wide}
          onLayout={setItems}
          onEditWidget={(w) => openBuilder(w)}
          onRemove={removeItem}
          onBreakpoint={setBreakpoint}
        />
      )}
      {!wide && items.length > 0 && <p className="text-[11px] text-gray-500 text-center">Open on a wider screen to arrange the widgets.</p>}

      <AddWidgetsDialog
        open={dialog === 'add'}
        library={library}
        onDashboard={onDashboard}
        room={MAX_ITEMS - items.length}
        onClose={() => setDialog(null)}
        onAdd={addWidgets}
        onCreate={() => { setDialog(null); openBuilder(null, (saved) => addWidgets([saved])); }}
      />
      <DashboardDetailsDialog open={dialog === 'details'} initial={dash} title="Rename dashboard" onClose={() => setDialog(null)} onSubmit={rename} />
      <Modal isOpen={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete dashboard" size="sm">
        <p className="text-sm text-gray-700">Delete <b>{dash.title}</b>? Its widgets stay saved in your widget list.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={() => setDialog(null)} className="btn-secondary">Cancel</button>
          <button type="button" onClick={remove} className="btn-danger">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
