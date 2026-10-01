/**
 * Shared, presentation-only primitives used by both HREmployees.jsx and
 * Interns.jsx. These were previously defined inline inside HREmployees.jsx
 * (Ico, Field, SelectField) — pulling them out here is what lets Interns.jsx
 * reuse the exact same look/behavior instead of redefining them.
 *
 * HREmployees.jsx should import these instead of keeping its own local
 * copies (see integration notes for the one-line swap).
 */

export function Ico({ d, d2, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />{d2 && <path d={d2} />}
    </svg>
  );
}

export function Field({ label, className = '', ...props }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-violet-700 mb-1">{label}</label>
      <input
        className={`w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 ${className}`}
        {...props}
      />
    </div>
  );
}

export function SelectField({ label, children, ...props }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-violet-700 mb-1">{label}</label>
      <select
        className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}