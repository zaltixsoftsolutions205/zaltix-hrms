import { useSearchParams } from 'react-router-dom';
import { ChartNoAxesCombined, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessView } from '../../constants/modules';
import EmployeeDashboard from './EmployeeDashboard';
import HRDashboard from './HRDashboard';
import AdminDashboard from './AdminDashboard';
import AnalyticsPanel from '../Analytics/AnalyticsPanel';

/** "Dashboard | Analytics" tabs at the top of the Admin, HR and manager dashboards (?tab=analytics). */
function DashboardTabs({ tab, onChange, maxWidth }) {
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  ];
  return (
    <div className={`${maxWidth} mx-auto px-3 sm:px-4 pt-1 pb-3`}>
      <div role="tablist" aria-label="Dashboard views" className="inline-flex rounded-xl border border-violet-100 bg-white p-1 shadow-sm">
        {tabs.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          return (
            <button key={key} type="button" role="tab" aria-selected={on} onClick={() => onChange(key)}
              className={`gap-1.5 rounded-lg px-3 sm:px-4 py-1.5 text-sm font-semibold transition-colors ${on ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'}`}>
              <Icon size={16} /> {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const Dashboard = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isManager = user?.role === 'manager';
  if (!isAdmin && !isHR && !isManager) return <EmployeeDashboard />;

  // Managers keep their usual dashboard; Analytics shows their department's data.
  const Home = isAdmin ? AdminDashboard : isHR ? HRDashboard : EmployeeDashboard;
  const maxWidth = isAdmin ? 'max-w-[1400px] xl:px-6' : 'max-w-7xl';
  if (!canAccessView(user, 'analytics')) return <Home />;

  const tab = params.get('tab') === 'analytics' ? 'analytics' : 'dashboard';
  const change = (key) => setParams(key === 'analytics' ? { tab: 'analytics' } : {}, { replace: true });

  return (
    <>
      <DashboardTabs tab={tab} onChange={change} maxWidth={maxWidth} />
      {tab === 'analytics' ? (
        <div className={`${maxWidth} mx-auto px-3 sm:px-4 pb-6 animate-fade-in`}>
          <AnalyticsPanel />
        </div>
      ) : <Home />}
    </>
  );
};

export default Dashboard;
