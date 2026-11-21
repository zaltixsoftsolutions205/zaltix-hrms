import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { MODULE_GROUPS, BASELINE_MODULES, PERMISSIONS } from '../../constants/modules';

/**
 * ModuleAccessPicker — per-employee module access, as a collapsible tree
 * (same look as the Product → Mandal picker).
 *
 * value:    array of { module, permission } (the employee's moduleAccess)
 * onChange: (next array) => void
 *
 * Tree:  Group (Self-service, Sales, HR, Admin, Workspace)
 *          → Module (View / Edit)
 *              → Sub-module (Project → Module Tree / Tasks & Plans / Bug Sheet / Timeline)
 *
 *  - A group's checkbox grants View on all its modules (indeterminate when
 *    only some are granted); unticking removes them all.
 *  - Edit implies View. Baseline self-service modules are "Always on".
 *  - Project sub-modules override the department role tree's default for
 *    that part of a project. Not set = the role tree decides. Ticking one
 *    grants Project (View) too; removing Project removes its sub-modules.
 *  - An empty value means "use role defaults". Workspace is never part of
 *    the role defaults: it has to be ticked here.
 */

function TriCheckbox({ state, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'partial'; }, [state]);
  return (
    <input ref={ref} type="checkbox" aria-label={label} checked={state === 'all'} onChange={onChange}
      className="w-4 h-4 shrink-0 rounded border-violet-300 accent-violet-600 cursor-pointer" />
  );
}

const PermBoxes = ({ granted, canEdit, editable, onView, onEdit, name }) => (
  <div className="flex items-center gap-3 shrink-0">
    <label className="flex items-center gap-1 cursor-pointer">
      <input type="checkbox" className="accent-violet-600" checked={granted} onChange={(e) => onView(e.target.checked)} aria-label={`${name}: view`} />
      <span className="text-[10px] font-semibold text-violet-600">View</span>
    </label>
    {editable && (
      <label className="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" className="accent-violet-600" checked={canEdit} onChange={(e) => onEdit(e.target.checked)} aria-label={`${name}: edit`} />
        <span className="text-[10px] font-semibold text-violet-600">Edit</span>
      </label>
    )}
  </div>
);

export default function ModuleAccessPicker({ value = [], onChange }) {
  const access = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const byKey = useMemo(() => access.reduce((acc, a) => { acc[a.module] = a.permission; return acc; }, {}), [access]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set());

  const isGranted = (key) => key in byKey;
  const isEdit = (key) => byKey[key] === PERMISSIONS.EDIT;

  // Split modules into top-level rows and their children (m.parent).
  const groups = useMemo(() => MODULE_GROUPS.map(({ group, modules }) => {
    const top = modules.filter((m) => !m.parent);
    const children = (key) => modules.filter((m) => m.parent === key);
    return { group, top, children };
  }), []);

  const q = query.trim().toLowerCase();
  const matches = (m) => !q || m.label.toLowerCase().includes(q) || m.key.includes(q);

  /** Write a set of changes { key: 'view'|'edit'|null } in one onChange. */
  const apply = (changes) => {
    let next = access.filter((a) => !(a.module in changes));
    Object.entries(changes).forEach(([module, permission]) => { if (permission) next = [...next, { module, permission }]; });
    onChange(next);
  };

  const setModule = (m, kids, permission) => {
    const changes = { [m.key]: permission };
    if (!permission) kids.forEach((k) => { changes[k.key] = null; }); // removing a parent removes its sub-modules
    apply(changes);
  };
  const setChild = (parentKey, k, permission) => {
    const changes = { [k.key]: permission };
    if (permission && !isGranted(parentKey)) changes[parentKey] = PERMISSIONS.VIEW;
    apply(changes);
  };

  const groupState = (top) => {
    const keys = top.filter((m) => !BASELINE_MODULES.includes(m.key)).map((m) => m.key);
    if (!keys.length) return 'none';
    const n = keys.filter(isGranted).length;
    return n === 0 ? 'none' : n === keys.length ? 'all' : 'partial';
  };
  const toggleGroup = (top, children, state) => {
    const changes = {};
    top.filter((m) => !BASELINE_MODULES.includes(m.key)).forEach((m) => {
      if (state === 'all') {
        changes[m.key] = null;
        children(m.key).forEach((k) => { changes[k.key] = null; });
      } else if (!isGranted(m.key)) {
        changes[m.key] = PERMISSIONS.VIEW;
      }
    });
    apply(changes);
  };

  const toggleOpen = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hasExplicit = access.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <label className="block text-xs font-semibold text-violet-700">Module Access</label>
        {hasExplicit && (
          <button type="button" onClick={() => onChange([])}
            className="text-[11px] text-violet-500 hover:text-violet-700 underline underline-offset-2">
            Clear all (use role defaults)
          </button>
        )}
      </div>

      {!hasExplicit && (
        <p className="text-[11px] text-violet-500 mb-2 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
          No modules selected — this employee uses their <span className="font-semibold">role defaults</span>.
          Workspace (Department, Projects) is never included by default; tick it to give access.
        </p>
      )}

      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-violet-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search modules…" aria-label="Search modules"
          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-200" />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-violet-300 hover:text-violet-600" aria-label="Clear search">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="rounded-xl border border-violet-100 divide-y divide-violet-50 max-h-80 overflow-y-auto">
        {groups.map(({ group, top, children }) => {
          const visible = top.filter((m) => matches(m) || children(m.key).some(matches));
          if (!visible.length) return null;
          const state = groupState(top);
          const nonBaseline = top.filter((m) => !BASELINE_MODULES.includes(m.key));
          const grantedCount = nonBaseline.filter((m) => isGranted(m.key)).length;
          const isOpen = open.has(group) || Boolean(q);
          return (
            <div key={group}>
              {/* Group row */}
              <div className="flex items-center gap-2 px-2.5 py-2 bg-violet-50/40">
                <button type="button" onClick={() => toggleOpen(group)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group}`}
                  className="text-violet-400 hover:text-violet-700">
                  <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
                {nonBaseline.length > 0 && <TriCheckbox state={state} label={`All ${group}`} onChange={() => toggleGroup(top, children, state)} />}
                <button type="button" onClick={() => toggleOpen(group)} className="flex-1 text-left text-xs font-bold text-violet-800">{group}</button>
                <span className="text-[10px] text-violet-400">
                  {nonBaseline.length ? `${grantedCount}/${nonBaseline.length}` : 'Always on'}
                </span>
              </div>

              {/* Modules */}
              {isOpen && (
                <div className="py-1">
                  {visible.map((m) => {
                    const kids = children(m.key);
                    const baseline = BASELINE_MODULES.includes(m.key);
                    const granted = isGranted(m.key);
                    const kidsOpen = open.has(m.key) || Boolean(q && kids.some(matches));
                    return (
                      <div key={m.key}>
                        <div className="flex items-center gap-2 pl-8 pr-2.5 py-1.5">
                          {kids.length ? (
                            <button type="button" onClick={() => toggleOpen(m.key)} aria-expanded={kidsOpen} aria-label={`${kidsOpen ? 'Collapse' : 'Expand'} ${m.label}`}
                              className="text-violet-400 hover:text-violet-700 -ml-5">
                              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${kidsOpen ? 'rotate-90' : ''}`} />
                            </button>
                          ) : null}
                          <span className="text-xs text-violet-800 truncate flex-1 min-w-0">{m.label}</span>
                          {baseline ? (
                            <span className="text-[10px] text-violet-400 shrink-0">Always on</span>
                          ) : (
                            <PermBoxes
                              name={m.label}
                              granted={granted}
                              canEdit={isEdit(m.key)}
                              editable={m.editable}
                              onView={(checked) => setModule(m, kids, checked ? PERMISSIONS.VIEW : null)}
                              onEdit={(checked) => setModule(m, kids, checked ? PERMISSIONS.EDIT : PERMISSIONS.VIEW)}
                            />
                          )}
                        </div>

                        {/* Sub-modules (e.g. Project → Module Tree / Tasks & Plans / Bug Sheet / Timeline) */}
                        {kids.length > 0 && kidsOpen && (
                          <div className="ml-10 mr-2 mb-1 border-l-2 border-violet-100 pl-3">
                            <p className="text-[10px] text-violet-400 py-1">
                              Overrides the department role tree on projects this employee is on. Not ticked = role tree decides.
                            </p>
                            {kids.filter((k) => !q || matches(k) || matches(m)).map((k) => (
                              <div key={k.key} className="flex items-center gap-2 py-1">
                                <span className="text-xs text-violet-700 truncate flex-1 min-w-0">{k.label}</span>
                                <PermBoxes
                                  name={`${m.label} · ${k.label}`}
                                  granted={isGranted(k.key)}
                                  canEdit={isEdit(k.key)}
                                  editable={k.editable}
                                  onView={(checked) => setChild(m.key, k, checked ? PERMISSIONS.VIEW : null)}
                                  onEdit={(checked) => setChild(m.key, k, checked ? PERMISSIONS.EDIT : PERMISSIONS.VIEW)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
