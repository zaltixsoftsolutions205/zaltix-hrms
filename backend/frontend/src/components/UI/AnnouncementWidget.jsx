import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const priorityConfig = {
  urgent:    { label: 'Urgent',    bg: 'bg-gray-100',    text: 'text-gray-900',    dot: 'bg-gray-200' },
  important: { label: 'Important', bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  normal:    { label: 'Normal',    bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400' },
};

const megaphoneD = "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z";

const AnnouncementWidget = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const canManage = user?.role === 'admin' || user?.role === 'hr';

  useEffect(() => {
    api.get('/announcements').then(r => setAnnouncements(r.data.slice(0, 3))).catch(() => {});
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="glass-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-violet-600">
              <path d={megaphoneD} />
            </svg>
          </span>
          <h3 className="font-bold text-violet-900">Announcements</h3>
        </div>
        {canManage && (
          <Link to="/admin/announcements" className="text-xs text-golden-600 font-semibold hover:text-golden-700">
            Manage →
          </Link>
        )}
      </div>

      {announcements.length === 0 ? (
        <p className="text-sm text-violet-400 text-center py-4">No announcements</p>
      ) : (
        <div className="space-y-2.5">
          {announcements.map(ann => {
            const cfg = priorityConfig[ann.priority] || priorityConfig.normal;
            return (
              <div key={ann._id} className="flex gap-3 p-3 rounded-xl bg-violet-50/60 border border-violet-100">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-violet-900 truncate">{ann.title}</p>
                    {ann.priority !== 'normal' && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{ann.content}</p>
                  <p className="text-[10px] text-violet-400 mt-1">
                    {ann.createdBy?.name} · {new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default AnnouncementWidget;
