import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCell, formatValue, formatPct } from '../format';
import { Empty } from './shared';

/** Table: a record list (with paging) or grouped totals. */
export default function TableChart({ data, onPage }) {
  if (!data.rows.length) return <Empty />;
  const grouped = data.mode === 'grouped';
  const showPct = grouped && data.total !== null && data.total !== undefined;
  const pages = grouped ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));
  const isNum = (c) => c.type === 'number';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {data.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-semibold text-gray-600 whitespace-nowrap ${isNum(c) ? 'text-right' : 'text-left'}`}>{c.label}</th>
              ))}
              {showPct && <th className="px-3 py-2 font-semibold text-gray-600 text-right">% of total</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.map((r) => (
              <tr key={r.id || String(r.key)} className="hover:bg-gray-50">
                {r.cells.map((v, i) => {
                  const c = data.columns[i];
                  const text = grouped ? (isNum(c) ? formatValue(v, c.format) : v) : formatCell(v, c);
                  return <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap text-gray-800 ${isNum(c) ? 'text-right tabular-nums' : ''}`}>{text}</td>;
                })}
                {showPct && <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{formatPct(r.pct)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!grouped && (
        <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
          <span>{(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
          {pages > 1 && onPage && (
            <div className="flex items-center gap-1">
              <button type="button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span className="tabular-nums">{data.page} / {pages}</span>
              <button type="button" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40" aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
