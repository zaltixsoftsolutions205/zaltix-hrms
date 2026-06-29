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
 *  - Each non-baseline module has an access checkbox; editable modules also
 *    expose a View / Edit permission toggle (only when access is on).
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
                return (
                  <div key={m.key}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 border border-violet-100 bg-white">
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        className="accent-violet-600 flex-shrink-0"
                        checked={baseline || granted}
                        disabled={baseline}
                        onChange={e => setGrant(m.key, e.target.checked, permOf(m.key))}
                      />
                      <span className="text-xs text-violet-800 truncate">{m.label}</span>
                    </label>

                    {baseline ? (
                      <span className="text-[10px] text-violet-400 flex-shrink-0">Always on</span>
                    ) : granted && m.editable ? (
                      <div className="flex rounded-lg overflow-hidden border border-violet-200 flex-shrink-0">
                        {[PERMISSIONS.VIEW, PERMISSIONS.EDIT].map(p => (
                          <button key={p} type="button"
                            onClick={() => setGrant(m.key, true, p)}
                            className={`text-[10px] px-2 py-0.5 font-semibold capitalize transition-colors ${
                              permOf(m.key) === p ? 'bg-violet-600 text-white' : 'bg-white text-violet-500 hover:bg-violet-50'
                            }`}>
                            {p}
                          </button>
                        ))}
                      </div>
                    ) : granted ? (
                      <span className="text-[10px] text-violet-400 flex-shrink-0">View</span>
                    ) : null}
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
