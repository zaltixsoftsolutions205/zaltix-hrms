import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Trash2, Lock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import WorkItemActivity from './WorkItemActivity';
import {
  KIND_META, STATUS_META, STATUSES, PRIORITY_META, PRIORITIES, hasLevel, editScope, errMsg, toInputDate, fmtDate,
} from './workUtils';

const inputCls = 'w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50 disabled:text-gray-500';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1';

/**
 * Create / edit a task, milestone or bug.
 *
 * props:
 *   item       existing item (edit) or null (create)
 *   defaults   { kind, module, plan, stage } for create
 *   lockKind   hide the kind switch
 *   people     project lead + members (assignable)
 *   modules    project modules
 *   stages     bug stages (for bugs)
 *   access     caller's project access
 *   userId     caller
 */
const WorkItemModal = ({
  open, onClose, projectId, item, defaults = {}, lockKind = false,
  people = [], modules = [], stages: stagesProp = [], access = {}, userId, onSaved, onDeleted,
}) => {
  const isEdit = Boolean(item);
  const [form, setForm] = useState(null);
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Bug stages: use the caller's list (Bug Sheet), otherwise load them here
  // (module page / timeline open this dialog without one).
  const [loadedStages, setLoadedStages] = useState([]);
  const stages = stagesProp.length ? stagesProp : loadedStages;

  useEffect(() => {
    if (!open || stagesProp.length || form?.kind !== 'bug' || loadedStages.length) return;
    let cancelled = false;
    api.get(`/projects/${projectId}/work/bug-stages`)
      .then((res) => {
        if (cancelled) return;
        const list = res.data.stages || [];
        setLoadedStages(list);
        setForm((f) => (f && !f.stage && list[0] ? { ...f, stage: list[0]._id } : f));
      })
      .catch(() => { if (!cancelled) setLoadedStages([]); });
    return () => { cancelled = true; };
  }, [open, projectId, form?.kind, stagesProp.length, loadedStages.length]);

  // Initialise the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        kind: item.kind,
        module: item.module?._id || '',
        plan: item.plan?._id || '',
        title: item.title,
        description: item.description || '',
        assignees: (item.assignees || []).map((a) => String(a._id)),
        priority: item.priority || 'medium',
        startDate: toInputDate(item.startDate),
        deadline: toInputDate(item.deadline),
        status: item.status,
        stage: item.stage?._id || '',
        progress: item.progress || 0,
        isPrivate: Boolean(item.isPrivate),
      });
    } else {
      setForm({
        kind: defaults.kind || 'task',
        module: defaults.module || modules[0]?._id || '',
        plan: defaults.plan || '',
        title: '',
        description: '',
        assignees: [],
        priority: 'medium',
        startDate: toInputDate(new Date()),
        deadline: '',
        status: 'not-started',
        stage: defaults.stage || stages[0]?._id || '',
        progress: 0,
        isPrivate: false,
      });
    }
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps

  // Plans of the selected module (tasks / milestones only).
  useEffect(() => {
    if (!open || !form?.module || form.kind === 'bug') { setPlans([]); return; }
    let cancelled = false;
    api.get(`/projects/${projectId}/work/plans`, { params: { module: form.module } })
      .then((res) => { if (!cancelled) setPlans(res.data.plans || []); })
      .catch(() => { if (!cancelled) setPlans([]); });
    return () => { cancelled = true; };
  }, [open, projectId, form?.module, form?.kind]);

  const scope = isEdit ? editScope(item, access, userId) : 'full';
  const full = scope === 'full';
  const statusOnly = scope === 'status';

  // Kinds the caller may create here.
  const creatableKinds = useMemo(() => Object.keys(KIND_META).filter((k) => (
    k === 'bug' ? hasLevel(access, 'bugs', 'view') : hasLevel(access, 'tasks', 'edit')
  )), [access]);

  if (!open || !form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleAssignee = (id) => set({ assignees: form.assignees.includes(id) ? form.assignees.filter((x) => x !== id) : [...form.assignees, id] });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.module) { toast.error('Pick a module'); return; }
    if (form.kind === 'milestone' && !form.deadline) { toast.error('A milestone needs a date'); return; }

    const payload = statusOnly
      ? (form.kind === 'bug' ? { stage: form.stage, progress: Number(form.progress) } : { status: form.status, progress: Number(form.progress) })
      : {
        kind: form.kind,
        module: form.module,
        title: form.title.trim(),
        description: form.description,
        assignees: form.assignees,
        priority: form.priority,
        isPrivate: form.isPrivate,
        deadline: form.deadline || null,
        ...(form.kind === 'bug'
          ? { stage: form.stage || undefined }
          : { plan: form.plan || null, status: form.status, ...(form.kind === 'task' ? { startDate: form.startDate || null } : {}) }),
        ...(isEdit ? { progress: Number(form.progress) } : {}),
      };
    if (isEdit) delete payload.kind;

    try {
      setSaving(true);
      const res = isEdit
        ? await api.put(`/projects/${projectId}/work/items/${item._id}`, payload)
        : await api.post(`/projects/${projectId}/work/items`, payload);
      toast.success(isEdit ? 'Saved' : `${KIND_META[form.kind].label} created`);
      onSaved?.(res.data.item);
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      await api.delete(`/projects/${projectId}/work/items/${item._id}`);
      toast.success('Deleted');
      onDeleted?.(item._id);
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Could not delete'));
    } finally {
      setDeleting(false);
    }
  };

  const readOnly = isEdit && !full;
  const title = isEdit ? `${KIND_META[form.kind].label} ${item.taskCode || ''}` : (form.kind === 'bug' ? 'Report bug' : `New ${KIND_META[form.kind].label.toLowerCase()}`);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
        onClick={() => !saving && onClose()}>
        <motion.form initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
          onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}
          className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
              {isEdit && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {item.reporter?.name ? `Reported by ${item.reporter.name} · ` : item.createdBy?.name ? `Created by ${item.createdBy.name} · ` : ''}
                  {fmtDate(item.createdAt)}
                  {statusOnly && ' · you can change the status and progress'}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-5 space-y-4">
            {!isEdit && !lockKind && creatableKinds.length > 1 && (
              <div className="flex gap-1.5" role="radiogroup" aria-label="Type">
                {creatableKinds.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={form.kind === k}
                    onClick={() => set({ kind: k, plan: '', stage: k === 'bug' ? (stages[0]?._id || '') : '' })}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${form.kind === k ? KIND_META[k].cls : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {KIND_META[k].label}
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className={labelCls} htmlFor="wi-title">Title *</label>
              <input id="wi-title" className={inputCls} value={form.title} disabled={readOnly} maxLength={200}
                onChange={(e) => set({ title: e.target.value })} autoFocus={!isEdit} />
            </div>

            <div>
              <label className={labelCls} htmlFor="wi-desc">{form.kind === 'bug' ? 'What happened? Steps to reproduce' : 'Description'}</label>
              <textarea id="wi-desc" rows={form.kind === 'bug' ? 4 : 3} className={inputCls} value={form.description} disabled={readOnly}
                onChange={(e) => set({ description: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="wi-module">Module *</label>
                <select id="wi-module" className={inputCls} value={form.module} disabled={readOnly}
                  onChange={(e) => set({ module: e.target.value, plan: '' })}>
                  <option value="">Select module</option>
                  {modules.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                </select>
              </div>

              {form.kind !== 'bug' ? (
                <div>
                  <label className={labelCls} htmlFor="wi-plan">Plan</label>
                  <select id="wi-plan" className={inputCls} value={form.plan} disabled={readOnly || !form.module}
                    onChange={(e) => set({ plan: e.target.value })}>
                    <option value="">No plan</option>
                    {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className={labelCls} htmlFor="wi-stage">Stage</label>
                  <select id="wi-stage" className={inputCls} value={form.stage || stages[0]?._id || ''} disabled={isEdit && !full && !statusOnly}
                    onChange={(e) => set({ stage: e.target.value })}>
                    {stages.length === 0 && <option value="">Loading stages…</option>}
                    {stages.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {form.kind !== 'bug' && (
                <div>
                  <label className={labelCls} htmlFor="wi-status">Status</label>
                  <select id="wi-status" className={inputCls} value={form.status} disabled={isEdit && !full && !statusOnly}
                    onChange={(e) => set({ status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls} htmlFor="wi-priority">{form.kind === 'bug' ? 'Severity' : 'Priority'}</label>
                <select id="wi-priority" className={inputCls} value={form.priority} disabled={readOnly}
                  onChange={(e) => set({ priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </select>
              </div>

              {form.kind === 'task' && (
                <div>
                  <label className={labelCls} htmlFor="wi-start">Start</label>
                  <input id="wi-start" type="date" className={inputCls} value={form.startDate} disabled={readOnly}
                    onChange={(e) => set({ startDate: e.target.value })} />
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor="wi-due">{form.kind === 'milestone' ? 'Milestone date *' : 'Deadline'}</label>
                <input id="wi-due" type="date" className={inputCls} value={form.deadline} disabled={readOnly}
                  onChange={(e) => set({ deadline: e.target.value })} />
              </div>

              {isEdit && form.kind !== 'milestone' && (
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="wi-progress">Progress · {form.progress}%</label>
                  <input id="wi-progress" type="range" min="0" max="100" step="5" value={form.progress}
                    disabled={!full && !statusOnly} onChange={(e) => set({ progress: Number(e.target.value) })}
                    className="w-full accent-violet-600" />
                </div>
              )}
            </div>

            <div>
              <span className={labelCls}>Assign to</span>
              {people.length === 0 ? (
                <p className="text-xs text-gray-400">No project members yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p) => {
                    const on = form.assignees.includes(String(p._id));
                    return (
                      <button key={p._id} type="button" disabled={readOnly} aria-pressed={on}
                        onClick={() => toggleAssignee(String(p._id))}
                        className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors disabled:cursor-not-allowed ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-violet-50'}`}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <label className={`flex items-start gap-2.5 rounded-xl border p-3 ${form.isPrivate ? 'border-violet-200 bg-violet-50/50' : 'border-gray-100'} ${readOnly ? 'opacity-70' : 'cursor-pointer'}`}>
              <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-violet-600 focus:ring-violet-200"
                checked={form.isPrivate} disabled={readOnly} onChange={(e) => set({ isPrivate: e.target.checked })} />
              <span>
                <span className="flex items-center gap-1 text-sm font-medium text-gray-800"><Lock className="w-3.5 h-3.5" /> Private</span>
                <span className="block text-[11px] text-gray-500">Only the {form.kind === 'bug' ? 'reporter' : 'creator'}, assignees, the team lead, department managers and admin can see it.</span>
              </span>
            </label>

            {isEdit && (
              <WorkItemActivity
                projectId={projectId}
                item={item}
                userId={userId}
                canEditFiles={Boolean(scope)}
                canModerate={full}
                onAttachmentsChange={(attachments) => onSaved?.({ ...item, attachments })}
              />
            )}
          </div>

          <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
            {isEdit && full ? (
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                {scope ? 'Cancel' : 'Close'}
              </button>
              {scope && (
                <button type="submit" disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isEdit ? 'Save' : form.kind === 'bug' ? 'Report' : 'Create'}
                </button>
              )}
            </div>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
};

export default WorkItemModal;
