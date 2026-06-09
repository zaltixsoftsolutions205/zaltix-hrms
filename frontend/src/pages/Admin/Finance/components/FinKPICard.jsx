import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

const ACCENT = {
  revenue: { border: '#7c3aed', icon: 'rgba(124,58,237,0.08)',  iconColor: '#7c3aed'  },
  expense: { border: '#dc2626', icon: 'rgba(220,38,38,0.08)',   iconColor: '#dc2626'  },
  profit:  { border: '#16a34a', icon: 'rgba(22,163,74,0.08)',   iconColor: '#16a34a'  },
  info:    { border: '#7c3aed', icon: 'rgba(124,58,237,0.08)',  iconColor: '#7c3aed'  },
  warning: { border: '#f59e0b', icon: 'rgba(245,158,11,0.08)',  iconColor: '#d97706'  },
};

export function FinKPICard({ title, value, change, changeLabel, icon: Icon, accentColor = 'revenue' }) {
  const acc = ACCENT[accentColor] || ACCENT.revenue;
  const isPositive = change != null && change > 0;
  const isNeutral  = change == null || change === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: '#ffffff',
        border: '1px solid #ede9fe',
        borderLeft: `3px solid ${acc.border}`,
        borderRadius: 12,
        padding: '18px 20px',
        boxShadow: '0 1px 3px rgba(109,40,217,0.04)',
        transition: 'box-shadow 0.18s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c3aed', marginBottom: 6 }}>
            {title}
          </p>
          <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: '#111827', lineHeight: 1.15 }}>
            {value}
          </p>
          {change != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
              {isNeutral
                ? <Minus size={11} style={{ color: '#9ca3af' }} />
                : isPositive
                  ? <TrendingUp size={11} style={{ color: '#16a34a' }} />
                  : <TrendingDown size={11} style={{ color: '#dc2626' }} />
              }
              <span style={{ fontSize: 11.5, fontWeight: 600, color: isNeutral ? '#9ca3af' : isPositive ? '#16a34a' : '#dc2626' }}>
                {isPositive ? '+' : ''}{change}%
              </span>
              {changeLabel && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div style={{ borderRadius: 10, padding: '10px', background: acc.icon, flexShrink: 0 }}>
            <Icon size={20} style={{ color: acc.iconColor, display: 'block' }} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
