import { formatValue, formatPct } from '../format';
import { Empty } from './shared';

// Ordinal blue steps (light enough to read, never lighter than step 250).
const STEPS = ['#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef'];

/** Funnel: one centred bar per step, width = share of the first step, with the step-to-step %. */
export default function FunnelChart({ data }) {
  if (!data.steps.length || !data.steps[0].value) return <Empty text="No records for this funnel." />;
  return (
    <div className="h-full overflow-y-auto pr-1 space-y-1.5">
      {data.steps.map((s, i) => (
        <div key={s.key} title={`${s.label}: ${formatValue(s.value)} (${formatPct(s.pctOfFirst)} of the first step)`}>
          {i > 0 && (
            <p className="text-[10px] text-gray-500 text-center leading-tight">↓ {formatPct(s.pctOfPrevious)} continued</p>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-28 flex-shrink-0 truncate text-gray-700 font-medium">{s.label}</span>
            <div className="flex-1 flex justify-center h-6">
              <div
                className="h-full rounded flex items-center justify-center text-white font-semibold tabular-nums text-[11px] min-w-[28px]"
                style={{ width: `${Math.max(s.pctOfFirst || 0, 2)}%`, background: STEPS[Math.min(i, STEPS.length - 1)] }}
              >
                {formatValue(s.value)}
              </div>
            </div>
            <span className="w-12 text-right tabular-nums text-gray-500">{formatPct(s.pctOfFirst)}</span>
          </div>
        </div>
      ))}
      {data.kind === 'stage' && data.lost ? (
        <p className="pt-1 text-[11px] text-gray-500">Lead Lost: {formatValue(data.lost)} (counted only in "All leads")</p>
      ) : null}
    </div>
  );
}
