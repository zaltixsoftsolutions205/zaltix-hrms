import { inputCls } from './ConditionList';

/**
 * Preset or custom date range. value: { preset } | { from, to } | null.
 * `emptyLabel` adds a "no range" choice (value null), used by the dashboard filter.
 */
export default function DateRangeInput({
  value, onChange, presets, emptyLabel, className = '',
}) {
  const custom = value && !value.preset;
  const selected = !value ? '' : custom ? 'custom' : value.preset;
  return (
    <div className={`space-y-2 ${className}`}>
      <select className={inputCls} value={selected}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : v === 'custom' ? { from: '', to: '' } : { preset: v });
        }}>
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        <option value="custom">Custom dates…</option>
      </select>
      {custom && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className={inputCls} value={value.from || ''} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="From" />
          <input type="date" className={inputCls} value={value.to || ''} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="To" />
        </div>
      )}
    </div>
  );
}
