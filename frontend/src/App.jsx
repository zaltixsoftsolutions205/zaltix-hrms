import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Component } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { PageLoader } from './components/UI/Spinner';
import { canAccessView, canAccessEdit } from './constants/modules';
import Layout from './components/Layout/Layout';
import PWAInstallBanner from './components/PWAInstallBanner';
import ChatWidget from './components/Chat/ChatWidget';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff1f2', minHeight: '100vh' }}>
          <h2 style={{ color: '#dc2626' }}>React Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#7f1d1d', fontSize: 13 }}>{this.state.error?.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#991b1b', fontSize: 11, marginTop: 8 }}>{this.state.error?.stack}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard'; }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Back to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Pages
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard/Dashboard';
import EmployeeProfile from './pages/Profile/EmployeeProfile';
import AttendancePage from './pages/Attendance/AttendancePage';
import LeavePage from './pages/Leaves/LeavePage';
import TimesheetPage from './pages/Timesheets/TimesheetPage';
import PayslipsPage from './pages/Payslips/PayslipsPage';
import Workspace from './pages/Workspace/Workspace';
import CRMPage from './pages/CRM/CRMPage';
import ProductDetailPage from './pages/CRM/ProductDetailPage';
import QueryManagement from './pages/Sales/QueryManagement';
import TeamPage from './pages/Team/TeamPage';

// HR Pages
import HREmployees from './pages/HR/HREmployees';
import HREmployeeInfo from "./pages/HR/HREmployeeInfo";
import HRAttendance from './pages/HR/HRAttendance';
import HRLeaves from './pages/HR/HRLeaves';
import HRTasks from './pages/HR/HRTasks';
import HRPayslips from './pages/HR/HRPayslips';

// Admin Pages
import AdminEmployees from './pages/Admin/AdminEmployees';
import AdminDepartments from './pages/Admin/AdminDepartments';
import AdminAttendance from './pages/Admin/AdminAttendance';
import AdminLeaves from './pages/Admin/AdminLeaves';
import AdminTasks from './pages/Admin/AdminTasks';
import AdminPayslips from './pages/Admin/AdminPayslips';
import AdminPolicies from './pages/Admin/AdminPolicies';
import AdminReports from './pages/Admin/AdminReports';
import AdminCRM from './pages/Admin/AdminCRM';
import FinancePage from './pages/Admin/Finance/FinancePage';
import AnnouncementsPage from './pages/Admin/AnnouncementsPage';
import HolidaysPage from './pages/Admin/HolidaysPage';
import ProjectsAdmin from './pages/Admin/ProjectsAdmin';
import AdminMyTasks from './pages/Admin/AdminMyTasks';
import RecruitmentPage from './pages/Admin/RecruitmentPage';
import RecruitmentProjectPage from './pages/Admin/RecruitmentProjectPage';
import RecruitmentJobPage from './pages/Admin/RecruitmentJobPage';
import AutomationPage from './pages/Admin/AutomationPage';
import AdminEmployeeHub from './pages/Admin/AdminEmployeeHub';
import FieldLeadsPage from './pages/FieldSales/FieldLeadsPage';
import ExpenseClaimsPage from './pages/FieldSales/ExpenseClaimsPage';
import ExpenseClaimsReview from './pages/Admin/ExpenseClaimsReview';
import AdminFieldSales from './pages/Admin/AdminFieldSales';
import AdminKnowledgeCenter from './pages/Admin/KnowledgeCenter';
import HRKnowledgeCenter from './pages/HR/HRKnowledgeCenter';
import KnowledgeCenter from './pages/KnowledgeCenter/KnowledgeCenter';
import Projects from './pages/Workspace/Projects';
import ProjectDetails from './pages/Workspace/Project/Project';
// Department Details Page
import DepartmentDetails from "./pages/Department/DepartmentDetails";

// sale and crm pages 
import Lead from './pages/CRM/lead';
import Visits from './pages/CRM/visits';
import Feedback from './pages/CRM/feedback';
import Registration from './pages/CRM/Registration';
import DataUpdation from './pages/CRM/DataUpdation';
import Demos from './pages/CRM/domos';


const ProtectedRoute = ({ children, roles, allowEmployeeIds, module, requireEdit = false, allowFirstLogin = false }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.isFirstLogin && !allowFirstLogin) return <Navigate to="/change-password" replace />;

  // Module-based gating (primary). Admin always passes via canAccessModule.
  if (module) {
    const ok = requireEdit ? canAccessEdit(user, module) : canAccessView(user, module);
    if (!ok) return <Navigate to="/dashboard" replace />;
    return children;
  }

  // Legacy role/employee-id gating (for routes not yet mapped to a module).
  const hasRole = roles && roles.includes(user.role);
  const hasEmployeeId = allowEmployeeIds && allowEmployeeIds.includes(user.employeeId);
  if (roles && !hasRole && !hasEmployeeId) return <Navigate to="/dashboard" replace />;
  return children;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;

  return (
    <Routes>
      <Route path="/login" element={user && !user.isFirstLogin ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/change-password" element={
        <ProtectedRoute allowFirstLogin>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<ChangePassword />} />
      </Route>

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<EmployeeProfile />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/leaves" element={<LeavePage />} />
        <Route path="/timesheets" element={<TimesheetPage />} />
        <Route path="/admin/projects" element={<ProtectedRoute module="timesheets"><ProjectsAdmin /></ProtectedRoute>} />
        <Route path="/payslips" element={<PayslipsPage />} />
        <Route path="/admin/employee-management/workspace" element={<Workspace />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/knowledge-center" element={<KnowledgeCenter />} />
        <Route path="/crm" element={<ProtectedRoute module="crm"><CRMPage/></ProtectedRoute>} />
        <Route path="/field-sales/leads" element={<ProtectedRoute module="field_sales"><FieldLeadsPage /></ProtectedRoute>} />
        {/* Expense claims: only field-sales editors may submit. */}
        <Route path="/field-sales/expense-claims" element={<ProtectedRoute module="field_sales" requireEdit><ExpenseClaimsPage /></ProtectedRoute>} />
        <Route path="/expense-claims" element={<ProtectedRoute module="field_sales" requireEdit><ExpenseClaimsPage /></ProtectedRoute>} />
        <Route path="/crm/products/:productId" element={<ProtectedRoute module="crm"><ProductDetailPage /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute roles={['admin', 'manager', 'team-lead', 'hr']}><ProjectDetails /></ProtectedRoute>} />
        <Route path="/queries" element={<ProtectedRoute module="query_management"><QueryManagement /></ProtectedRoute>} />

        {/* HR Routes */}
        <Route path="/hr/employees" element={<ProtectedRoute module="hr_employees"><HREmployees /></ProtectedRoute>} />
        <Route path="/hr/employees/:employeeId" element={<ProtectedRoute module="hr_employees"><HREmployeeInfo /></ProtectedRoute>} />
        <Route path="/hr/attendance" element={<ProtectedRoute module="hr_attendance"><HRAttendance /></ProtectedRoute>} />
        <Route path="/hr/leaves" element={<ProtectedRoute module="hr_leaves"><HRLeaves /></ProtectedRoute>} />
        <Route path="/hr/tasks" element={<ProtectedRoute module="hr_tasks"><HRTasks /></ProtectedRoute>} />
        <Route path="/hr/payslips" element={<ProtectedRoute module="hr_payslips"><HRPayslips /></ProtectedRoute>} />
        <Route path="/hr/knowledge-center" element={<ProtectedRoute module="knowledge_center"><HRKnowledgeCenter /></ProtectedRoute>} />

        {/* HMS Routes */}
        <Route path="/workspace/department" element={<ProtectedRoute module="department"><AdminDepartments /> </ProtectedRoute>} />
        <Route path="/workspace/project" element={<ProtectedRoute module="project"><Projects /></ProtectedRoute>} />


        {/* sale and crm routes */}
        <Route path="/sale/lead" element={<ProtectedRoute module="lead" roles={['admin', 'manager', 'inside-sales', 'hr', 'product-executive', 'sales']}><Lead /></ProtectedRoute>} />
        <Route path="/sale/visit" element={<ProtectedRoute module="visits" roles={['admin', 'manager', 'inside-sales', 'hr', 'product-executive', 'sales']}><Visits /></ProtectedRoute>} />
        <Route path="/sale/feedback" element={<ProtectedRoute module="feedback" roles={['admin', 'manager', 'inside-sales', 'hr', 'product-executive', 'sales']}><Feedback /></ProtectedRoute>} />
        <Route path="/sale/registration" element={<ProtectedRoute module="registration" roles={['admin', 'manager', 'inside-sales', 'hr', 'product-executive', 'sales']}><Registration /></ProtectedRoute>} />
        <Route path="/sale/dataupdation" element={<ProtectedRoute module="data_updation" roles={['admin', 'manager', 'inside-sales', 'hr', 'product-executive', 'sales']}><DataUpdation /></ProtectedRoute>} />
        <Route path="/sale/demos" element={<ProtectedRoute module="demos" roles={['admin', 'manager', 'inside-sales', 'hr', 'product-executive', 'sales']}><Demos /></ProtectedRoute>} />

        {/* Admin Routes */}
        <Route path="/admin/employee-management/employees" element={<ProtectedRoute roles={['admin']}><AdminEmployees /></ProtectedRoute>} />
        <Route path="/admin/employee-management/departments" element={<ProtectedRoute roles={['admin']}><AdminDepartments /></ProtectedRoute>} />
        <Route path="/admin/employee-management/attendance" element={<ProtectedRoute roles={['admin']}><AdminAttendance /></ProtectedRoute>} />
        <Route path="/admin/employee-management/leaves" element={<ProtectedRoute roles={['admin']}><AdminLeaves /></ProtectedRoute>} />
        <Route path="/admin/tasks" element={<ProtectedRoute roles={['admin']}><AdminTasks /></ProtectedRoute>} />
        <Route path="/admin/payslips" element={<ProtectedRoute roles={['admin']}><AdminPayslips /></ProtectedRoute>} />
        <Route path="/admin/employee-management/leave-policies" element={<ProtectedRoute roles={['admin']}><AdminPolicies /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute module="reports"><AdminReports /></ProtectedRoute>} />
        <Route path="/admin/crm" element={<ProtectedRoute roles={['admin']}><AdminCRM /></ProtectedRoute>} />
        <Route path="/admin/field-sales" element={<ProtectedRoute roles={['admin']}><AdminFieldSales /></ProtectedRoute>} />
        <Route path="/admin/expense-claims" element={<ProtectedRoute roles={['admin', 'hr']}><ExpenseClaimsReview /></ProtectedRoute>} />
        <Route path="/admin/finance" element={<ProtectedRoute module="finance"><FinancePage /></ProtectedRoute>} />
        <Route path="/finance" element={<ProtectedRoute module="finance"><FinancePage /></ProtectedRoute>} />
        <Route path="/admin/employee-management/announcements" element={<ProtectedRoute module="announcements"><AnnouncementsPage /></ProtectedRoute>} />
        <Route path="/admin/employee-management/holidays" element={<ProtectedRoute module="holidays"><HolidaysPage /></ProtectedRoute>} />
        <Route path="/admin/my-tasks" element={<ProtectedRoute roles={['admin']}><AdminMyTasks /></ProtectedRoute>} />
        <Route path="/admin/recruitment" element={<ProtectedRoute module="recruitment"><RecruitmentPage /></ProtectedRoute>} />
        <Route path="/admin/recruitment/p/:projectId" element={<ProtectedRoute module="recruitment"><RecruitmentProjectPage /></ProtectedRoute>} />
        <Route path="/admin/recruitment/:jobId" element={<ProtectedRoute module="recruitment"><RecruitmentJobPage /></ProtectedRoute>} />
        <Route path="/admin/automation" element={<ProtectedRoute roles={['admin', 'hr']}><AutomationPage /></ProtectedRoute>} />
        <Route path="/admin/employee-management" element={<ProtectedRoute roles={['admin']}><AdminEmployeeHub /></ProtectedRoute>} />
        <Route path="/admin/knowledge-center" element={<ProtectedRoute roles={['admin']}><AdminKnowledgeCenter /></ProtectedRoute>} />
        <Route path="/admin/departments/:id" element={<ProtectedRoute roles={['admin', 'manager', 'team-lead', 'hr']}><DepartmentDetails /></ProtectedRoute>} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <AuthProvider>
        <ChatProvider>
          <AppRoutes />
          <ChatWidget />
          <PWAInstallBanner />
        </ChatProvider>
      </AuthProvider>
    </ErrorBoundary>
  </BrowserRouter>
);

export default App;
