import { useEffect, useState } from 'react';
import { assigneeLabel, getLeadAssigneeOptions } from '../../services/Userservice';

/**
 * "Assign To" for a lead (table cell, Add Row, drawers): sales employees only
 * (Sales, Inside Sales, Product Executive), shown as "Name (Role · Mandals)".
 * A current assignee who is not in the list (another role) stays selectable,
 * so opening a lead never changes it silently.
 */
const AssigneeSelect = ({ value, onChange, placeholder = 'Assign to…', userLookup }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getLeadAssigneeOptions()
      .then((list) => { if (active) setUsers(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setUsers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const current = value && !users.some((u) => String(u._id) === String(value)) ? (userLookup?.[value] || { _id: value, name: 'Current assignee' }) : null;

  return (
    <select className="input-field w-full" value={value || ''} onChange={(e) => onChange(e.target.value || null)} disabled={loading}>
      <option value="">{loading ? 'Loading…' : placeholder}</option>
      {current && !loading && <option value={current._id}>{current.name} (current, not a sales role)</option>}
      {users.map((u) => (
        <option key={u._id} value={u._id} title={(u.mandals || []).join(', ')}>{assigneeLabel(u)}</option>
      ))}
      {!loading && users.length === 0 && <option value="" disabled>No sales employees available</option>}
    </select>
  );
};

export default AssigneeSelect;
