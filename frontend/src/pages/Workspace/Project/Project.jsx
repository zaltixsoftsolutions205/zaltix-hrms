import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'react-router-dom';
import Breadcrumb from '../../../components/UI/Breadcrumb';
import ProjectInformation from './ProjectInformation';
import TeamMembers from './TeamMembers';

const NAV_ITEMS = [
  {
    key: 'overview',
    label: 'Overview',
  },
  {
    key: 'team-members',
    label: 'Team Members',
  },
];

const ProjectDetails = () => {
  const [activeTab, setActiveTab] = useState('overview');

  // Get :id from /projects/:id
  const { id: projectId } = useParams();

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <ProjectInformation
            projectId={projectId}
          />
        );

      case 'team-members':
        return (
          <TeamMembers
            projectId={projectId}
          />
        );

      default:
        return (
          <ProjectInformation
            projectId={projectId}
          />
        );
    }
  };

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          {
            label: 'Employee Management',
            path: '/admin/employee-management',
          },
          {
            label: 'Workspace',
            path: '/admin/employee-management/workspace',
          },
          {
            label:projectId,
          },
        ]}
      />
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
          Project Details
        </h2>

        <p className="text-sm text-gray-400 mt-0.5">
          View project information, analysis and team performance
        </p>
      </div>

      {/* Navigation */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-1.5 overflow-x-auto">

        <div className="flex items-center gap-1 min-w-max">

          {NAV_ITEMS.map((item) => {

            const isActive = activeTab === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`
                  relative px-5 py-2.5
                  rounded-xl
                  text-sm font-semibold
                  transition-all duration-200
                  whitespace-nowrap

                  ${isActive
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                {item.label}

                {isActive && (
                  <motion.div
                    layoutId="project-details-active-tab"
                    className="absolute inset-x-3 -bottom-0.5 h-0.5 bg-violet-600 rounded-full"
                  />
                )}
              </button>
            );
          })}

        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {renderContent()}
        </motion.div>

      </AnimatePresence>

    </div>
  );
};

export default ProjectDetails;