/** Number / date formatting and colours shared by every analytics chart. */

/* Categorical colours, always used in this order (colour follows the series, never its rank). */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER_COLOR = '#a8a29e';
export const colorAt = (i, key) => (key === '__other' ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]);

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

/** A value in its field's format: number | currency | minutes | hours | days | rating | percent. */
export function formatValue(v, format = 'number') {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  switch (format) {
    case 'currency': return inr.format(v);
    case 'percent': return `${num.format(v)}%`;
    case 'rating': return `${num.format(v)} / 5`;
    case 'hours': return `${num.format(v)} h`;
    case 'days': return `${num.format(v)} ${Math.abs(v) === 1 ? 'day' : 'days'}`;
    case 'minutes': {
      if (Math.abs(v) < 60) return `${num.format(Math.round(v))} min`;
      const h = Math.floor(v / 60);
      const m = Math.round(v % 60);
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    default: return num.format(v);
  }
}

/** Short axis ticks (1.2K, ₹3.4L). */
export function formatTick(v, format = 'number') {
  if (v === null || v === undefined) return '';
  if (format === 'percent') return `${compact.format(v)}%`;
  if (format === 'currency') return `₹${compact.format(v)}`;
  if (format === 'minutes') return `${compact.format(v)}m`;
  if (format === 'hours') return `${compact.format(v)}h`;
  if (format === 'days') return `${compact.format(v)}d`;
  return compact.format(v);
}

export const formatPct = (v) => (v === null || v === undefined ? '—' : `${num.format(v)}%`);

/** 'YYYY-MM-DD' -> '5 Oct 2026' */
export function formatDay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const formatRange = (range) => (range ? `${formatDay(range.from)} – ${formatDay(range.to)}` : 'All time');

/** A table cell from a record table (dates come as ISO instants). */
export function formatCell(value, col) {
  if (value === null || value === undefined || value === '') return '—';
  if (col.type === 'date') {
    const d = new Date(value);
    if (col.utcDay) return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (col.type === 'number') return formatValue(value, col.format || 'number');
  return String(value);
}
