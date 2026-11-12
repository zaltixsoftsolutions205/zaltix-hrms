import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';

const DAY_STATUSES = ['Productive', 'Partially Productive', 'Blocked'];

// Daily Update — no approval; saving makes it immediately visible to managers/HR/Admin.
const DailyUpdateForm = ({ date, dailyUpdate, onSaved }) => {
  const [form, setForm] = useState({ completedToday: '', continuingTomorrow: '', blockers: '', dayStatus: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm({
      completedToday: dailyUpdate?.completedToday || '',
      continuingTomorrow: dailyUpdate?.continuingTomorrow || '',
      blockers: dailyUpdate?.blockers || '',
      dayStatus: dailyUpdate?.dayStatus || null,
    });
  }, [dailyUpdate, date]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.post('/timesheets/daily-update', { date, ...form });
      toast.success('Daily update saved');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="font-bold text-violet-900 text-sm mb-3">Daily Update</h3>
      <div className="space-y-3">
        <div>
          <label className="input-label">What did you complete today?</label>
          <textarea className="input-field" rows={2} value={form.completedToday} onChange={e => update('completedToday', e.target.value)} />
        </div>
        <div>
          <label className="input-label">What are you continuing tomorrow?</label>
          <textarea className="input-field" rows={2} value={form.continuingTomorrow} onChange={e => update('continuingTomorrow', e.target.value)} />
        </div>
        <div>
          <label className="input-label">Any blockers?</label>
          <textarea className="input-field" rows={2} value={form.blockers} onChange={e => update('blockers', e.target.value)} />
        </div>
        <div>
          <label className="input-label">Overall Day Status</label>
          <div className="flex gap-2 flex-wrap">
            {DAY_STATUSES.map(s => (
              <button key={s} type="button" onClick={() => update('dayStatus', s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.dayStatus === s ? 'bg-violet-700 text-white border-violet-700' : 'border-violet-200 text-violet-600 hover:bg-violet-50'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleSave} disabled={loading} className="btn-primary">
          {loading ? 'Saving...' : 'Save Daily Update'}
        </button>
      </div>
    </Card>
  );
};

export default DailyUpdateForm;
