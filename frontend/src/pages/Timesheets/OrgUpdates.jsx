import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import { fmtRange, fmtDayLabel, verdictTone } from './timesheetUtils';

const localYmd = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localYmd(d);
};

const UpdateBlock = ({ label, text }) =>
  text ? (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">{label}</p>
      <p className="whitespace-pre-line text-xs text-gray-700">{text}</p>
    </div>
  ) : null;

const summaryTone = (s) =>
  s.analysedTasks === 0 ? 'bg-slate-50 text-slate-500 ring-slate-200'
    : s.ratioPct > 120 ? verdictTone.over : verdictTone['on-target'];

// One employee-day: hours, work slots, the Daily Update they posted, and intelligence.
const DayBlock = ({ day, showDate }) => {
  const u = day.dailyUpdate;
  return (
    <div className="rounded-lg border border-violet-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {showDate && <span className="text-xs font-bold text-violet-900">{fmtDayLabel(day.date)} <span className="font-normal text-gray-400">{day.date}</span></span>}
        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">{day.summary.totalHours}h worked</span>
        {u?.dayStatus && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{u.dayStatus}</span>}
        {!u && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">No daily update</span>}
      </div>

      {day.entries.length > 0 && (
        <ul className="mt-2 space-y-1">
          {day.entries.map(en => (
            <li key={en._id} className="text-xs">
              <div className="flex flex-wrap items-baseline gap-x-2">
                {fmtRange(en.startTime, en.endTime) && <span className="font-semibold text-violet-600">{fmtRange(en.startTime, en.endTime)}</span>}
                <span className="font-medium text-gray-800">{en.task}</span>
                <span className="text-gray-400">{en.hours}h{en.estimatedHours != null ? ` / est. ${en.estimatedHours}h` : ''} · {en.status}</span>
                {en.insight?.verdict === 'over' && <span className="text-[10px] font-semibold text-rose-600">over estimate</span>}
              </div>
              {en.description && <p className="mt-0.5 whitespace-pre-line text-gray-600">{en.description}</p>}
              {en.status === 'Blocked' && en.blocker && <p className="mt-0.5 text-rose-600">Blocked: {en.blocker}</p>}
              {en.remarks && <p className="mt-0.5 text-gray-400">Remarks: {en.remarks}</p>}
            </li>
          ))}
        </ul>
      )}

      {day.focusReason && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800 ring-1 ring-amber-200">
          <span className="font-semibold">Why only one topic:</span> {day.focusReason}
        </p>
      )}

      {u && (
        <div className="mt-2 space-y-1.5 border-t border-violet-50 pt-2">
          <UpdateBlock label="Completed" text={u.completedToday} />
          <UpdateBlock label="Continuing next" text={u.continuingTomorrow} />
          <UpdateBlock label="Blockers" text={u.blockers} />
        </div>
      )}

      {day.summary.analysedTasks > 0 && (
        <p className={`mt-2 rounded-md px-2 py-1 text-[11px] leading-snug ring-1 ${summaryTone(day.summary)}`}>{day.summary.message}</p>
      )}
    </div>
  );
};

const EmployeeCard = ({ row, view, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const s = row.summary;
  const idle = row.days.length === 0;

  return (
    <div className="rounded-xl border border-violet-100 bg-white">
      <button onClick={() => !idle && setOpen(o => !o)} disabled={idle}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left">
        <span className="text-sm font-bold text-violet-900">{row.employee.name}</span>
        <span className="text-xs text-gray-400">{row.employee.department || '—'}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {idle ? (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Nothing posted</span>
          ) : (
            <>
              <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">{s.totalHours}h worked</span>
              <span className="text-[11px] text-gray-500">{row.completedCount}/{row.taskCount} tasks done</span>
              {view === 'week' && <span className="text-[11px] text-gray-500">{row.daysPosted} update{row.daysPosted === 1 ? '' : 's'}</span>}
              {row.singleTopic && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200"
                  title={`Only "${row.singleTopic.topic}" for ${row.singleTopic.streak} working days`}>
                  1 topic · {row.singleTopic.streak} days
                </span>
              )}
              {s.ratioPct != null && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${summaryTone(s)}`}>{s.ratioPct}% of est. time</span>
              )}
              <span className="text-xs text-violet-400">{open ? '▲' : '▼'}</span>
            </>
          )}
        </span>
      </button>

      {open && !idle && (
        <div className="space-y-2 border-t border-violet-50 px-4 py-3">
          {view === 'week' && s.analysedTasks > 0 && (
            <p className={`rounded-md px-2.5 py-1.5 text-xs leading-snug ring-1 ${summaryTone(s)}`}>
              <span className="font-semibold">Week summary:</span> {s.message}
            </p>
          )}
          {row.days.map(d => <DayBlock key={d.date} day={d} showDate={view === 'week'} />)}
        </div>
      )}
    </div>
  );
};

// HR/Admin: day-wise and week-wise view of what each employee posted — Daily
// Update, hours worked and time intelligence.
const OrgUpdates = ({ departmentId, role }) => {
  const [view, setView] = useState('day');
  const [date, setDate] = useState(localYmd(new Date()));
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get('/timesheets/org-updates', { params: { view, date, departmentId: departmentId || undefined, role: role || undefined } })
      .then(res => setData(res.data))
      .catch(() => setData({ error: true }));
  }, [view, date, departmentId, role]);

  const step = view === 'week' ? 7 : 1;
  const today = localYmd(new Date());

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-bold text-violet-900">Daily Updates & Intelligence</h3>
        <div className="flex gap-1 rounded-lg bg-violet-50 p-0.5">
          {['day', 'week'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                view === v ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}>
              {v === 'day' ? 'Day-wise' : 'Week-wise'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="rounded-md border border-violet-100 px-2 py-1 text-xs text-violet-600 hover:bg-violet-50" onClick={() => setDate(addDays(date, -step))}>←</button>
          <input type="date" className="input-field w-auto py-1 text-xs" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} />
          <button className="rounded-md border border-violet-100 px-2 py-1 text-xs text-violet-600 hover:bg-violet-50 disabled:opacity-40"
            disabled={date >= today} onClick={() => setDate(addDays(date, step) > today ? today : addDays(date, step))}>→</button>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-violet-400">Loading...</p>
      ) : data.error ? (
        <p className="text-sm text-violet-400">Could not load updates.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-violet-500">
            {view === 'week' ? `Week ${data.start} to ${data.end}` : fmtDayLabel(data.start)} ·{' '}
            {data.totals.posted} of {data.totals.employees} posted a daily update · {data.totals.totalHours}h logged
          </p>
          <div className="space-y-2">
            {data.employees.map(r => (
              <EmployeeCard key={`${r.employee._id}-${view}-${date}`} row={r} view={view} defaultOpen={view === 'day' && r.days.length > 0} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

export default OrgUpdates;
