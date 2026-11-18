import { useEffect, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import AnalyticsService from '../../services/AnalyticsService';
import {
  LIST_OPS, NO_VALUE_OPS, conditionComplete, fieldOf, filterFields, opLabel,
} from './builderModel';

export const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 disabled:bg-gray-50';

/** Labels for chosen ids, fetched once per id. */
const labelCache = new Map();

/** Search-as-you-type picker for employees, products, Mandals, departments and leads. */
export function RefPicker({ refKey, value, multi, onChange, placeholder = 'Search…' }) {
  const chosen = multi ? (Array.isArray(value) ? value : []) : (value ? [value] : []);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [labels, setLabels] = useState({});
  const box = useRef(null);

  // Labels of values that were already chosen (editing a saved widget).
  useEffect(() => {
    const missing = chosen.filter((id) => !labelCache.has(`${refKey}:${id}`));
    const known = Object.fromEntries(chosen.filter((id) => labelCache.has(`${refKey}:${id}`)).map((id) => [id, labelCache.get(`${refKey}:${id}`)]));
    setLabels((l) => ({ ...l, ...known }));
    if (!missing.length) return;
    AnalyticsService.options(refKey, { ids: missing }).then((list) => {
      list.forEach((o) => labelCache.set(`${refKey}:${o.value}`, o.label));
      setLabels((l) => ({ ...l, ...Object.fromEntries(list.map((o) => [o.value, o.label])) }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey, chosen.join(',')]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      AnalyticsService.options(refKey, { q }).then((list) => {
        list.forEach((o) => labelCache.set(`${refKey}:${o.value}`, o.label));
        setOptions(list);
      }).catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [refKey, q, open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (o) => {
    setLabels((l) => ({ ...l, [o.value]: o.label }));
    if (multi) onChange(chosen.includes(o.value) ? chosen.filter((v) => v !== o.value) : [...chosen, o.value]);
    else { onChange(o.value); setOpen(false); }
  };

  return (
    <div className="relative" ref={box}>
      <div className={`${inputCls} !p-1 flex flex-wrap items-center gap-1 min-h-[34px] cursor-text`} onClick={() => setOpen(true)} role="presentation">
        {chosen.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-md bg-violet-50 text-violet-800 px-1.5 py-0.5 text-xs max-w-full">
            <span className="truncate">{labels[id] || '…'}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(multi ? chosen.filter((v) => v !== id) : ''); }} className="text-violet-500 hover:text-violet-800" aria-label="Remove"><X size={12} /></button>
          </span>
        ))}
        {(multi || !chosen.length) && (
          <span className="flex items-center gap-1 flex-1 min-w-[90px] px-1">
            <Search size={13} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder} className="w-full text-sm outline-none bg-transparent py-0.5" />
          </span>
        )}
      </div>
      {open && (
        <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
          {options.length === 0 && <li className="px-3 py-2 text-gray-400 text-xs">No matches</li>}
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" onClick={() => pick(o)} className={`!flex w-full !justify-start text-left px-3 py-1.5 hover:bg-violet-50 ${chosen.includes(o.value) ? 'text-violet-700 font-semibold' : 'text-gray-700'}`}>
                {multi && <input type="checkbox" readOnly checked={chosen.includes(o.value)} className="mr-2 accent-violet-600" />}
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The value box of a condition, depending on the field type and operator. */
function ValueInput({ field, op, value, onChange }) {
  if (NO_VALUE_OPS.includes(op)) return null;
  const multi = LIST_OPS.includes(op);
  if (field.type === 'ref') return <RefPicker refKey={field.ref} value={value} multi={multi} onChange={onChange} />;
  if (field.type === 'enum') {
    if (multi) {
      const list = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-1">
          {field.options.map((o) => {
            const on = list.includes(o.value);
            return (
              <button key={o.value} type="button" onClick={() => onChange(on ? list.filter((v) => v !== o.value) : [...list, o.value])}
                className={`rounded-md border px-2 py-1 text-xs ${on ? 'border-violet-400 bg-violet-50 text-violet-800 font-semibold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Choose…</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === 'bool') {
    return (
      <select className={inputCls} value={value === true ? 'yes' : value === false ? 'no' : ''} onChange={(e) => onChange(e.target.value === 'yes')}>
        <option value="" disabled>Choose…</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  if (field.type === 'date') return <input type="date" className={inputCls} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === 'number') return <input type="number" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  if (multi) {
    return (
      <input className={inputCls} placeholder="Values separated by commas" value={Array.isArray(value) ? value.join(', ') : ''}
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
    );
  }
  return <input className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

/** Editable list of { field, op, value } conditions (filters, or a value's "only where"). */
export default function ConditionList({ source, value, onChange, addLabel = 'Add filter', emptyText }) {
  const list = value || [];
  const fields = filterFields(source);
  const set = (i, patch) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const changeField = (i, key) => {
    const f = fieldOf(source, key);
    const op = f?.ops.includes('eq') ? 'eq' : f?.ops[0];
    set(i, { field: key, op, value: f?.type === 'bool' ? true : '' });
  };
  const changeOp = (i, op) => {
    const c = list[i];
    const wasList = LIST_OPS.includes(c.op);
    const isList = LIST_OPS.includes(op);
    let v = c.value;
    if (wasList !== isList) v = isList ? (c.value !== '' && c.value !== undefined && c.value !== null ? [c.value] : []) : (Array.isArray(c.value) ? c.value[0] ?? '' : c.value);
    set(i, { op, value: v });
  };

  return (
    <div className="space-y-2">
      {list.length === 0 && emptyText && <p className="text-xs text-gray-400">{emptyText}</p>}
      {list.map((c, i) => {
        const f = fieldOf(source, c.field);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className={`rounded-lg border p-2 space-y-1.5 ${c.field && !conditionComplete(c) ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-gray-50/50'}`}>
            <div className="flex gap-1.5">
              <select className={`${inputCls} flex-[3]`} value={c.field || ''} onChange={(e) => changeField(i, e.target.value)}>
                <option value="" disabled>Field…</option>
                {fields.map((ff) => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
              </select>
              {f && (
                <select className={`${inputCls} flex-[2]`} value={c.op} onChange={(e) => changeOp(i, e.target.value)}>
                  {f.ops.map((op) => <option key={op} value={op}>{opLabel(op, f.type)}</option>)}
                </select>
              )}
              <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0" aria-label="Remove condition"><X size={16} /></button>
            </div>
            {f && <ValueInput field={f} op={c.op} value={c.value} onChange={(v) => set(i, { value: v })} />}
            {c.field && !conditionComplete(c) && <p className="text-[11px] text-amber-700">Incomplete — not applied yet.</p>}
          </div>
        );
      })}
      {list.length < 10 && (
        <button type="button" onClick={() => onChange([...list, { field: '', op: '', value: '' }])} className="text-xs font-semibold text-violet-700 hover:text-violet-900 gap-1">
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </div>
  );
}
