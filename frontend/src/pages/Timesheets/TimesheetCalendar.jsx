import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';

const COLOR = {
  complete: 'bg-violet-600 text-white',
  partial: 'bg-golden-400 text-white',
  'not-updated': 'bg-gray-300 text-gray-700',
  holiday: 'bg-gray-100 text-gray-400',
  future: 'bg-white text-gray-300 border border-violet-50',
};

const LABEL = {
  complete: 'Complete', partial: 'Partially Updated', 'not-updated': 'Not Updated', holiday: 'Holiday / Week Off', future: '',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Month calendar view, color-coded per day. Clicking a date opens that day's
// tasks/hours/daily update/blockers in a read-view modal.
const TimesheetCalendar = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [days, setDays] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);

  const fetchMonth = async () => {
    try {
      const res = await api.get('/timesheets/calendar', { params: { month, year } });
      setDays(res.data.days);
    } catch {}
  };
  useEffect(() => { fetchMonth(); }, [month, year]);

  const openDay = async (dateKey) => {
    setSelectedDate(dateKey);
    try {
      const res = await api.get(`/timesheets/day/${dateKey}`);
      setDayDetail(res.data);
    } catch {
      setDayDetail(null);
    }
  };

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  const firstDay = new Date(year, month - 1, 1);
  const startWeekday = firstDay.getDay();
  const dateKeys = Object.keys(days).sort();

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => changeMonth(-1)} className="btn-secondary btn-sm">←</button>
          <h3 className="font-bold text-violet-900 text-sm sm:text-base">{MONTH_NAMES[month - 1]} {year}</h3>
          <button onClick={() => changeMonth(1)} className="btn-secondary btn-sm">→</button>
        </div>

        <div className="flex gap-3 flex-wrap text-[11px] mb-3 text-violet-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-600 inline-block" /> Complete</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-golden-400 inline-block" /> Partial</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300 inline-block" /> Not Updated</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block" /> Holiday/Week Off</span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-violet-400 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
          {dateKeys.map(key => {
            const info = days[key];
            const dayNum = parseInt(key.slice(-2));
            return (
              <button key={key} onClick={() => info.status !== 'future' && openDay(key)}
                disabled={info.status === 'future'}
                className={`aspect-square rounded-lg text-xs font-medium flex items-center justify-center transition-transform hover:scale-105 ${COLOR[info.status]}`}
                title={`${LABEL[info.status]}${info.totalHours ? ` — ${info.totalHours}h` : ''}`}>
                {dayNum}
              </button>
            );
          })}
        </div>
      </Card>

      <Modal isOpen={!!selectedDate} onClose={() => setSelectedDate(null)} title={selectedDate || ''} size="lg">
        {!dayDetail ? (
          <p className="text-sm text-violet-400">Loading...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-violet-600 font-semibold">{dayDetail.totalHours || 0}h logged</span>
              {dayDetail.attendance && (
                <span className="text-gray-500">
                  Office: {dayDetail.attendance.checkIn || '—'} – {dayDetail.attendance.checkOut || '—'} ({dayDetail.attendance.workHours || 0}h)
                </span>
              )}
            </div>

            {dayDetail.entries?.length > 0 ? (
              <div className="space-y-2">
                {dayDetail.entries.map((en, i) => (
                  <div key={en._id || i} className="p-3 border border-violet-100 rounded-lg text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-violet-900">{en.task}</span>
                      <span className="badge badge-violet">{en.hours}h</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {en.workCategory} {en.project?.name && `· ${en.project.name}`} · {en.status}
                    </div>
                    {en.status === 'Blocked' && en.blocker && (
                      <p className="text-xs text-gray-900 mt-1">Blocker: {en.blocker}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-violet-400">No tasks logged this day.</p>
            )}

            {dayDetail.dailyUpdate?.savedAt ? (
              <div className="p-3 bg-violet-50 rounded-lg text-sm space-y-1">
                <p><b>Completed:</b> {dayDetail.dailyUpdate.completedToday || '—'}</p>
                <p><b>Continuing tomorrow:</b> {dayDetail.dailyUpdate.continuingTomorrow || '—'}</p>
                <p><b>Blockers:</b> {dayDetail.dailyUpdate.blockers || '—'}</p>
                <p><b>Day Status:</b> {dayDetail.dailyUpdate.dayStatus || '—'}</p>
              </div>
            ) : (
              <p className="text-sm text-violet-400">No daily update saved for this day.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};

export default TimesheetCalendar;
