import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import { KIND_META, Pill, errMsg, toInputDate } from './workUtils';

const inputCls = 'w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1';

/** Create / edit a plan and choose which of the module's tasks belong to it. */
const PlanModal = ({ open, onClose, projectId, moduleId, plan, items = [], onSaved, onDeleted }) => {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: plan?.name || '',
      description: plan?.description || '',
      startDate: toInputDate(plan?.startDate),
      endDate: toInputDate(plan?.endDate),
      taskIds: items.filter((i) => plan && String(i.plan?._id || '') === String(plan._id)).map((i) => i._id),
    });
  }, [open, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (id) => set({ taskIds: form.taskIds.includes(id) ? form.taskIds.filter((x) => x !== id) : [...form.taskIds, id] });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Plan name is required'); return; }
    if (form.startDate && form.endDate && form.endDate < form.startDate) { toast.error('End date must be after the start date'); return; }
    const payload = { ...form, name: form.name.trim(), module: moduleId, startDate: form.startDate || null, endDate: form.endDate || null };
    try {
      setSaving(true);
      const res = plan
        ? await api.put(`/projects/${projectId}/work/plans/${plan._id}`, payload)
        : await api.post(`/projects/${projectId}/work/plans`, payload);
      toast.success(plan ? 'Plan saved' : 'Plan created');
      onSaved?.(res.data.plan);
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save plan'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete plan "${plan.name}"? Its tasks are kept.`)) return;
    try {
      await api.delete(`/projects/${projectId}/work/plans/${plan._id}`);
      toast.success('Plan deleted');
      onDeleted?.(plan._id);
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Could not delete plan'));
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
      onClick={() => !saving && onClose()}>
      <motion.form initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{plan ? 'Edit plan' : 'New plan'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls} htmlFor="plan-name">Name *</label>
            <input id="plan-name" className={inputCls} value={form.name} maxLength={120} autoFocus onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="plan-desc">Description</label>
            <textarea id="plan-desc" rows={2} className={inputCls} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="plan-start">Start</label>
              <input id="plan-start" type="date" className={inputCls} value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="plan-end">End</label>
              <input id="plan-end" type="date" className={inputCls} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <span className={labelCls}>Tasks in this plan · {form.taskIds.length}</span>
            {items.length === 0 ? (
              <p className="text-xs text-gray-400">This module has no tasks yet. Add tasks, then group them here.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                {items.map((i) => {
                  const inOther = i.plan && (!plan || String(i.plan._id) !== String(plan._id));
                  return (
                    <label key={i._id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-200"
                        checked={form.taskIds.includes(i._id)} onChange={() => toggle(i._id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-800 truncate">{i.title}</span>
                        {inOther && <span className="block text-[10px] text-amber-600">Now in “{i.plan.name}” — ticking moves it here</span>}
                      </span>
                      <Pill meta={KIND_META[i.kind]} />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          {plan ? (
            <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50">
              <Trash2 className="w-3.5 h-3.5" /> Delete plan
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {plan ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </motion.form>
    </motion.div>
  );
};

export default PlanModal;
