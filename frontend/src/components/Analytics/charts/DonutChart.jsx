import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from 'recharts';
import { colorAt, formatValue, formatPct } from '../format';
import { ChartTooltip, Empty } from './shared';

/** Donut: share of each category, total in the middle, legend with values and %. */
export default function DonutChart({ data }) {
  const rows = data.rows.filter((r) => (r.value || 0) > 0);
  if (!rows.length) return <Empty />;
  const sum = rows.reduce((s, r) => s + (r.value || 0), 0);
  const items = rows.map((r, i) => ({
    ...r, name: r.label, fill: colorAt(i, r.key), share: r.pct !== undefined ? r.pct : sum ? (r.value / sum) * 100 : 0,
  }));
  return (
    <div className="h-full flex flex-col sm:flex-row items-center gap-3">
      <div className="relative w-full sm:w-1/2 h-1/2 sm:h-full min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {items.map((it) => <Cell key={String(it.key)} fill={it.fill} />)}
            </Pie>
            <Tooltip content={<ChartTooltip format={data.format} pctOf={data.total !== null} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-extrabold text-gray-900 tabular-nums">{formatValue(data.total ?? sum, data.format)}</span>
          <span className="text-[10px] text-gray-500">Total</span>
        </div>
      </div>
      <ul className="w-full sm:w-1/2 max-h-full overflow-y-auto space-y-1.5 text-xs">
        {items.map((it) => (
          <li key={String(it.key)} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: it.fill }} />
            <span className="flex-1 truncate text-gray-700" title={it.label}>{it.label}</span>
            <span className="tabular-nums font-semibold text-gray-900">{formatValue(it.value, data.format)}</span>
            <span className="tabular-nums text-gray-500 w-12 text-right">{formatPct(Math.round(it.share * 10) / 10)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
