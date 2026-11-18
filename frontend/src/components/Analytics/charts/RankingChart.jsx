import { formatValue, formatPct } from '../format';
import { Empty } from './shared';

/** Ranking list: position, name, value and a bar relative to the first row. */
export default function RankingChart({ data }) {
  if (!data.rows.length) return <Empty />;
  const max = Math.max(...data.rows.map((r) => Math.abs(r.value || 0))) || 1;
  return (
    <ol className="h-full overflow-y-auto pr-1 space-y-2">
      {data.rows.map((r, i) => (
        <li key={String(r.key)} className="flex items-center gap-2.5" title={`${r.label}: ${formatValue(r.value, data.format)}`}>
          <span className={`w-6 h-6 flex-shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${i < 3 ? 'bg-[#2a78d6] text-white' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-gray-800 font-medium">{r.label}</span>
              <span className="tabular-nums font-semibold text-gray-900 whitespace-nowrap">
                {formatValue(r.value, data.format)}
                {r.pct !== undefined && <span className="text-gray-500 font-normal"> · {formatPct(r.pct)}</span>}
              </span>
            </div>
            <div className="h-1.5 mt-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(Math.abs(r.value || 0) / max) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
