import { formatValue, formatPct } from '../format';

export const AXIS_TICK = { fontSize: 11, fill: '#6b7280' };
export const GRID_STROKE = '#eef0f3';

/** Recharts tooltip body: a title and one row per series (colour chip + name + value). */
export function ChartTooltip({ active, payload, label, format, pctOf }) {
  if (!active || !payload?.length) return null;
  const title = payload[0]?.payload?.label ?? label;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs min-w-[140px]">
      <p className="font-semibold text-gray-900 mb-1">{title}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-gray-600 flex-1 truncate">{p.name}</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {formatValue(p.value, p.payload?.__format || format)}
            {pctOf && p.payload?.pct !== undefined ? <span className="text-gray-500 font-normal"> · {formatPct(p.payload.pct)}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** HTML legend, shown when a chart has two or more series. */
export function Legend({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-1 text-[11px] text-gray-600">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: it.color }} />
          <span className="truncate max-w-[140px]">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

export function Empty({ text = 'No data for these settings.' }) {
  return <div className="h-full min-h-[120px] flex items-center justify-center text-sm text-gray-400 text-center px-4">{text}</div>;
}

/** Shorten long category labels on axes. */
export const shorten = (s, n = 16) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n - 1)}…` : s);
