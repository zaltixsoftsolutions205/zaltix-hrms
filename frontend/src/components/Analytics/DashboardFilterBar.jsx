import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FilterX } from 'lucide-react';
import { RefPicker, inputCls } from './ConditionList';
import DateRangeInput from './DateRangeInput';

/**
 * Dashboard filters -> what /widgets/:id/run accepts. A half-filled custom date
 * range and empty lists are left out.
 *   dateRange  replaces each widget's own date range
 *   the rest   are added to each widget's own filters (all must match)
 */
export function cleanDashboardFilters(f = {}) {
  const out = {};
  const r = f.dateRange;
  if (r?.preset && r.preset !== 'all') out.dateRange = { preset: r.preset };
  else if (r?.from && r?.to) out.dateRange = { from: r.from, to: r.to };
  ['employee', 'department', 'product', 'status'].forEach((k) => {
    if (Array.isArray(f[k]) && f[k].length) out[k] = f[k];
  });
  return out;
}

export const activeFilterCount = (f) => Object.keys(cleanDashboardFilters(f)).length;

function StageSelect({ stages, value, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const list = value || [];
  const text = list.length === 0 ? 'Any stage' : list.length === 1 ? stages.find((s) => s.value === list[0])?.label : `${list.length} stages`;
  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${inputCls} !flex !justify-between gap-2 text-left`}>
        <span className={`truncate ${list.length ? 'text-gray-800' : 'text-gray-400'}`}>{text}</span>
        <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <ul className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm max-h-64 overflow-y-auto">
          {stages.map((s) => {
            const on = list.includes(s.value);
            return (
              <li key={s.value}>
                <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-violet-50 cursor-pointer">
                  <input type="checkbox" className="accent-violet-600" checked={on} onChange={() => onChange(on ? list.filter((v) => v !== s.value) : [...list, s.value])} />
                  <span className="text-gray-700">{s.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const Field = ({ label, children }) => (
  <div className="min-w-0">
    <span className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</span>
    {children}
  </div>
);

/** Filter bar shown above a dashboard's widgets. */
export default function DashboardFilterBar({ catalog, value, onChange }) {
  const f = value || {};
  const set = (k, v) => onChange({ ...f, [k]: v });
  const count = activeFilterCount(f);
  return (
    <div className="glass-card p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
        <Field label="Dates (replaces each widget's range)">
          <DateRangeInput value={f.dateRange || null} onChange={(v) => set('dateRange', v)} presets={catalog.datePresets.filter((p) => p.key !== 'all')} emptyLabel="Each widget's own dates" />
        </Field>
        <Field label="Employees">
          <RefPicker refKey="user" multi value={f.employee || []} onChange={(v) => set('employee', v)} placeholder="All employees" />
        </Field>
        <Field label="Departments">
          <RefPicker refKey="department" multi value={f.department || []} onChange={(v) => set('department', v)} placeholder="All departments" />
        </Field>
        <Field label="Products">
          <RefPicker refKey="product" multi value={f.product || []} onChange={(v) => set('product', v)} placeholder="All products" />
        </Field>
        <Field label="Lead stage">
          <StageSelect stages={catalog.stages || []} value={f.status} onChange={(v) => set('status', v)} />
        </Field>
      </div>
      {count > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>{count} filter{count > 1 ? 's' : ''} applied to every widget</span>
          <button type="button" onClick={() => onChange({})} className="gap-1 font-semibold text-violet-700 hover:text-violet-900"><FilterX size={14} /> Clear filters</button>
        </div>
      )}
    </div>
  );
}
