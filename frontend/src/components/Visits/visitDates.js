/**
 * Date helpers for the Visits page. Everything works on local calendar days.
 *
 * A follow-up date picked as a plain date is stored as UTC midnight. Such a
 * value is read as that calendar day with no time ("all day"), so it does not
 * slide to the previous day west of UTC or show up as 05:30 in India.
 */

const pad = (n) => String(n).padStart(2, '0');

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const startOfWeek = (d) => addDays(startOfDay(d), -d.getDay());
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 'YYYY-MM-DD' of a local day. */
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The 6-week grid shown for the month of `d`. */
export const monthGrid = (d) => {
  const first = startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
};

/** { from, to } (local days, `to` exclusive) shown by a view around `cursor`. */
export const visibleRange = (view, cursor) => {
  if (view === 'day') return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) };
  if (view === 'week') { const from = startOfWeek(cursor); return { from, to: addDays(from, 7) }; }
  const grid = monthGrid(cursor);
  return { from: grid[0], to: addDays(grid[41], 1) };
};

export const shiftCursor = (view, cursor, dir) => {
  if (view === 'day') return addDays(cursor, dir);
  if (view === 'week') return addDays(cursor, 7 * dir);
  return addMonths(cursor, dir);
};

const isUtcMidnight = (date) => date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;

/**
 * Where a follow-up date sits on the calendar:
 * { key: 'YYYY-MM-DD', day: Date, allDay: boolean, hour: number | null, date: Date }
 */
export const placeFollowUp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (isUtcMidnight(date)) {
    const day = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return { key: dayKey(day), day, allDay: true, hour: null, date };
  }
  return { key: dayKey(date), day: startOfDay(date), allDay: false, hour: date.getHours(), date };
};

export const formatDay = (value, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  const placed = placeFollowUp(value);
  return placed ? placed.day.toLocaleDateString(undefined, opts) : '—';
};

export const formatTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export const hourLabel = (h) => {
  const suffix = h < 12 ? 'AM' : 'PM';
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n} ${suffix}`;
};

/** Title of the toolbar for a view. */
export const rangeTitle = (view, cursor) => {
  if (view === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  if (view === 'day') return cursor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const from = startOfWeek(cursor);
  const to = addDays(from, 6);
  const f = from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const t = to.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${f} – ${t}`;
};

/** 'HH:MM' of a stored time, for <input type="time">. */
export const toTimeInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 'YYYY-MM-DD' + 'HH:MM' (local) -> ISO string, or null when no time is given. */
export const combineDateTime = (day, time) => {
  if (!day || !time) return null;
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
};

/** A visit's stored visitDate (UTC midnight) -> 'YYYY-MM-DD'. */
export const visitDayInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
