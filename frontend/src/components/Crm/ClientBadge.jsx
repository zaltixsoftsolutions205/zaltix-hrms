import { Trophy } from 'lucide-react';
import { isClient } from '../../hooks/useGlobalTableColumns';

/** Small green "Client" tag for a won lead (shown on activity pages next to its name). */
export default function ClientBadge({ lead, className = '' }) {
  if (!isClient(lead)) return null;
  return (
    <span
      title="Client (Lead Won), sent here from CRM › Clients"
      className={`inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 flex-shrink-0 ${className}`}
    >
      <Trophy size={10} /> Client
    </span>
  );
}
