import { colorAt, formatValue } from '../format';
import { Empty, Legend } from './shared';

/**
 * Butterfly: two values per category, side by side from a centre line
 * (left = first value, right = second). Both sides share one scale.
 */
export default function ButterflyChart({ data }) {
  if (!data.rows.length) return <Empty />;
  const max = Math.max(...data.rows.flatMap((r) => [Math.abs(r.a || 0), Math.abs(r.b || 0)])) || 1;
  const ca = colorAt(0);
  const cb = colorAt(1);
  const w = (v) => `${(Math.abs(v || 0) / max) * 100}%`;
  return (
    <div className="h-full flex flex-col">
      <Legend items={[{ key: 'a', label: data.labels.a, color: ca }, { key: 'b', label: data.labels.b, color: cb }]} />
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-[1fr_minmax(70px,120px)_1fr] gap-x-2 gap-y-1.5 items-center text-xs">
          {data.rows.map((r) => (
            <div key={String(r.key)} className="contents" title={`${r.label}: ${data.labels.a} ${formatValue(r.a, data.formats.a)} · ${data.labels.b} ${formatValue(r.b, data.formats.b)}`}>
              <div className="flex items-center justify-end gap-1.5 min-w-0">
                <span className="tabular-nums text-gray-700 whitespace-nowrap">{formatValue(r.a, data.formats.a)}</span>
                <div className="flex-1 flex justify-end h-4"><div className="h-full rounded-l" style={{ width: w(r.a), background: ca }} /></div>
              </div>
              <span className="text-center truncate text-gray-800 font-medium">{r.label}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="flex-1 h-4"><div className="h-full rounded-r" style={{ width: w(r.b), background: cb }} /></div>
                <span className="tabular-nums text-gray-700 whitespace-nowrap">{formatValue(r.b, data.formats.b)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
