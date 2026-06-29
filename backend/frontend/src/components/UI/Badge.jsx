import { getStatusBadge, capitalize } from '../../utils/helpers';

const Badge = ({ status, label, className = '' }) => {
  const cls = getStatusBadge(status);
  return (
    <span className={`${cls} ${className}`}>
      {label || capitalize(status)}
    </span>
  );
};

export default Badge;
