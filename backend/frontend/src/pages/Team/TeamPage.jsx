import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import { getInitials } from '../../utils/helpers';

const TeamPage = () => {
  const [team, setTeam] = useState([]);
  const [deptName, setDeptName] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/employees/team')
      .then(r => { setTeam(r.data.team || []); setDeptName(r.data.deptName || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">My Team</h2>
          <p className="page-subtitle">
            {deptName ? `${deptName} Department` : 'Your department colleagues'}
            {team.length > 0 && ` · ${team.length} member${team.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="py-12 text-center text-violet-400 text-sm">Loading team...</div>
        ) : !deptName ? (
          <div className="py-12 text-center">
            <p className="text-violet-400 text-sm">No department assigned to your profile.</p>
            <p className="text-violet-300 text-xs mt-1">Ask HR to assign your department to see your team.</p>
          </div>
        ) : team.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-violet-400 text-sm">No other members in {deptName} yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {team.map(member => (
              <div key={member._id}
                className="flex items-center gap-3 p-4 rounded-xl border border-violet-100 bg-violet-50/50 hover:bg-violet-100/60 transition-colors">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow">
                  {getInitials(member.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-violet-900 truncate">{member.name}</p>
                  <p className="text-xs text-violet-500 truncate capitalize">{member.designation || member.role}</p>
                  <p className="text-[11px] text-violet-400 mt-0.5">{member.employeeId}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TeamPage;
