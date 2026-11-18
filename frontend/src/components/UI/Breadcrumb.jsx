import { useNavigate } from 'react-router-dom';

const Breadcrumb = ({ items = [] }) => {
  const navigate = useNavigate();

  if (!items.length) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 flex-wrap px-1"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div
            key={`${item.label}-${index}`}
            className="flex items-center gap-1.5"
          >
            {/* Separator */}
            {index > 0 && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-200 flex-shrink-0"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            )}

            {/* Breadcrumb item */}
            {isLast ? (
              <span className="text-xs font-bold text-gray-700 truncate max-w-[220px]">
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => item.path && navigate(item.path)}
                disabled={!item.path}
                className="text-xs font-semibold text-gray-400 hover:text-violet-600 transition-colors px-2.5 py-1.5 rounded-xl hover:bg-violet-50 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              >
                {item.label}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;