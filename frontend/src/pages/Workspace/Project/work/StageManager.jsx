import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, ChevronUp, ChevronDown, Trash2, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import { errMsg } from './workUtils';

const COLORS = ['#94A3B8', '#6366F1', '#0EA5E9', '#F59E0B', '#F97316', '#EC4899', '#10B981', '#DC2626'];

/**
 * Edit the Bug Sheet pipeline: add, rename, recolor, reorder, mark the
 * "done" stage, delete (moving its bugs to another stage).
 * Each change is saved immediately; the server returns the fresh list.
 */
const StageManager = ({ open, onClose, projectId, stages, onChange }) => {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState(null); // { stage, moveTo }

  useEffect(() => { if (open) setRows(stages.map((s) => ({ ...s }))); }, [open, stages]);
  if (!open) return null;

  const base = `/projects/${projectId}/work/bug-stages`;
  const run = async (fn, okMsg) => {
    try {
      setBusy(true);
      const res = await fn();
      onChange(res.data.stages || []);
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Could not save stages'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (await run(() => api.post(base, { name: newName.trim(), color: COLORS[rows.length % COLORS.length] }), 'Stage added')) setNewName('');
  };

  const saveRow = (s, patch) => run(() => api.put(`${base}/${s._id}`, patch));

  const move = (index, dir) => {
    const ids = rows.map((r) => r._id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => api.put(`${base}/reorder`, { ids }));
  };

  const confirmDelete = async () => {
    const { stage, moveTo } = deleting;
    if (stage.bugCount && !moveTo) { toast.error('Choose where its bugs should go'); return; }
    const ok = await run(() => api.delete(`${base}/${stage._id}`, { params: moveTo ? { moveTo } : {} }), 'Stage deleted');
    if (ok) setDeleting(null);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => !busy && onClose()}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Bug pipeline stages</h3>
            <p className="text-[11px] text-gray-400">Bugs in a “done” stage count as completed.</p>
          </div>
          <div className="flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <ul className="p-4 space-y-2">
          {rows.map((s, i) => (
            <li key={s._id} className="rounded-xl border border-gray-100 p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Move up"><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)} className="text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Move down"><ChevronDown className="w-4 h-4" /></button>
                </div>
                <input
                  value={s.name}
                  aria-label="Stage name"
                  onChange={(e) => setRows((r) => r.map((x) => (x._id === s._id ? { ...x, name: e.target.value } : x)))}
                  onBlur={(e) => { const v = e.target.value.trim(); const orig = stages.find((x) => x._id === s._id); if (v && v !== orig?.name) saveRow(s, { name: v }); }}
                  className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
                <span className="text-[11px] text-gray-400 shrink-0 w-12 text-right">{s.bugCount} bug{s.bugCount === 1 ? '' : 's'}</span>
                <button type="button" onClick={() => setDeleting({ stage: s, moveTo: '' })} disabled={busy || rows.length <= 1}
                  className="text-gray-300 hover:text-rose-600 disabled:opacity-30" aria-label="Delete stage"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-6">
                <div className="flex gap-1.5" role="radiogroup" aria-label="Stage color">
                  {COLORS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={s.color === c} aria-label={c} disabled={busy}
                      onClick={() => saveRow(s, { color: c })}
                      className={`w-5 h-5 rounded-full border-2 ${s.color?.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-white shadow'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-200" checked={s.isCompleted} disabled={busy}
                    onChange={(e) => saveRow(s, { isCompleted: e.target.checked })} />
                  <Check className="w-3.5 h-3.5 text-emerald-500" /> Done stage
                </label>
              </div>
              {deleting?.stage._id === s._id && (
                <div className="mt-2 ml-6 rounded-lg bg-rose-50 border border-rose-100 p-2.5 space-y-2">
                  {s.bugCount > 0 && (
                    <select value={deleting.moveTo} onChange={(e) => setDeleting((d) => ({ ...d, moveTo: e.target.value }))}
                      className="w-full text-xs border border-rose-200 rounded-lg px-2 py-1.5 bg-white">
                      <option value="">Move its {s.bugCount} bug(s) to…</option>
                      {rows.filter((x) => x._id !== s._id).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                    </select>
                  )}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setDeleting(null)} className="px-2.5 py-1 text-xs text-gray-600 rounded-lg border border-gray-200 bg-white">Cancel</button>
                    <button type="button" onClick={confirmDelete} disabled={busy} className="px-2.5 py-1 text-xs text-white rounded-lg bg-rose-600 hover:bg-rose-700">Delete stage</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={add} className="px-4 pb-4 flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New stage name (e.g. QA review)" maxLength={60}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <button type="submit" disabled={busy || !newName.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default StageManager;
