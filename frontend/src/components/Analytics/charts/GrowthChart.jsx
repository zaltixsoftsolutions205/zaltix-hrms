import { formatValue, formatRange } from '../format';
import { Change } from './ScoreChart';

/** Growth index: this period vs the previous one, with the change %. */
export default function GrowthChart({ data }) {
  const max = Math.max(Math.abs(data.current || 0), Math.abs(data.previous || 0)) || 1;
  const bar = (v, color) => (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${(Math.abs(v || 0) / max) * 100}%`, background: color }} />
    </div>
  );
  return (
    <div className="h-full flex flex-col justify-center gap-3 px-1">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{data.label}</p>
          <p className="text-3xl font-extrabold text-gray-900 tabular-nums leading-tight">{formatValue(data.current, data.format)}</p>
        </div>
        <Change pct={data.changePct} size="lg" />
      </div>
      <div className="space-y-2 text-xs">
        <div>
          <div className="flex justify-between text-gray-600 mb-1"><span>This period · {formatRange(data.currentRange)}</span><span className="font-semibold tabular-nums">{formatValue(data.current, data.format)}</span></div>
          {bar(data.current, '#2a78d6')}
        </div>
        <div>
          <div className="flex justify-between text-gray-500 mb-1"><span>Previous · {formatRange(data.previousRange)}</span><span className="font-semibold tabular-nums">{formatValue(data.previous, data.format)}</span></div>
          {bar(data.previous, '#a8a29e')}
        </div>
      </div>
    </div>
  );
}
