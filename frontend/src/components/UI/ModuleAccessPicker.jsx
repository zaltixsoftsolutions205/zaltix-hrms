import { MODULE_GROUPS, BASELINE_MODULES, PERMISSIONS } from '../../constants/modules';

/**
 * ModuleAccessPicker — lets an admin/HR grant per-employee module access.
 *
 * value:    array of { module, permission } (the employee's moduleAccess)
 * onChange: (next array) => void
 *
 * Behavior:
 *  - Self-service baseline modules are shown as "Always on" and are not
 *    toggleable (every employee keeps their own attendance/leaves/etc).
 *  - Editable modules expose two independent checkboxes: View and Edit.
 *      · View only            → read-only access   ({ permission: 'view' })
 *      · Edit (alone or +View) → full access        ({ permission: 'edit' })
 *    Edit implies View (you can't edit a page you can't load), so ticking
 *    Edit reads as full access. Storage still holds one permission per module.
 *  - Read-only modules keep a single access checkbox.
 *  - An empty value means "use role defaults" — surfaced as a hint.
 */
export default function ModuleAccessPicker({ value = [], onChange }) {
  const access = Array.isArray(value) ? value : [];
  const byKey = access.reduce((acc, a) => { acc[a.module] = a.permission; return acc; }, {});

  const isGranted = key => key in byKey;
  const permOf = key => byKey[key] || PERMISSIONS.VIEW;

  const setGrant = (key, granted, permission = PERMISSIONS.VIEW) => {
    let next = access.filter(a => a.module !== key);
    if (granted) next = [...next, { module: key, permission }];
    onChange(next);
  };

  const hasExplicit = access.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
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
          Tick a module below to switch to explicit per-employee access (self-service stays on automatically).
        </p>
      )}

      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {MODULE_GROUPS.map(({ group, modules }) => (
          <div key={group}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400 mb-1">{group}</p>
            <div className="space-y-1">
              {modules.map(m => {
                const baseline = BASELINE_MODULES.includes(m.key);
                const granted = isGranted(m.key);
                const canEdit = granted && permOf(m.key) === PERMISSIONS.EDIT;

                // View checkbox: represents "has access at all". Turning it off
                // ungrants the module entirely (edit implies view, so there's no
                // edit-without-view state). Turning it on grants view.
                const onViewToggle = (checked) =>
                  checked ? setGrant(m.key, true, PERMISSIONS.VIEW) : setGrant(m.key, false);

                // Edit checkbox: upgrades to edit (implies view) or drops back to
                // view-only. Ticking Edit on an ungranted module grants full access.
                const onEditToggle = (checked) =>
                  setGrant(m.key, true, checked ? PERMISSIONS.EDIT : PERMISSIONS.VIEW);

                return (
                  <div key={m.key}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 border border-violet-100 bg-white">
                    <span className="text-xs text-violet-800 truncate flex-1 min-w-0">{m.label}</span>

                    {baseline ? (
                      <span className="text-[10px] text-violet-400 flex-shrink-0">Always on</span>
                    ) : m.editable ? (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-violet-600"
                            checked={granted}
                            onChange={e => onViewToggle(e.target.checked)}
                          />
                          <span className="text-[10px] font-semibold text-violet-600">View</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-violet-600"
                            checked={canEdit}
                            onChange={e => onEditToggle(e.target.checked)}
                          />
                          <span className="text-[10px] font-semibold text-violet-600">Edit</span>
                        </label>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          className="accent-violet-600"
                          checked={granted}
                          onChange={e => setGrant(m.key, e.target.checked, PERMISSIONS.VIEW)}
                        />
                        <span className="text-[10px] font-semibold text-violet-600">View</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
