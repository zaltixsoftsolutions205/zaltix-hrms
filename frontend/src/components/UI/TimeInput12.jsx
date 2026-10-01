// A 12-hour time picker (hour / minute / AM-PM dropdowns) that reads and
// writes the same 24-hour "HH:mm" string a native <input type="time">
// would — so it's a drop-in replacement. Built because the native picker's
// AM/PM display is inconsistent across browsers (some show it, some show
// 24-hour only), which was confusing for check-in/out time entry.
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const to24h = (h12, minute, period) => {
  let h = h12 % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const from24h = (value) => {
  if (!value) return { h12: '', minute: '', period: 'AM' };
  const [h, m] = value.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return { h12, minute: m, period };
};

export default function TimeInput12({ value, onChange, required, className = '' }) {
  const { h12, minute, period } = from24h(value);

  const update = (nextH12, nextMinute, nextPeriod) => {
    if (nextH12 === '' || nextMinute === '') { onChange(''); return; }
    onChange(to24h(Number(nextH12), Number(nextMinute), nextPeriod));
  };

  return (
    <div className={`input-field flex items-center gap-1.5 ${className}`}>
      <select
        required={required}
        className="bg-transparent outline-none flex-1 min-w-0"
        value={h12}
        onChange={e => update(e.target.value, minute === '' ? 0 : minute, period)}
      >
        <option value="" disabled>HH</option>
        {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
      </select>
      <span className="text-gray-400">:</span>
      <select
        required={required}
        className="bg-transparent outline-none flex-1 min-w-0"
        value={minute}
        onChange={e => update(h12 === '' ? 1 : h12, e.target.value, period)}
      >
        <option value="" disabled>MM</option>
        {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
      </select>
      <select
        className="bg-transparent outline-none flex-shrink-0"
        value={period}
        onChange={e => update(h12 === '' ? 1 : h12, minute === '' ? 0 : minute, e.target.value)}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
