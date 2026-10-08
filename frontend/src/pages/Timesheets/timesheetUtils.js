// Today's date as the user's local calendar day ("YYYY-MM-DD"). Not toISOString():
// that is the UTC date, which is still "yesterday" in India until 5:30 AM.
export const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// "14:30" -> "2:30 PM"
export const fmtTime = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const fmtRange = (start, end) => (start && end ? `${fmtTime(start)} – ${fmtTime(end)}` : '');

// "2026-10-06" -> "Yesterday" / "Mon, 6 Oct"
export const fmtDayLabel = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  const diff = Math.round((new Date(new Date().toDateString()) - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Tailwind classes per time-verdict, shared by the history and intelligence views.
export const verdictTone = {
  over: 'bg-rose-50 text-rose-700 ring-rose-200',
  under: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  fast: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'on-target': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'in-progress': 'bg-violet-50 text-violet-700 ring-violet-200',
  'no-data': 'bg-slate-50 text-slate-500 ring-slate-200',
};

export const verdictLabel = {
  over: 'Over estimate',
  under: 'Faster than estimate',
  fast: 'Faster than estimate',
  'on-target': 'On target',
  'in-progress': 'In progress',
  'no-data': 'No data yet',
};
