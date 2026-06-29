import { useState } from 'react';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import Dashboard from './Dashboard';
import Income from './Income/IncomeList';
import Expenses from './Expenses/ExpenseList';
import Reports from './Reports/ReportsPage';
import GenerateInvoice from './Invoice/GenerateInvoice';

const FinancePage = () => {
  const { user } = useAuth();
  const canAdd     = user?.role === 'hr';
  const canApprove = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState('dashboard');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Finance</h2>
          <p className="page-subtitle">Track income and expenses</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            className="input-field w-auto text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="input-field w-auto text-sm"
          >
            {Array.from({ length: 5 }, (_, i) => {
              const y = new Date().getFullYear() - i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-violet-200 overflow-x-auto">
        {['dashboard', 'income', 'expenses', 'reports', 'invoice'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 -mb-0.5 whitespace-nowrap ${
              activeTab === tab
                ? 'text-violet-700 border-violet-700'
                : 'text-violet-400 border-transparent hover:text-violet-600'
            }`}
          >
            {tab === 'invoice' ? 'Generate Invoice' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <Dashboard month={month} year={year} refresh={refreshTrigger} />}
      {activeTab === 'income' && (
        <Income month={month} year={year} refresh={refreshTrigger} onRefresh={handleRefresh} canAdd={canAdd} />
      )}
      {activeTab === 'expenses' && (
        <Expenses month={month} year={year} refresh={refreshTrigger} onRefresh={handleRefresh} canAdd={canAdd} canApprove={canApprove} />
      )}
      {activeTab === 'reports' && <Reports month={month} year={year} refresh={refreshTrigger} />}
      {activeTab === 'invoice' && <GenerateInvoice />}
    </div>
  );
};

export default FinancePage;
