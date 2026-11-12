import { AlertTriangle } from 'lucide-react';
import ScoreChart from './ScoreChart';
import GrowthChart from './GrowthChart';
import RankingChart from './RankingChart';
import BarChartView from './BarChartView';
import DonutChart from './DonutChart';
import TimelineChart from './TimelineChart';
import ButterflyChart from './ButterflyChart';
import TableChart from './TableChart';
import FunnelChart from './FunnelChart';

const FILTER_NAMES = { product: 'Product', status: 'Stage', employee: 'Employee', department: 'Department' };

/**
 * Draws the result of /analytics/preview or /widgets/:id/run.
 * `result` = { chartType, data, ignoredFilters, ... }. Fills its parent's height.
 */
export default function ChartRenderer({ result, onPage }) {
  if (!result) return null;
  const { chartType: type, data } = result;
  let chart;
  switch (type) {
    case 'score': chart = <ScoreChart data={data} />; break;
    case 'growth': chart = <GrowthChart data={data} />; break;
    case 'ranking': chart = <RankingChart data={data} />; break;
    case 'bar': chart = <BarChartView data={data} />; break;
    case 'donut': chart = <DonutChart data={data} />; break;
    case 'line': chart = <TimelineChart data={data} kind="line" />; break;
    case 'area': chart = <TimelineChart data={data} kind="area" />; break;
    case 'butterfly': chart = <ButterflyChart data={data} />; break;
    case 'table': chart = <TableChart data={data} onPage={onPage} />; break;
    case 'funnel': chart = <FunnelChart data={data} />; break;
    default: chart = null;
  }
  const ignored = result.ignoredFilters || [];
  return (
    <div className="h-full flex flex-col">
      {ignored.length > 0 && (
        <p className="mb-1 flex items-center gap-1 text-[11px] text-amber-700">
          <AlertTriangle size={12} /> {ignored.map((k) => FILTER_NAMES[k] || k).join(', ')} filter does not apply to this data
        </p>
      )}
      <div className="flex-1 min-h-0">{chart}</div>
    </div>
  );
}
