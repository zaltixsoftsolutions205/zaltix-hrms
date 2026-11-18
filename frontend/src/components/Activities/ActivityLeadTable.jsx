import { ClipboardList } from 'lucide-react';
import { formatDay } from '../Visits/visitDates';
import { formatFollowUp } from '../../utils/followUp';
import ClientBadge from '../Crm/ClientBadge';

/**
 * Table view of an activity page (Registration): every lead in the stage, one
 * row each. Clicking a row selects the lead (addOnClick: and opens its add form).
 */
export default function ActivityLeadTable({ page, leads, selectedId, onRowClick, addOnClick = true }) {
  if (!leads.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList size={28} className="text-violet-300" />
        <p className="mt-2 text-sm text-gray-500">No leads in the {page.label} stage.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 z-10 bg-violet-50 text-[11px] uppercase tracking-wide text-violet-600">
          <tr>
            <th className="text-left font-semibold px-3 py-2">Lead</th>
            <th className="text-left font-semibold px-3 py-2">Mandal</th>
            <th className="text-left font-semibold px-3 py-2">Product</th>
            <th className="text-left font-semibold px-3 py-2">Assigned to</th>
            <th className="text-left font-semibold px-3 py-2">Next follow-up</th>
            <th className="text-right font-semibold px-3 py-2">{page.title}</th>
            <th className="text-left font-semibold px-3 py-2">Last {page.noun}</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const selected = selectedId === lead._id;
            return (
              <tr
                key={lead._id}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onRowClick(lead)}
                onKeyDown={(e) => { if (e.key === 'Enter') onRowClick(lead); }}
                title={addOnClick ? `Add a ${page.noun} for ${lead.name}` : `Open ${lead.name}`}
                className={`border-b border-violet-50 cursor-pointer transition-colors ${selected ? 'bg-violet-100/70' : 'hover:bg-violet-50/60'}`}
              >
                <td className="px-3 py-2.5 font-semibold text-gray-900"><span className="inline-flex items-center gap-1.5">{lead.name}<ClientBadge lead={lead} /></span></td>
                <td className="px-3 py-2.5 text-gray-600">{lead.mandal || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600">{lead.product?.name || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600">{lead.assignedTo?.name || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600">{formatFollowUp(lead.followUpDate)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${lead.activityCount ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {lead.activityCount || 0}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-600">{lead.lastActivityDate ? formatDay(lead.lastActivityDate) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
