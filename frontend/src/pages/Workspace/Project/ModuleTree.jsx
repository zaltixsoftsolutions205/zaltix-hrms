import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Trash2, Save, Loader2, Eye, Maximize2, ArrowRight, ArrowLeft, ListChecks, Workflow } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS = {
  planning: { label: 'Planning', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  'in-progress': { label: 'In Progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  done: { label: 'Done', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const COLORS = ['#7C3AED', '#2563EB', '#0EA5E9', '#059669', '#D97706', '#DC2626', '#DB2777', '#475569'];
const EMPTY_FORM = { name: '', description: '', status: 'planning', color: COLORS[0], lead: '' };

const initials = (name) => (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

/* ------------------------------------------------------------------ */
/* Canvas pieces                                                       */
/* ------------------------------------------------------------------ */

const ModuleCard = ({ data, selected }) => {
  const m = data.module;
  const st = STATUS[m.status] || STATUS.planning;
  return (
    <div
      className={`w-60 rounded-xl bg-white border shadow-sm transition-shadow ${selected ? 'border-violet-400 shadow-md ring-2 ring-violet-100' : 'border-gray-200 hover:shadow-md'}`}
      style={{ borderLeft: `4px solid ${m.color || COLORS[0]}` }}
    >
      <Handle type="target" position={Position.Left} isConnectable={data.canEdit} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-violet-400" />
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{m.name}</p>
          <span className={`shrink-0 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
        </div>
        {m.description && <p className="mt-1 text-[11px] text-gray-500 line-clamp-2">{m.description}</p>}
        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
          {m.lead ? (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                {initials(m.lead.name)}
              </span>
              <span className="truncate">{m.lead.name}</span>
            </span>
          ) : (
            <span>No lead</span>
          )}
          <span className="shrink-0 inline-flex items-center gap-1.5">
            <span title="Open tasks">{m.counts?.task?.open ?? 0} tasks</span>
            {(m.counts?.bug?.open ?? 0) > 0 && <span className="text-rose-500 font-semibold" title="Open bugs">{m.counts.bug.open} bugs</span>}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={data.canEdit} className="!w-2.5 !h-2.5 !bg-violet-500 !border-2 !border-white" />
    </div>
  );
};

const LinkEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, label, selected, data }) => {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: selected ? '#7C3AED' : '#A78BFA', strokeWidth: selected ? 2.5 : 1.75 }} />
      {(label || (selected && data?.canEdit)) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          >
            {label && <span className="px-1.5 py-0.5 rounded bg-white border border-violet-100 text-[10px] text-violet-700 shadow-sm">{label}</span>}
            {selected && data?.canEdit && (
              <button
                type="button"
                onClick={() => data.onRemove(id)}
                className="w-5 h-5 rounded-full bg-white border border-rose-200 text-rose-600 flex items-center justify-center shadow-sm hover:bg-rose-50"
                aria-label="Remove link"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const nodeTypes = { module: ModuleCard };
const edgeTypes = { link: LinkEdge };

/* ------------------------------------------------------------------ */
/* Module form (create + drawer edit)                                  */
/* ------------------------------------------------------------------ */

const inputCls = 'w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1';

const ModuleFields = ({ form, setForm, people, disabled }) => (
  <div className="space-y-3">
    <div>
      <label className={labelCls} htmlFor="mod-name">Name *</label>
      <input id="mod-name" className={inputCls} maxLength={80} value={form.name} disabled={disabled}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
    </div>
    <div>
      <label className={labelCls} htmlFor="mod-desc">Description</label>
      <textarea id="mod-desc" rows={3} className={inputCls} value={form.description} disabled={disabled}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls} htmlFor="mod-status">Status</label>
        <select id="mod-status" className={inputCls} value={form.status} disabled={disabled}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="mod-lead">Lead</label>
        <select id="mod-lead" className={inputCls} value={form.lead} disabled={disabled}
          onChange={(e) => setForm((f) => ({ ...f, lead: e.target.value }))}>
          <option value="">No lead</option>
          {people.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>
    </div>
    <div>
      <span className={labelCls}>Color</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Module color">
        {COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={form.color === c} aria-label={c} disabled={disabled}
            onClick={() => setForm((f) => ({ ...f, color: c }))}
            className={`w-7 h-7 rounded-full border-2 transition-transform disabled:cursor-not-allowed ${form.color === c ? 'border-gray-900 scale-110' : 'border-white shadow'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Main canvas                                                         */
/* ------------------------------------------------------------------ */

const ModuleTreeCanvas = ({ projectId }) => {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modules, setModules] = useState([]);
  const [access, setAccess] = useState({});
  const [people, setPeople] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const canEdit = access.moduleTree === 'edit';
  const byId = useMemo(() => new Map(modules.map((m) => [m._id, m])), [modules]);
  const selected = selectedId ? byId.get(selectedId) : null;

  /* ---------- load ---------- */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [modRes, projRes] = await Promise.all([
        api.get(`/projects/${projectId}/modules`),
        api.get(`/projects/${projectId}`),
      ]);
      setModules(modRes.data.modules || []);
      setAccess(modRes.data.access || {});
      const p = projRes.data.project || {};
      const list = [p.manager, ...(p.teamMembers || [])].filter((x) => x && x._id);
      setPeople([...new Map(list.map((x) => [x._id, x])).values()]);
    } catch (err) {
      setError(errMsg(err, 'Could not load the module tree.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  /* ---------- remove a link ---------- */
  const removeLink = useCallback(async (linkId) => {
    const owner = modules.find((m) => m.links.some((l) => l._id === linkId));
    if (!owner) return;
    try {
      await api.delete(`/projects/${projectId}/modules/${owner._id}/links/${linkId}`);
      setModules((ms) => ms.map((m) => (m._id === owner._id ? { ...m, links: m.links.filter((l) => l._id !== linkId) } : m)));
      toast.success('Link removed');
    } catch (err) {
      toast.error(errMsg(err, 'Could not remove link'));
    }
  }, [modules, projectId]);

  /* ---------- modules -> React Flow nodes / edges ---------- */
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return modules.map((m) => {
        const old = prevById.get(m._id);
        return {
          id: m._id,
          type: 'module',
          position: old?.position || m.position,
          selected: old?.selected || false,
          draggable: canEdit,
          data: { module: m, canEdit },
        };
      });
    });
    setEdges(
      modules.flatMap((m) =>
        m.links.map((l) => ({
          id: l._id,
          source: m._id,
          target: String(l.target),
          type: 'link',
          label: l.label || undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#7C3AED' },
          data: { canEdit, onRemove: removeLink },
        }))
      )
    );
  }, [modules, canEdit, removeLink, setNodes, setEdges]);

  /* ---------- save positions after a drag (debounced) ---------- */
  const pendingPositions = useRef(new Map());
  const saveTimer = useRef(null);
  const flushPositions = useCallback(async () => {
    const positions = [...pendingPositions.current.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    pendingPositions.current.clear();
    if (!positions.length) return;
    try {
      await api.put(`/projects/${projectId}/modules/positions`, { positions });
      setModules((ms) => ms.map((m) => {
        const p = positions.find((x) => x.id === m._id);
        return p ? { ...m, position: { x: p.x, y: p.y } } : m;
      }));
    } catch (err) {
      toast.error(errMsg(err, 'Could not save layout'));
    }
  }, [projectId]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (pendingPositions.current.size) flushPositions();
  }, [flushPositions]);

  const onNodeDragStop = useCallback((_e, _node, dragged) => {
    if (!canEdit) return;
    (dragged || [_node]).forEach((n) => pendingPositions.current.set(n.id, n.position));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushPositions, 600);
  }, [canEdit, flushPositions]);

  /* ---------- connect two cards ---------- */
  const onConnect = useCallback(async ({ source, target }) => {
    if (!canEdit || !source || !target) return;
    if (source === target) { toast.error('A module cannot link to itself'); return; }
    try {
      const res = await api.post(`/projects/${projectId}/modules/${source}/links`, { target });
      const link = res.data.link;
      setModules((ms) => ms.map((m) => (m._id === source ? { ...m, links: [...m.links, { _id: link._id, target: String(link.target), label: link.label || '' }] } : m)));
    } catch (err) {
      toast.error(errMsg(err, 'Could not link modules'));
    }
  }, [canEdit, projectId]);

  // Keyboard delete removes selected links only; cards are deleted from the drawer (with confirm).
  const onBeforeDelete = useCallback(async ({ edges: delEdges }) => {
    if (canEdit) delEdges.forEach((e) => removeLink(e.id));
    return false;
  }, [canEdit, removeLink]);

  /* ---------- create ---------- */
  const openCreate = () => {
    setCreateForm(EMPTY_FORM);
    setCreateOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) { toast.error('Module name is required'); return; }
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    // Nudge so stacked new cards don't overlap exactly.
    const offset = (modules.length % 5) * 24;
    try {
      setCreating(true);
      const res = await api.post(`/projects/${projectId}/modules`, {
        ...createForm,
        lead: createForm.lead || null,
        position: { x: Math.round(center.x - 120 + offset), y: Math.round(center.y - 40 + offset) },
      });
      setModules((ms) => [...ms, res.data.module]);
      setCreateOpen(false);
      toast.success('Module added');
    } catch (err) {
      toast.error(errMsg(err, 'Could not add module'));
    } finally {
      setCreating(false);
    }
  };

  /* ---------- drawer ---------- */
  const openDrawer = useCallback((id) => {
    const m = byId.get(id);
    if (!m) return;
    setSelectedId(id);
    setEditForm({ name: m.name, description: m.description || '', status: m.status, color: m.color, lead: m.lead?._id || '' });
  }, [byId]);

  const handleSave = async () => {
    if (!editForm.name.trim()) { toast.error('Module name is required'); return; }
    try {
      setSaving(true);
      const res = await api.put(`/projects/${projectId}/modules/${selectedId}`, { ...editForm, lead: editForm.lead || null });
      setModules((ms) => ms.map((m) => (m._id === selectedId ? { ...res.data.module, position: m.position, counts: m.counts } : m)));
      toast.success('Module saved');
    } catch (err) {
      toast.error(errMsg(err, 'Could not save module'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete module "${selected.name}"? Its links will be removed too.`)) return;
    try {
      await api.delete(`/projects/${projectId}/modules/${selected._id}`);
      setModules((ms) => ms
        .filter((m) => m._id !== selected._id)
        .map((m) => ({ ...m, links: m.links.filter((l) => String(l.target) !== selected._id) })));
      setSelectedId(null);
      toast.success('Module deleted');
    } catch (err) {
      toast.error(errMsg(err, 'Could not delete module'));
    }
  };

  const outgoing = selected ? selected.links.map((l) => ({ link: l, other: byId.get(String(l.target)) })) : [];
  const incoming = selected
    ? modules.flatMap((m) => m.links.filter((l) => String(l.target) === selected._id).map((l) => ({ link: l, other: m })))
    : [];

  /* ---------- render ---------- */
  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-violet-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center">
        <p className="text-sm text-rose-700">{error}</p>
        <button type="button" onClick={load} className="mt-3 text-xs font-semibold text-rose-700 underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Workflow className="w-4 h-4 text-violet-500" />
          <span className="font-semibold text-gray-900">{modules.length} module{modules.length === 1 ? '' : 's'}</span>
          {!canEdit && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
              <Eye className="w-3 h-3" /> View only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fitView({ padding: 0.2, duration: 300 })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
            <Maximize2 className="w-3.5 h-3.5" /> Fit
          </button>
          {canEdit && (
            <button type="button" onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
              <Plus className="w-3.5 h-3.5" /> Add module
            </button>
          )}
        </div>
      </div>

      {/* Canvas + drawer */}
      <div ref={wrapperRef} className="relative h-[calc(100vh-300px)] min-h-[460px] rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
        {modules.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center pointer-events-none px-4">
            <Workflow className="w-10 h-10 text-violet-200 mb-2" />
            <p className="text-sm font-semibold text-gray-700">No modules yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              {canEdit ? 'Add module cards, then drag from the right dot of one card to the left dot of another to link them.' : 'The team lead has not added any modules yet.'}
            </p>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onBeforeDelete={onBeforeDelete}
          onNodeClick={(_e, node) => openDrawer(node.id)}
          onNodeDoubleClick={(_e, node) => navigate(`/projects/${projectId}/modules/${node.id}`)}
          zoomOnDoubleClick={false}
          onPaneClick={() => setSelectedId(null)}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          edgesFocusable={canEdit}
          deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#DDD6FE" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => n.data?.module?.color || '#7C3AED'} maskColor="rgba(245,243,255,0.6)" className="!hidden sm:!block" />
        </ReactFlow>

        {/* Drawer: right panel on desktop, bottom sheet on phones */}
        <AnimatePresence>
          {selected && (
            <motion.aside
              key={selected._id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18 }}
              className="absolute z-20 bg-white border-gray-100 shadow-xl overflow-y-auto
                         inset-x-0 bottom-0 max-h-[75%] rounded-t-2xl border-t
                         md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:max-h-none md:w-[360px] md:rounded-none md:border-t-0 md:border-l"
            >
              <div className="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
                  <h3 className="text-sm font-bold text-gray-900 truncate">{selected.name}</h3>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-5">
                <ModuleFields form={editForm} setForm={setEditForm} people={people} disabled={!canEdit} />

                {canEdit && (
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={handleDelete}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                    <button type="button" onClick={handleSave} disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                    </button>
                  </div>
                )}

                <div>
                  <p className={labelCls}>Links</p>
                  {outgoing.length === 0 && incoming.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      {canEdit ? 'Drag from the right dot of a card to another card to link them.' : 'Not linked to other modules.'}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {outgoing.map(({ link, other }) => (
                        <li key={link._id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-xs">
                          <span className="inline-flex items-center gap-1.5 min-w-0 text-gray-700">
                            <ArrowRight className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <button type="button" className="truncate hover:underline" onClick={() => other && openDrawer(other._id)}>{other?.name || 'Unknown'}</button>
                          </span>
                          {canEdit && (
                            <button type="button" onClick={() => removeLink(link._id)} className="text-gray-300 hover:text-rose-600" aria-label="Remove link">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                      {incoming.map(({ link, other }) => (
                        <li key={link._id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-xs">
                          <span className="inline-flex items-center gap-1.5 min-w-0 text-gray-700">
                            <ArrowLeft className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            <button type="button" className="truncate hover:underline" onClick={() => openDrawer(other._id)}>{other.name}</button>
                          </span>
                          {canEdit && (
                            <button type="button" onClick={() => removeLink(link._id)} className="text-gray-300 hover:text-rose-600" aria-label="Remove link">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                    <ListChecks className="w-3.5 h-3.5" /> Work in this module
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ['Tasks', selected.counts?.task],
                      ['Milestones', selected.counts?.milestone],
                      ['Bugs', selected.counts?.bug],
                    ].map(([label, c]) => (
                      <div key={label} className="rounded-lg bg-white border border-violet-100 py-1.5">
                        <p className="text-sm font-bold text-gray-900">{c?.open ?? 0}<span className="text-gray-300 font-normal">/{c?.total ?? 0}</span></p>
                        <p className="text-[10px] text-gray-400">{label} open</p>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => navigate(`/projects/${projectId}/modules/${selected._id}`)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
                    Open module <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {createOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !creating && setCreateOpen(false)}>
            <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}
              className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Add module</h3>
                <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ModuleFields form={createForm} setForm={setCreateForm} people={people} disabled={false} />
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setCreateOpen(false)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ModuleTree = ({ projectId }) => (
  <ReactFlowProvider>
    <ModuleTreeCanvas projectId={projectId} />
  </ReactFlowProvider>
);

export default ModuleTree;
