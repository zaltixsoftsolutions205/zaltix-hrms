/**
 * IntelligenceAlerts — contextual smart alert banner strip.
 * Drop this anywhere and pass an array of alerts derived from existing page data.
 * Zero extra API calls needed when used inside pages that already have their data.
 *
 * Each alert: { level: 'error'|'warning'|'info'|'success', message, link? }
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const STYLES = {
  error:   { bar: 'bg-red-500',    bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-800',   icon: '🚨' },
  warning: { bar: 'bg-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-800', icon: '⚠️' },
  info:    { bar: 'bg-violet-500', bg: 'bg-violet-50', border: 'border-violet-200',text: 'text-violet-800',icon: '💡' },
  success: { bar: 'bg-green-500',  bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-800', icon: '✅' },
};

export default function IntelligenceAlerts({ alerts = [] }) {
  const [dismissed, setDismissed] = useState([]);

  const visible = alerts.filter((_, i) => !dismissed.includes(i));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {alerts.map((alert, i) => {
          if (dismissed.includes(i)) return null;
          const s = STYLES[alert.level] || STYLES.info;
          const content = (
            <div className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border ${s.bg} ${s.border} text-sm`}>
              <span className="flex-shrink-0 text-base leading-5 mt-0.5">{s.icon}</span>
              <p className={`flex-1 font-medium leading-snug ${s.text}`}>{alert.message}</p>
              {alert.link && (
                <Link to={alert.link} className={`flex-shrink-0 text-xs underline underline-offset-2 ${s.text} opacity-70 hover:opacity-100`}>
                  View
                </Link>
              )}
              <button onClick={() => setDismissed(d => [...d, i])} className={`flex-shrink-0 opacity-40 hover:opacity-70 ${s.text} text-lg leading-none`}>×</button>
            </div>
          );
          return (
            <motion.div key={i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
              {content}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
