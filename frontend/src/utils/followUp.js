import { placeFollowUp } from '../components/Visits/visitDates';

/**
 * A lead's follow-up: a day, with an optional time.
 *   stored  day only    -> UTC midnight (shown as "All day" on the calendars)
 *           day + time  -> that exact moment (placed at its hour on the calendars)
 *   input   'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' (local time)
 */

const pad = (n) => String(n).padStart(2, '0');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Stored value -> input value. */
export const followUpInput = (raw) => {
  const place = placeFollowUp(raw);
  if (!place) return '';
  if (place.allDay) return localDay(place.day);
  const d = place.date;
  return `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const splitFollowUp = (value) => {
  const v = typeof value === 'string' ? value : '';
  return { day: v.slice(0, 10), time: v.length > 10 ? v.slice(11, 16) : '' };
};

export const joinFollowUp = (day, time) => (!day ? '' : time ? `${day}T${time}` : day);

/** Input value -> what PUT /leads/:id and the record API accept ('' clears). Throws on bad input. */
export const followUpToApi = (value) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return '';
  if (DAY_RE.test(v)) return v; // the backend stores it as UTC midnight (all day)
  if (!DAY_TIME_RE.test(v)) throw new Error('Enter a valid follow-up date');
  const d = new Date(v); // local time
  if (Number.isNaN(d.getTime())) throw new Error('Enter a valid follow-up date');
  return d.toISOString();
};

/** "28 Oct 2026, 3:30 pm" or "28 Oct 2026" (all day). */
export const formatFollowUp = (raw, { withYear = true } = {}) => {
  const place = placeFollowUp(raw);
  if (!place) return '—';
  const day = place.day.toLocaleDateString(undefined, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  return place.allDay ? day : `${day}, ${place.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

/** Overdue: past its time, or (all day) before today. */
export const isFollowUpOverdue = (raw) => {
  const place = placeFollowUp(raw);
  if (!place) return false;
  if (place.allDay) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return place.day < today;
  }
  return place.date < new Date();
};
