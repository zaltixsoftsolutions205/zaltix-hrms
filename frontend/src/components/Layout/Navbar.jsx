import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../utils/api';
import { formatDateTime } from '../../utils/helpers';

const DASHBOARD_PATHS = ['/dashboard', '/hr/dashboard', '/admin/dashboard'];

const Navbar = ({ onMenuToggle, pageTitle }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const notifRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const showBack = !DASHBOARD_PATHS.includes(location.pathname);

  const setBadge = (count) => {
    if ('setAppBadge' in navigator) {
      count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setBadge(data.unreadCount);
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setBadge(0);
    } catch {}
  };

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => {
        const next = Math.max(0, prev - 1);
        setBadge(next);
        return next;
      });
    } catch {}
  };

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-violet-200 px-3 sm:px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
      {/* Left */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button onClick={onMenuToggle} className="lg:hidden w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-600 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {showBack && (
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-600 transition-colors"
            title="Go back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-base lg:text-xl font-bold text-violet-900 leading-none truncate">{pageTitle}</h2>
          <p className="text-[10px] sm:text-xs text-violet-400 mt-0.5 hidden sm:block">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2" ref={notifRef}>
        {/* Notifications */}
        <div className="relative">
          <button onClick={() => setShowNotif(!showNotif)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-violet-100 text-violet-600 transition-colors relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-golden-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotif && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-10 w-64 sm:w-72 bg-white rounded-xl shadow-xl border border-violet-100 overflow-hidden z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-violet-100">
                  <h3 className="font-semibold text-violet-900 text-xs">Notifications</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-[10px] text-golden-600 hover:text-golden-700 font-medium">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-violet-400">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-violet-300 mx-auto mb-1.5">
                        <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9M3 3l18 18" />
                      </svg>
                      No notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n._id} onClick={() => { markRead(n._id); if (n.link) navigate(n.link); setShowNotif(false); }}
                        className={`px-3 py-2 border-b border-violet-50 cursor-pointer hover:bg-violet-50 transition-colors ${!n.isRead ? 'bg-violet-50/50' : ''}`}>
                        <div className="flex items-start gap-1.5">
                          {!n.isRead && <span className="w-1.5 h-1.5 bg-golden-500 rounded-full mt-1 flex-shrink-0" />}
                          <div className={!n.isRead ? '' : 'pl-3'}>
                            <p className="text-[11px] font-semibold text-violet-800 leading-snug">{n.title}</p>
                            <p className="text-[10px] text-violet-500 mt-0.5 leading-snug">{n.message}</p>
                            <p className="text-[9px] text-violet-400 mt-0.5">{formatDateTime(n.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
