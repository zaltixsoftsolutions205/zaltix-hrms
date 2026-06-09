import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  LayoutDashboard, FileText, CreditCard, TrendingUp, Shield, BookOpen,
  Wallet, ClipboardList, Users, DollarSign, BarChart3, Settings,
  Zap, IndianRupee, ChevronDown,
} from 'lucide-react';

import { FinDashboard }    from './tabs/FinDashboard';
import { FinInvoices }     from './tabs/FinInvoices';
import { FinPayments }     from './tabs/FinPayments';
import { FinReceivables }  from './tabs/FinReceivables';
import { FinVendors }      from './tabs/FinVendors';
import { FinSalary }       from './tabs/FinSalary';
import { FinCashFlow }     from './tabs/FinCashFlow';
import { FinReports }      from './tabs/FinReports';
import { FinIntelligence } from './tabs/FinIntelligence';
import { FinLedger }       from './tabs/FinLedger';
import { FinCompliance }   from './tabs/FinCompliance';
import { FinAuditLog }     from './tabs/FinAuditLog';
import { FinSettings }     from './tabs/FinSettings';
import IncomeList      from './Income/IncomeList';
import ExpenseList     from './Expenses/ExpenseList';
import GenerateInvoice from './Invoice/GenerateInvoice';

/* ─── nav config ─── */
const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Revenue',
    items: [
      { id: 'invoices',    label: 'Invoices',    icon: FileText },
      { id: 'payments',    label: 'Payments',    icon: CreditCard },
      { id: 'receivables', label: 'Receivables', icon: TrendingUp },
      { id: 'income',      label: 'Income',      icon: IndianRupee },
    ],
  },
  {
    label: 'Expenses',
    items: [
      { id: 'expenses', label: 'Expenses', icon: Wallet },
      { id: 'vendors',  label: 'Vendors',  icon: Users },
      { id: 'salary',   label: 'Salary',   icon: DollarSign },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { id: 'reports',      label: 'Reports',      icon: BarChart3 },
      { id: 'intelligence', label: 'Intelligence', icon: Zap },
      { id: 'ledger',       label: 'Ledger',       icon: BookOpen },
      { id: 'cashflow',     label: 'Cash Flow',    icon: Wallet },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { id: 'compliance', label: 'Compliance', icon: Shield },
      { id: 'audit',      label: 'Audit Log',  icon: ClipboardList },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'quotation', label: 'Generate Quotation', icon: FileText },
      { id: 'settings',  label: 'Settings',           icon: Settings },
    ],
  },
];

const PAGE_TITLES = {
  dashboard: 'Financial Dashboard', invoices: 'Invoices', payments: 'Payments',
  receivables: 'Receivables', income: 'Income', expenses: 'Expenses',
  vendors: 'Vendors', salary: 'Salary Register', reports: 'Financial Reports',
  intelligence: 'Financial Intelligence', ledger: 'General Ledger',
  cashflow: 'Cash Flow', compliance: 'Compliance & Tax',
  audit: 'Audit Log', quotation: 'Generate Quotation', settings: 'Finance Settings',
};

/* ─── Sidebar ─── */
function FinSidebar({ activeTab, onTabChange }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (label) => setCollapsed(p => ({ ...p, [label]: !p[label] }));

  return (
    <aside className="fin-sidebar">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="fin-sidebar-section">
          <button className="fin-sidebar-section-label" onClick={() => toggle(section.label)}>
            {section.label}
            <ChevronDown size={11} style={{ transform: collapsed[section.label] ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
          </button>
          {!collapsed[section.label] && section.items.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`fin-nav-item${active ? ' active' : ''}`}
              >
                <item.icon size={15} style={{ flexShrink: 0 }} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

/* ─── Month/Year filter bar ─── */
function FinFilterBar({ month, year, onMonthChange, onYearChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select value={month} onChange={e => onMonthChange(+e.target.value)} className="fin-select">
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
        ))}
      </select>
      <select value={year} onChange={e => onYearChange(+e.target.value)} className="fin-select">
        {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
      </select>
    </div>
  );
}

/* ─── Main page ─── */
const FinancePage = () => {
  const { user } = useAuth();
  const canAdd     = user?.role === 'hr';
  const canApprove = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('dashboard');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear]   = useState(new Date().getFullYear());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const handleRefresh = () => setRefreshTrigger(p => p + 1);

  const handleTabChange = (tab) => {
    if (tab === 'dashboard') setRefreshTrigger(p => p + 1);
    setActiveTab(tab);
  };

  const filterTabs  = ['income', 'expenses', 'dashboard'];
  const showFilters = filterTabs.includes(activeTab);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':    return <FinDashboard month={month} year={year} refresh={refreshTrigger} />;
      case 'invoices':     return <FinInvoices />;
      case 'payments':     return <FinPayments />;
      case 'receivables':  return <FinReceivables />;
      case 'income':       return <IncomeList month={month} year={year} refresh={refreshTrigger} onRefresh={handleRefresh} canAdd={canAdd} />;
      case 'expenses':     return <ExpenseList month={month} year={year} refresh={refreshTrigger} onRefresh={handleRefresh} canAdd={canAdd} canApprove={canApprove} />;
      case 'vendors':      return <FinVendors />;
      case 'salary':       return <FinSalary />;
      case 'reports':      return <FinReports />;
      case 'intelligence': return <FinIntelligence />;
      case 'ledger':       return <FinLedger />;
      case 'cashflow':     return <FinCashFlow />;
      case 'compliance':   return <FinCompliance />;
      case 'audit':        return <FinAuditLog />;
      case 'quotation':    return <GenerateInvoice />;
      case 'settings':     return <FinSettings />;
      default:             return <FinDashboard month={month} year={year} refresh={refreshTrigger} />;
    }
  };

  return (
    <div className="fin-page -m-3 sm:-m-4 lg:-m-5">
      {/* Page header */}
      <div className="fin-topbar">
        <div>
          <h1 className="page-title">{PAGE_TITLES[activeTab] || 'Finance'}</h1>
          <p className="page-subtitle">Finance &amp; Accounting Module</p>
        </div>
        {showFilters && (
          <FinFilterBar month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
        )}
      </div>

      {/* Body: sidebar + content */}
      <div className="fin-body">
        <FinSidebar activeTab={activeTab} onTabChange={handleTabChange} />
        <main className="fin-main">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default FinancePage;
