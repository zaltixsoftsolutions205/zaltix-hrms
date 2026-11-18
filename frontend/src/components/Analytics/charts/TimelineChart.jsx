import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { colorAt, formatTick } from '../format';
import {
  AXIS_TICK, ChartTooltip, Empty, GRID_STROKE, Legend,
} from './shared';

/** Line / area over time. With a split (data.series): one line per value; areas are stacked. */
export default function TimelineChart({ data, kind = 'line' }) {
  if (!data.rows.length) return <Empty text="No data in this date range." />;
  const multi = Array.isArray(data.series);
  const rows = multi
    ? data.rows.map((r) => ({ label: r.label, ...Object.fromEntries(data.series.map((s) => [`s_${s.key}`, r.values[s.key] ?? null])) }))
    : data.rows;
  const lines = multi
    ? data.series.map((s, i) => ({ dataKey: `s_${s.key}`, name: s.label, color: colorAt(i, s.key), key: s.key }))
    : [{ dataKey: 'value', name: data.label, color: colorAt(0), key: 'value' }];
  const dots = rows.length <= 24;

  const common = (
    <>
      <CartesianGrid stroke={GRID_STROKE} vertical={false} />
      <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: '#d1d5db' }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
      <YAxis width={48} tick={AXIS_TICK} tickFormatter={(v) => formatTick(v, data.format)} axisLine={false} tickLine={false} />
      <Tooltip cursor={{ stroke: '#9ca3af', strokeDasharray: '3 3' }} content={<ChartTooltip format={data.format} />} />
    </>
  );

  return (
    <div className="h-full flex flex-col">
      <Legend items={multi ? lines.map((l) => ({ key: l.key, label: l.name, color: l.color })) : null} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'area' ? (
            <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              {common}
              {lines.map((l) => (
                <Area key={l.dataKey} type="monotone" dataKey={l.dataKey} name={l.name} stroke={l.color} strokeWidth={2} fill={l.color} fillOpacity={multi ? 0.55 : 0.18} stackId={multi ? 'a' : undefined} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} connectNulls />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              {common}
              {lines.map((l) => (
                <Line key={l.dataKey} type="monotone" dataKey={l.dataKey} name={l.name} stroke={l.color} strokeWidth={2} dot={dots ? { r: 3, fill: l.color, stroke: '#fff', strokeWidth: 1.5 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} connectNulls />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
