import { useEffect, useState } from 'react';
import { getAssignableUsers } from '../../services/Userservice';

// Shared by the inline row, the Create Lead drawer, and the Lead detail
// drawer so "who can this be assigned to" is fetched/rendered one way.
const AssigneeSelect = ({ value, onChange, placeholder = 'Assign to…' }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getAssignableUsers()
      .then((list) => { if (active) setUsers(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setUsers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <select className="input-field" value={value || ''} onChange={(e) => onChange(e.target.value || null)} disabled={loading}>
      <option value="">{loading ? 'Loading…' : placeholder}</option>
      {users.map((u) => (
        <option key={u._id} value={u._id}>{u.name}</option>
      ))}
    </select>
  );
};

export default AssigneeSelect;