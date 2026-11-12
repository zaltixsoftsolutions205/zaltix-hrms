import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, EllipsisVertical, GripVertical, Pencil, RefreshCw, Trash2, X,
} from 'lucide-react';
import AnalyticsService, { errorOf } from '../../services/AnalyticsService';
import Spinner from '../UI/Spinner';
import ChartRenderer from './charts/ChartRenderer';
import { formatRange } from './format';

const HEIGHTS = { score: 'h-[220px]', growth: 'h-[240px]', table: 'h-[420px]' };

/**
 * A saved widget with its live chart.
 *   filters   dashboard filters applied to the run
 *   fill      fill the parent's height (dashboard grid) instead of a fixed height
 *   editing   dashboard layout mode: header is the drag handle, chart is inert
 *   onDelete  delete the widget (widget library, asks first)
 *   onRemove  take it off the dashboard (layout mode)
 */
export default function WidgetCard({
  widget, filters, fill = false, editing = false, onEdit, onDelete, onRemove, className = '',
}) {
  const [state, setState] = useState({ loading: true, result: null, error: null });
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const seq = useRef(0);
  const menuRef = useRef(null);
  const filterKey = JSON.stringify(filters || {});

  useEffect(() => { setPage(1); }, [filterKey]);

  const load = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    AnalyticsService.runWidget(widget._id, { filters, page })
      .then((result) => { if (id === seq.current) setState({ loading: false, result, error: null }); })
      .catch((err) => { if (id === seq.current) setState({ loading: false, result: null, error: errorOf(err) }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget._id, widget.updatedAt, filterKey, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const { result, error, loading } = state;
  const sub = result
    ? `${result.source.label}${result.dateField ? ` · ${formatRange(result.range)}` : ''}`
    : '';
  const height = fill ? 'h-full' : HEIGHTS[widget.chartType] || 'h-[340px]';

  return (
    <div className={`glass-card p-4 flex flex-col relative ${height} ${editing ? 'ring-2 ring-violet-200 ring-dashed' : ''} ${className}`}>
      <div className={`flex items-start justify-between gap-2 mb-2 ${editing ? 'widget-drag cursor-move select-none' : ''}`}>
        {editing && <GripVertical size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 truncate" title={widget.title}>{widget.title}</p>
          <p className="text-[11px] text-gray-500 truncate" title={widget.description || sub}>{widget.description || sub}</p>
        </div>
        <div className="widget-no-drag flex items-center gap-1 flex-shrink-0" ref={menuRef}>
          {loading && result && <Spinner size="sm" />}
          {editing ? (
            onRemove && (
              <button type="button" onClick={() => onRemove(widget)} title="Remove from dashboard" aria-label="Remove from dashboard"
                className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><X size={16} /></button>
            )
          ) : (
            <button type="button" onClick={() => setMenu((m) => !m)} className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Widget menu"><EllipsisVertical size={16} /></button>
          )}
          {menu && !editing && (
            <div className="absolute right-3 top-10 z-20 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
              <button type="button" onClick={() => { setMenu(false); onEdit(widget); }} className="!flex w-full !justify-start gap-2 px-3 py-1.5 hover:bg-gray-50 text-gray-700"><Pencil size={14} /> Edit</button>
              <button type="button" onClick={() => { setMenu(false); load(); }} className="!flex w-full !justify-start gap-2 px-3 py-1.5 hover:bg-gray-50 text-gray-700"><RefreshCw size={14} /> Refresh</button>
              {onDelete && (
                <button type="button" onClick={() => { setMenu(false); setConfirming(true); }} className="!flex w-full !justify-start gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600"><Trash2 size={14} /> Delete</button>
              )}
              {onRemove && (
                <button type="button" onClick={() => { setMenu(false); onRemove(widget); }} className="!flex w-full !justify-start gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600"><X size={14} /> Remove from dashboard</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`flex-1 min-h-0 ${loading && result ? 'opacity-60' : ''} ${editing ? 'pointer-events-none' : ''}`}>
        {error ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-4">
            <AlertCircle className={error.invalid ? 'text-amber-500' : 'text-red-500'} size={22} />
            <p className="text-sm text-gray-700">{error.message}</p>
            {error.invalid
              ? <button type="button" onClick={() => onEdit(widget)} className="btn-secondary !py-1 !text-xs">Edit widget</button>
              : <button type="button" onClick={load} className="btn-secondary !py-1 !text-xs">Try again</button>}
          </div>
        ) : result ? (
          <ChartRenderer result={result} onPage={setPage} />
        ) : (
          <div className="h-full flex items-center justify-center"><Spinner /></div>
        )}
      </div>

      {confirming && (
        <div className="absolute inset-0 z-30 rounded-xl bg-white/95 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-sm font-semibold text-gray-900">Delete "{widget.title}"?</p>
          <p className="text-xs text-gray-500">It is also removed from your dashboards.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="btn-secondary !py-1.5">Cancel</button>
            <button type="button" onClick={() => { setConfirming(false); onDelete(widget); }} className="btn-danger !py-1.5">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
