import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/profile': 'My Profile',
  '/attendance': 'Attendance',
  '/leaves': 'Leave Requests',
  '/payslips': 'Payslips',
  '/tasks': 'My Tasks',
  '/crm': 'CRM — Products',
  '/team': 'My Team',
  '/change-password': 'Change Password',
  '/knowledge-center': 'Knowledge Center',
  '/field-sales/leads': 'My Pipeline',
  '/hr/employees': 'Employee Management',
  '/hr/attendance': 'Attendance Overview',
  '/hr/leaves': 'Leave Approvals',
  '/hr/tasks': 'Work & KPI',
  '/hr/payslips': 'Payroll Management',
  '/hr/knowledge-center': 'Knowledge Center',
  '/admin/employees': 'Employees',
  '/admin/departments': 'Departments',
  '/admin/attendance': 'Attendance Reports',
  '/admin/leaves': 'Leave Management',
  '/admin/tasks': 'Tasks & KPI',
  '/admin/payslips': 'Payroll',
  '/admin/policies': 'Leave Policies',
  '/admin/reports': 'Reports',
  '/admin/crm': 'CRM Analytics',
  '/admin/field-sales': 'Field Sales',
  '/admin/recruitment': 'Recruitment',
  '/admin/knowledge-center': 'Knowledge Center',
  '/admin/my-tasks': 'My Tasks',
  '/admin/finance': 'Finance',
  '/admin/employee-management': 'Employee Management',
  '/admin/holidays': 'Holidays',
  '/admin/announcements': 'Announcements',
};

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'HRMS';

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Toaster position="top-right" toastOptions={{
        style: { background: '#fff', border: '1px solid #DDD6FE', color: '#4C1D95', fontSize: '14px', borderRadius: '12px' },
        success: { iconTheme: { primary: '#D97706', secondary: '#fff' } },
      }} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} pageTitle={title} />
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-violet-50/60 via-white to-white p-3 sm:p-4 lg:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
