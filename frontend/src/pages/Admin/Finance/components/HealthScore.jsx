import { motion } from 'framer-motion';

export function HealthScore({ score, label }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#7c3aed' : score >= 50 ? '#f59e0b' : '#dc2626';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative fin-health-ring">
        <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="65" cy="65" r={radius} fill="none" stroke="#ede9fe" strokeWidth="8" />
          <motion.circle
            cx="65" cy="65" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color: 'var(--fin-fg)' }}>{score}</span>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--fin-muted)' }}>/ 100</span>
        </div>
      </div>
      <p className="text-xs font-medium" style={{ color: 'var(--fin-muted)' }}>{label}</p>
    </div>
  );
}
