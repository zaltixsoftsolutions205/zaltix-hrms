import { AnimatePresence, motion } from 'framer-motion';

const CustomFieldOptionEditor = ({ options, onChange }) => {
  const remove = (i) => {
    onChange(options.filter((_, idx) => idx !== i));
  };

  const add = () => {
    onChange([
      ...options,
      {
        label: '',
        value: '',
      },
    ]);
  };

  const updateLabel = (i, label) => {
    const next = [...options];

    next[i] = {
      ...next[i],
      label,
      // Always generate the value from the CURRENT label.
      // This prevents the value from getting stuck on the first
      // character typed, e.g. "c".
      value: label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-'),
    };

    onChange(next);
  };

  return (
    <div>
      <label className="input-label">Options</label>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {options.map((opt, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2 items-center"
            >
              <input
                className="input-field flex-1"
                placeholder="Label"
                value={opt.label}
                onChange={(e) => updateLabel(i, e.target.value)}
              />

              <button
                type="button"
                onClick={() => remove(i)}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-violet-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-2 text-xs font-semibold text-violet-600 hover:text-violet-700"
      >
        + Add Option
      </button>
    </div>
  );
};

export default CustomFieldOptionEditor;

