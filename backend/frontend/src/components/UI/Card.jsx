import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const Card = ({ children, className = '', animate = true, onClick }) => {
  const Component = animate ? motion.div : 'div';
  const animProps = animate ? { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 } } : {};
  return (
    <Component className={`glass-card p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`} onClick={onClick} {...animProps}>
      {children}
    </Component>
  );
};

export const KpiCard = ({ label, value, icon, color = 'violet', trend, className = '', to }) => {
  const content = (
    <div className="flex items-start justify-between">
      <div className="min-w-0 flex-1">
        <p className="kpi-label">{label}</p>
        <p className="kpi-value mt-1">{value ?? '—'}</p>
        {trend !== undefined && (
          <p className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-violet-600' : 'text-gray-900'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </p>
        )}
      </div>
      {icon && (
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2 border ${
          color === 'golden' ? 'border-golden-300 bg-golden-50 text-golden-600' :
          color === 'green' ? 'border-violet-300 bg-violet-50 text-violet-600' :
          color === 'red' ? 'border-gray-300 bg-gray-100 text-gray-900' :
          'border-violet-300 bg-violet-50 text-violet-600'
        }`}>
          {icon}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className={`glass-card p-4 sm:p-5 h-full ${className}`}>
        <Link to={to} className="block group">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="kpi-label group-hover:text-violet-700 transition-colors">{label}</p>
              <p className="kpi-value mt-1">{value ?? '—'}</p>
              {trend !== undefined && (
                <p className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-violet-600' : 'text-gray-900'}`}>
                  {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
                </p>
              )}
            </div>
            {icon && (
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2 border transition-colors ${
                color === 'golden' ? 'border-golden-300 bg-golden-50 text-golden-600 group-hover:bg-golden-100' :
                color === 'green' ? 'border-violet-300 bg-violet-50 text-violet-600 group-hover:bg-violet-100' :
                color === 'red' ? 'border-gray-300 bg-gray-100 text-gray-900 group-hover:bg-gray-100' :
                'border-violet-300 bg-violet-50 text-violet-600 group-hover:bg-violet-100'
              }`}>
                {icon}
              </div>
            )}
          </div>
          <p className="text-[10px] text-violet-400 mt-2 group-hover:text-violet-600 transition-colors font-medium">View details →</p>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className={`glass-card p-4 sm:p-5 h-full ${className}`}>
      {content}
    </motion.div>
  );
};

export default Card;
