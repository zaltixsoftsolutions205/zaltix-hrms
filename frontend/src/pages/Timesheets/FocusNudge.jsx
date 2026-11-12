import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

// Smart-insight prompt: shown when the employee has logged only one topic for
// several working days in a row. Asks why, nudges them to take on more, and
// stores their answer for HR/Admin. `refreshKey` re-checks after tasks change.
const FocusNudge = ({ refreshKey }) => {
  const [check, setCheck] = useState(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/timesheets/focus-check')
      .then(res => { setCheck(res.data); setReason(res.data.reason || ''); setEditing(false); })
      .catch(() => setCheck(null));
  }, [refreshKey]);

  if (!check?.show) return null;

  const high = check.severity === 'high';
  const answered = !!check.reason && !editing;

  const save = async () => {
    if (!reason.trim()) return toast.error('Please write a short reason.');
    setSaving(true);
    try {
      const res = await api.post('/timesheets/focus-reason', { reason });
      setCheck(c => ({ ...c, reason: res.data.reason }));
      setEditing(false);
      toast.success('Thanks — your answer was saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${high ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-start gap-2">
        <span className="text-base leading-none">{high ? '🎯' : '💡'}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${high ? 'text-rose-800' : 'text-amber-800'}`}>
            Only one topic for {check.streak} days
          </p>
          <p className="mt-0.5 text-xs leading-snug text-gray-700">{check.message}</p>

          {answered ? (
            <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-700 ring-1 ring-black/5">
              <span className="font-semibold">Your answer:</span> {check.reason}
              <button className="ml-2 font-semibold text-violet-600 hover:underline" onClick={() => setEditing(true)}>Edit</button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <textarea className="input-field" rows={2} value={reason} maxLength={1000}
                placeholder="Why did you work on only one topic? (e.g. large task, waiting on someone, blocked…)"
                onChange={e => setReason(e.target.value)} />
              <button className="btn-primary btn-sm" disabled={saving} onClick={save}>
                {saving ? 'Saving...' : 'Submit answer'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FocusNudge;
