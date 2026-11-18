import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatValue, formatPct, formatRange } from '../format';

/** A change % with an arrow. Up is green, down is red, no change / unknown is grey. */
export function Change({ pct, size = 'sm' }) {
  if (pct === null || pct === undefined) {
    return <span className="inline-flex items-center gap-1 text-gray-500 text-xs"><Minus size={14} /> no earlier data</span>;
  }
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? 'text-gray-500 bg-gray-100' : up ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${tone} ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>
      <Icon size={size === 'lg' ? 16 : 14} />
      {flat ? '0%' : `${up ? '+' : ''}${formatPct(pct)}`}
    </span>
  );
}

/** Score card: one big number, optional change vs the previous month and progress to a target. */
export default function ScoreChart({ data }) {
  const hasCompare = data.changePct !== undefined || data.previousRange;
  const progress = data.progressPct;
  return (
    <div className="h-full flex flex-col justify-center gap-2 px-1">
      <p className="text-xs text-gray-500 truncate">{data.label}</p>
      <p className="text-3xl sm:text-4xl font-extrabold text-gray-900 tabular-nums leading-none">{formatValue(data.value, data.format)}</p>
      {hasCompare && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <Change pct={data.changePct} />
          <span>vs {formatValue(data.previous, data.format)} ({formatRange(data.previousRange)})</span>
        </div>
      )}
      {data.target ? (
        <div className="mt-1">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Target {formatValue(data.target, data.format)}</span>
            <span className="font-semibold text-gray-700">{formatPct(progress)}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={progress || 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
