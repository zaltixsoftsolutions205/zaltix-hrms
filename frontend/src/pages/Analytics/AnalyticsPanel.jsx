import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChartNoAxesCombined, LayoutDashboard, Plus } from 'lucide-react';
import AnalyticsService, { errorOf } from '../../services/AnalyticsService';
import Spinner from '../../components/UI/Spinner';
import WidgetCard from '../../components/Analytics/WidgetCard';
import WidgetBuilder from '../../components/Analytics/WidgetBuilder';
import DashboardView, { DashboardDetailsDialog } from '../../components/Analytics/DashboardView';

const LAST_DASHBOARD = 'analytics.lastDashboard';
const LAST_VIEW = 'analytics.view';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage unavailable */ } };

function EmptyState({
  icon: Icon, title, text, action,
}) {
  return (
    <div className="glass-card p-10 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center"><Icon size={24} /></div>
      <div>
        <p className="font-bold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-1 max-w-md">{text}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Analytics tab of the Admin / HR dashboard.
 *   Dashboards  the user's dashboards: filters + drag/resize grid of widgets
 *   My widgets  every saved widget, and "Add Analytics"
 * Dashboards and widgets are private to their creator.
 */
export default function AnalyticsPanel() {
  const [catalog, setCatalog] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState(() => (read(LAST_VIEW) === 'widgets' ? 'widgets' : 'dashboards'));
  const [current, setCurrent] = useState(() => read(LAST_DASHBOARD));
  const [builder, setBuilder] = useState(null); // { widget, onSaved }
  const [creating, setCreating] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([AnalyticsService.catalog(), AnalyticsService.listWidgets(), AnalyticsService.listDashboards()])
      .then(([cat, list, dashes]) => {
        setCatalog(cat);
        setWidgets(list);
        setDashboards(dashes);
        setCurrent((c) => (dashes.some((d) => d._id === c) ? c : dashes[0]?._id || null));
        setError(null);
      })
      .catch((err) => setError(errorOf(err).message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { write(LAST_DASHBOARD, current); }, [current]);
  useEffect(() => { write(LAST_VIEW, view); }, [view]);

  const openBuilder = useCallback((widget, onSaved) => setBuilder({ widget, onSaved }), []);

  const onWidgetSaved = (saved) => {
    setWidgets((list) => [saved, ...list.filter((w) => w._id !== saved._id)]);
    const after = builder?.onSaved;
    setBuilder(null);
    after?.(saved);
  };

  const deleteWidget = async (widget) => {
    try {
      await AnalyticsService.deleteWidget(widget._id);
      setWidgets((list) => list.filter((w) => w._id !== widget._id));
      toast.success('Widget deleted');
    } catch (err) {
      toast.error(errorOf(err).message);
    }
  };

  const createDashboard = async (body) => {
    const d = await AnalyticsService.createDashboard(body);
    setDashboards((list) => [{ _id: d._id, title: d.title, description: d.description, widgetCount: 0 }, ...list]);
    setCurrent(d._id);
    setView('dashboards');
    setCreating(false);
    toast.success('Dashboard created');
  };

  const onDashboardChanged = useCallback((summary) => {
    setDashboards((list) => list.map((d) => (d._id === summary._id ? { ...d, ...summary } : d)));
  }, []);
  const onDashboardDeleted = () => {
    const rest = dashboards.filter((d) => d._id !== current);
    setDashboards(rest);
    setCurrent(rest[0]?._id || null);
  };

  if (loading) return <div className="py-24 flex justify-center"><Spinner size="lg" /></div>;
  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-sm text-gray-700">{error}</p>
        <button type="button" onClick={load} className="btn-secondary mt-3">Try again</button>
      </div>
    );
  }
  const noData = !catalog.modules.length;
  if (noData) return <div className="glass-card p-8 text-center text-sm text-gray-600">You do not have access to any data that can be analysed.</div>;

  const subTab = (key, label, Icon, count) => (
    <button type="button" onClick={() => setView(key)} disabled={editingLayout} role="tab" aria-selected={view === key}
      className={`gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${view === key ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-800'} disabled:opacity-50`}>
      <Icon size={15} /> {label} <span className="text-[11px] font-medium text-gray-400">{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200">
        <div role="tablist" aria-label="Analytics views" className="flex">
          {subTab('dashboards', 'Dashboards', LayoutDashboard, dashboards.length)}
          {subTab('widgets', 'My widgets', ChartNoAxesCombined, widgets.length)}
        </div>
        <p className="text-[11px] text-gray-500 pb-2">
          {catalog.scope === 'all' ? 'All company data' : "Your department's data"} · only you can see these
        </p>
      </div>

      {view === 'dashboards' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {dashboards.map((d) => (
              <button key={d._id} type="button" onClick={() => setCurrent(d._id)} disabled={editingLayout && d._id !== current}
                title={editingLayout && d._id !== current ? 'Save or cancel the layout first' : d.description || d.title}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold max-w-[220px] ${d._id === current ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'} disabled:opacity-50`}>
                <span className="truncate">{d.title}</span>
              </button>
            ))}
            <button type="button" onClick={() => setCreating(true)} disabled={editingLayout}
              className="rounded-full border border-dashed border-violet-300 px-3.5 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 gap-1 disabled:opacity-50">
              <Plus size={15} /> New dashboard
            </button>
          </div>
          {current ? (
            <DashboardView key={current} dashboardId={current} catalog={catalog} library={widgets}
              openBuilder={openBuilder} onChanged={onDashboardChanged} onDeleted={onDashboardDeleted} onEditingChange={setEditingLayout} />
          ) : (
            <EmptyState icon={LayoutDashboard} title="No dashboards yet"
              text="A dashboard puts several widgets on one screen, with shared filters for dates, employees, departments, products and lead stage."
              action={<button type="button" onClick={() => setCreating(true)} className="btn-primary"><Plus size={16} /> New dashboard</button>} />
          )}
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={() => openBuilder(null)} className="btn-primary"><Plus size={16} /> Add Analytics</button>
          </div>
          {widgets.length === 0 ? (
            <EmptyState icon={ChartNoAxesCombined} title="No analytics yet"
              text="Create a chart from your sales data — for example visits per employee, leads by pipeline stage, or registration revenue by month."
              action={<button type="button" onClick={() => openBuilder(null)} className="btn-primary"><Plus size={16} /> Add Analytics</button>} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {widgets.map((w) => (
                <WidgetCard key={w._id} widget={w} onEdit={(x) => openBuilder(x)} onDelete={deleteWidget}
                  className={w.chartType === 'table' ? 'md:col-span-2' : ''} />
              ))}
            </div>
          )}
        </>
      )}

      <DashboardDetailsDialog open={creating} title="New dashboard" onClose={() => setCreating(false)} onSubmit={createDashboard} />
      {builder && (
        <WidgetBuilder catalog={catalog} widget={builder.widget} onClose={() => setBuilder(null)} onSaved={onWidgetSaved} />
      )}
    </div>
  );
}
