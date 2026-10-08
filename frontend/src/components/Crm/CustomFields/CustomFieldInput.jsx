import { useEffect, useState } from 'react';
import { getAssignableUsers } from '../../../services/Userservice';

/**
 * Single dynamic input, switched on field.type. Deliberately consolidated
 * into one file rather than one component per type (TextField.jsx,
 * NumberField.jsx, ...) per the project's own "don't create unnecessary
 * files" guidance — each branch is a couple of lines and shares no local
 * state with the others, so splitting them would add indirection without
 * adding reuse. Split it out again if any one type grows real complexity.
 */
const CustomFieldInput = ({ field, value, onChange, autoFocus }) => {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (field.type !== 'person') return undefined;
    let active = true;
    setUsersLoading(true);
    getAssignableUsers({ entity: field.entity })
      .then((list) => { if (active) setUsers(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setUsers([]); })
      .finally(() => { if (active) setUsersLoading(false); });
    return () => { active = false; };
  }, [field.type, field.entity]);

  const base = 'input-field';

  switch (field.type) {
    case 'text':
    case 'email':
    case 'url':
      return (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          className={base}
          autoFocus={autoFocus}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.name}
        />
      );
    case 'phone':
      return (
        <input
          type="tel"
          className={base}
          autoFocus={autoFocus}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.name}
        />
      );
    case 'number':
    case 'currency':
      return (
        <input
          type="number"
          className={base}
          autoFocus={autoFocus}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder={field.type === 'currency' ? '₹0' : '0'}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className={base}
          value={value ? String(value).slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          className={base}
          value={value ? String(value).slice(0, 16) : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
          />
          <span className="text-sm text-gray-600">{value ? 'Yes' : 'No'}</span>
        </label>
      );
    case 'single-select':
      return (
        <select className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Select…</option>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    case 'multi-select': {
      const selected = Array.isArray(value) ? value : [];
      const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options || []).map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className={active ? 'filter-pill-active' : 'filter-pill-inactive'}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }
    case 'person':
      return (
        <select className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={usersLoading}>
          <option value="">{usersLoading ? 'Loading…' : 'Select person…'}</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>{u.name}</option>
          ))}
        </select>
      );
    case 'reference':
      return (
        <input
          className={base}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Reference ID"
        />
      );
    default:
      return <p className="text-xs text-gray-400">Unsupported field type: {field.type}</p>;
  }
};

export default CustomFieldInput;