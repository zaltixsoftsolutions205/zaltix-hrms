import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Card from '../../components/UI/Card';

// Simple magnitude bar chart — one sequential hue (violet), direct-labeled,
// no legend needed since each bar is already labeled with its category name.
const WorkCategoryChart = ({ employeeId }) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/timesheets/analytics/work-category', { params: employeeId ? { employeeId } : {} });
        setData(res.data.sort((a, b) => b.hours - a.hours));
      } catch {}
    };
    fetch();
  }, [employeeId]);

  const max = Math.max(...data.map(d => d.hours), 1);

  return (
    <Card>
      <h3 className="font-bold text-violet-900 text-sm mb-3">Work Category Distribution</h3>
      {data.length === 0 ? (
        <p className="text-sm text-violet-400">No logged work yet this month.</p>
      ) : (
        <div className="space-y-2">
          {data.map(d => (
            <div key={d.category} className="flex items-center gap-2">
              <span className="text-xs text-violet-700 w-28 flex-shrink-0 truncate">{d.category}</span>
              <div className="flex-1 h-4 bg-violet-50 rounded-full overflow-hidden">
                <div className="h-full bg-violet-600 rounded-full" style={{ width: `${(d.hours / max) * 100}%` }} />
              </div>
              <span className="text-xs text-violet-500 w-12 text-right flex-shrink-0">{d.hours}h</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default WorkCategoryChart;
