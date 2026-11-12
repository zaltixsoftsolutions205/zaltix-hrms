import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { colorAt, formatTick } from '../format';
import {
  AXIS_TICK, ChartTooltip, Empty, GRID_STROKE, Legend, shorten,
} from './shared';

const isDayKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

/**
 * Bar chart. Without a split: one bar per category. With a split (data.series):
 * stacked bars, one colour per split value. Long or many labels -> horizontal bars.
 */
export default function BarChartView({ data }) {
  if (!data.rows.length) return <Empty />;
  const stacked = Array.isArray(data.series);
  const byTime = isDayKey(data.rows[0]?.key);
  const longest = Math.max(...data.rows.map((r) => String(r.label).length));
  const horizontal = !byTime && (data.rows.length > 6 || longest > 12);

  const rows = stacked
    ? data.rows.map((r) => ({ label: r.label, ...Object.fromEntries(data.series.map((s) => [`s_${s.key}`, r.values[s.key] ?? 0])) }))
    : data.rows;
  const bars = stacked
    ? data.series.map((s, i) => ({ dataKey: `s_${s.key}`, name: s.label, color: colorAt(i, s.key) }))
    : [{ dataKey: 'value', name: data.label, color: colorAt(0) }];

  const valueAxis = { tick: AXIS_TICK, tickFormatter: (v) => formatTick(v, data.format), axisLine: false, tickLine: false };
  const catAxis = { dataKey: 'label', tick: AXIS_TICK, tickFormatter: (v) => shorten(v, horizontal ? 18 : 12), axisLine: { stroke: '#d1d5db' }, tickLine: false, interval: horizontal ? 0 : 'preserveStartEnd' };
  const last = bars.length - 1;
  const radius = (i) => (stacked && i !== last ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]);

  return (
    <div className="h-full flex flex-col">
      <Legend items={stacked ? bars.map((b, i) => ({ key: data.series[i].key, label: b.name, color: b.color })) : null} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="22%">
            <CartesianGrid stroke={GRID_STROKE} vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" {...valueAxis} />
                <YAxis type="category" width={120} {...catAxis} />
              </>
            ) : (
              <>
                <XAxis type="category" {...catAxis} />
                <YAxis type="number" width={48} {...valueAxis} />
              </>
            )}
            <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={<ChartTooltip format={data.format} pctOf={!stacked && data.total !== null} />} />
            {bars.map((b, i) => (
              <Bar key={b.dataKey} dataKey={b.dataKey} name={b.name} fill={b.color} stackId={stacked ? 'a' : undefined} radius={radius(i)} maxBarSize={40} stroke={stacked ? '#fff' : undefined} strokeWidth={stacked ? 1 : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
