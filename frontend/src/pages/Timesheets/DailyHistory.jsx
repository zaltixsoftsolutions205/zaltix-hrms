import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import TaskEntryModal from './TaskEntryModal';
import { fmtRange, fmtDayLabel, verdictTone } from './timesheetUtils';

const RANGES = [{ days: 7, label: '7 days' }, { days: 14, label: '14 days' }, { days: 30, label: '30 days' }];

const UpdateBlock = ({ label, text }) =>
  text ? (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">{label}</p>
      <p className="whitespace-pre-line text-xs text-gray-700">{text}</p>
    </div>
  ) : null;

// Past days of work slots + the Daily Update posted that day, each with its time
// intelligence. Own history is editable (change a slot's time/task, or delete it);
// when `employeeId` is passed (admin/HR/dept head) it is read-only.
const DailyHistory = ({ employeeId, onBack }) => {
  const [range, setRange] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const readOnly = !!employeeId;

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get('/timesheets/daily-history', { params: { days: range, employeeId: employeeId || undefined } });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [range, employeeId]);

  useEffect(() => { setLoading(true); fetchHistory(); }, [fetchHistory]);

  const deleteEntry = async (day, entry) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.delete(`/timesheets/${day._id}/entry/${entry._id}`);
      toast.success('Task deleted');
      fetchHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  if (loading) return <Card><p className="text-sm text-violet-400">Loading...</p></Card>;

  const days = data?.days || [];
  const overall = data?.overall;

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {onBack && <button onClick={onBack} className="text-xs font-semibold text-violet-600 hover:text-violet-800">← Back</button>}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-violet-900">
              {readOnly && data?.employee ? `${data.employee.name}'s daily history` : 'Daily History'}
            </h3>
            <p className="text-xs text-violet-500">What was posted each day, with how the time compared to the estimate.</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-violet-50 p-0.5">
            {RANGES.map(r => (
              <button key={r.days} onClick={() => setRange(r.days)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  range === r.days ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {overall?.analysedTasks > 0 && (
          <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
            <span className="font-semibold">Last {range} days:</span> {overall.message}
          </p>
        )}
      </Card>

      {days.length === 0 && (
        <Card><p className="text-sm text-violet-400">Nothing logged in the last {range} days.</p></Card>
      )}

      {days.map(day => {
        const u = day.dailyUpdate;
        const s = day.summary;
        const tone = s.analysedTasks === 0 ? null
          : s.ratioPct > 120 ? verdictTone.over : verdictTone['on-target'];
        return (
          <Card key={day._id}>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-violet-900">{fmtDayLabel(day.date)}</h4>
              <span className="text-xs text-gray-400">{day.date}</span>
              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">{s.totalHours}h logged</span>
              {u?.dayStatus && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{u.dayStatus}</span>}
            </div>

            {tone && <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ring-1 ${tone}`}>{s.message}</p>}

            {day.entries.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {day.entries.map(en => (
                  <li key={en._id} className="group rounded-lg bg-violet-50/40 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {fmtRange(en.startTime, en.endTime) && (
                        <span className="text-[11px] font-semibold text-violet-600">{fmtRange(en.startTime, en.endTime)}</span>
                      )}
                      <span className="text-sm font-semibold text-violet-900">{en.task}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-violet-600 ring-1 ring-violet-100">{en.hours}h</span>
                      {en.estimatedHours != null && <span className="text-[10px] text-gray-400">est. {en.estimatedHours}h</span>}
                      <span className="text-[10px] text-gray-500">{en.status}</span>
                      {!readOnly && (
                        <span className="ml-auto flex gap-2 text-[11px] opacity-0 transition group-hover:opacity-100">
                          <button className="text-violet-600 hover:underline" onClick={() => setEditing({ ...en, timesheetId: day._id })}>Edit</button>
                          <button className="text-rose-500 hover:underline" onClick={() => deleteEntry(day, en)}>Delete</button>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-violet-500">
                      {[en.workCategory, en.project?.name || en.projectLabel].filter(Boolean).join(' · ')}
                    </p>
                    {en.description && <p className="mt-0.5 whitespace-pre-line text-xs text-gray-600">{en.description}</p>}
                    {en.status === 'Blocked' && en.blocker && <p className="mt-0.5 text-xs text-rose-600">Blocked: {en.blocker}</p>}
                    {en.remarks && <p className="mt-0.5 text-xs text-gray-400">Remarks: {en.remarks}</p>}
                    {en.insight?.message && (
                      <p className={`mt-1 text-[11px] leading-snug ${en.insight.verdict === 'over' ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {en.insight.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {day.focusReason && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 ring-1 ring-amber-200">
                <span className="font-semibold">Why only one topic:</span> {day.focusReason}
              </p>
            )}

            {u && (
              <div className="mt-3 space-y-2 border-t border-violet-100 pt-3">
                <p className="text-xs font-bold text-violet-900">Daily Update</p>
                <UpdateBlock label="Completed" text={u.completedToday} />
                <UpdateBlock label="Continuing next" text={u.continuingTomorrow} />
                <UpdateBlock label="Blockers" text={u.blockers} />
              </div>
            )}
          </Card>
        );
      })}

      {!readOnly && (
        <TaskEntryModal isOpen={!!editing} onClose={() => setEditing(null)} editing={editing} onSaved={fetchHistory} />
      )}
    </div>
  );
};

export default DailyHistory;
