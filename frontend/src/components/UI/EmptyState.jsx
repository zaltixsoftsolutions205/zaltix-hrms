import { motion } from 'framer-motion';

const EmptyState = ({ icon = '📭', title = 'No data yet', message = 'Nothing to display here.', action }) => (
  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="text-5xl mb-4 opacity-60">{icon}</div>
    <h3 className="text-lg font-semibold text-violet-800 mb-1">{title}</h3>
    <p className="text-sm text-violet-400 mb-5 max-w-xs">{message}</p>
    {action && (
      <button onClick={action.onClick} className="btn-primary btn-sm">
        {action.label}
      </button>
    )}
  </motion.div>
);

export default EmptyState;
