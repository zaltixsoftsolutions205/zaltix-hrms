import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, FolderKanban } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';
import { canAccessModule, canAccessEdit } from '../../constants/modules';
import Breadcrumb from '../../components/UI/Breadcrumb';
import Department from '../../pages/Admin/AdminDepartments';
import Projects from './Projects';

/* Workspace tabs, filtered by the user's module access. */
const NAV_ITEMS = [
  { key: 'department', label: 'Department', icon: Building2 },
  { key: 'project', label: 'Projects', icon: FolderKanban },
];

const BREADCRUMB = [
  { label: 'Employee Management', path: '/admin/employee-management' },
  { label: 'Workspace' },
];

const Header = () => (
  <div>
    <h2 className="text-xl font-extrabold text-gray-900">Workspace</h2>
    <p className="text-sm text-gray-400 mt-0.5">Manage departments and projects</p>
  </div>
);

const Workspace = () => {
  const { user, loading } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => canAccessModule(user, item.key));
  const [activeTab, setActiveTab] = useState(null);

  // Keep the active tab valid for the user's access (first tab by default).
  useEffect(() => {
    if (loading) return;
    if (!visibleItems.length) { setActiveTab(null); return; }
    if (!visibleItems.some((item) => item.key === activeTab)) setActiveTab(visibleItems[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeTab, visibleItems.length]);

  if (loading || !user) return null;

  if (visibleItems.length === 0) {
    return (
      <div className="space-y-5">
        <Breadcrumb items={BREADCRUMB} />
        <Header />
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">You don't have access to any Workspace modules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Breadcrumb items={BREADCRUMB} />
      <Header />

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
        <div className="flex min-w-max items-center gap-1" role="tablist" aria-label="Workspace">
          {visibleItems.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-violet-50 text-violet-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {isActive && (
                  <motion.span layoutId="workspace-active-tab" className="absolute inset-x-3 -bottom-0.5 h-0.5 bg-violet-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'department' && <Department canEdit={canAccessEdit(user, 'department')} />}
          {activeTab === 'project' && <Projects canEdit={canAccessEdit(user, 'project')} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Workspace;
