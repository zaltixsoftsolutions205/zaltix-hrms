import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const typeConfig = {
  national: { label: 'National', bg: 'bg-violet-100',   text: 'text-violet-700' },
  company:  { label: 'Company',  bg: 'bg-violet-100', text: 'text-violet-700' },
  optional: { label: 'Optional', bg: 'bg-gray-100',   text: 'text-gray-600' },
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const HolidaysPage = () => {
  const { user } = useAuth();
  const canManage = user?.role === 'hr';
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', type: 'national' });
  const [submitting, setSubmitting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/holidays?year=${year}`);
      setHolidays(r.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [year]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.date) return toast.error('Name and date required');
    setSubmitting(true);
    try {
      await api.post('/holidays', form);
      toast.success('Holiday added');
      setForm({ name: '', date: '', type: 'national' });
      setShowForm(false);
      fetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this holiday?')) return;
    try {
      await api.delete(`/holidays/${id}`);
      toast.success('Deleted');
      setHolidays(prev => prev.filter(h => h._id !== id));
    } catch {
      toast.error('Failed to delete');
    }
  };

  // group by month
  const grouped = holidays.reduce((acc, h) => {
    const m = new Date(h.date).getMonth();
    if (!acc[m]) acc[m] = [];
    acc[m].push(h);
    return acc;
  }, {});

  const isPast = (date) => new Date(date) < new Date(new Date().setHours(0, 0, 0, 0));
  const isToday = (date) => new Date(date).toDateString() === new Date().toDateString();

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Holiday Calendar</h2>
          <p className="page-subtitle">Company & national holidays</p>
        </div>
        <div className="flex gap-2">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="input-field w-auto text-sm"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {canManage && (
            <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm">
              {showForm ? 'Cancel' : '+ Add Holiday'}
            </button>
          )}
        </div>
      </div>

      {/* Add Form — HR only */}
      {canManage && showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4">
          <h3 className="font-bold text-violet-900 mb-4">Add Holiday</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="input-label">Name *</label>
                <input
                  className="input-field"
                  placeholder="e.g. Diwali"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Date *</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Type</label>
                <select className="input-field" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  <option value="national">National</option>
                  <option value="company">Company</option>
                  <option value="optional">Optional</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary btn-sm">
                {submitting ? 'Adding...' : 'Add Holiday'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(typeConfig).map(([type, cfg]) => (
          <div key={type} className={`rounded-xl p-3 ${cfg.bg} flex items-center justify-between`}>
            <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
            <span className={`text-xl font-bold ${cfg.text}`}>
              {holidays.filter(h => h.type === type).length}
            </span>
          </div>
        ))}
      </div>

      {/* Calendar list */}
      {loading ? (
        <p className="text-center text-sm text-violet-400 py-8">Loading...</p>
      ) : holidays.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-violet-400 text-sm">No holidays added for {year}.</p>
          {canManage && <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-3">Add First Holiday</button>}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.keys(grouped).sort((a, b) => a - b).map(m => (
            <div key={m}>
              <h4 className="text-xs font-bold text-violet-500 uppercase tracking-wider mb-2 px-1">
                {MONTHS[m]}
              </h4>
              <div className="space-y-2">
                {grouped[m].map(h => {
                  const d = new Date(h.date);
                  const cfg = typeConfig[h.type] || typeConfig.national;
                  const today = isToday(h.date);
                  const past  = isPast(h.date) && !today;
                  return (
                    <motion.div key={h._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${today ? 'bg-violet-50 border-violet-200' : past ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100'} shadow-sm`}>
                      <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-center ${today ? 'bg-violet-500 text-white' : 'bg-violet-50 text-violet-800 border border-violet-100'}`}>
                        <span className="text-[9px] font-semibold uppercase leading-none">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}</span>
                        <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-violet-900 truncate">{h.name}</p>
                        <p className="text-xs text-gray-400">{DAYS[d.getDay()]}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      {canManage && (
                        <button onClick={() => handleDelete(h._id)}
                          className="text-xs font-semibold text-gray-900 hover:text-gray-900 flex-shrink-0 ml-1">
                          ✕
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HolidaysPage;
