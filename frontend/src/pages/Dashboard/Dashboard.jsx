import { useAuth } from '../../contexts/AuthContext';
import EmployeeDashboard from './EmployeeDashboard';
import HRDashboard from './HRDashboard';
import AdminDashboard from './AdminDashboard';

const Dashboard = () => {
  const { user } = useAuth();
  if (user?.role === 'admin') return <AdminDashboard />;
  if (user?.role === 'hr') return <HRDashboard />;
  return <EmployeeDashboard />;
};

export default Dashboard;
