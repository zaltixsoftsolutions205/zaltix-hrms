import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SearchableSelect } from '../UI/Assignmentselects';
import { normalizeStage } from '../../hooks/useGlobalTableColumns';

/**
 * Search for the lead tables (Leads page): a text box over the lead name and
 * the assignee's name, an "Assigned to" picker, and a "Missing info" picker
 * (leads with no follow-up date and/or no assignee, so they can be filled in).
 * Filters the rows already loaded in the browser.
 */

const UNASSIGNED = '__unassigned__';

// A follow-up only matters while the lead is being worked: not for lost leads, and not
// for won leads (clients) unless CRM › Clients sent them to an activity page.
const followUpMatters = (lead) => {
  const stage = normalizeStage(lead?.pipelineStage);
  if (stage === 'lead-lost') return false;
  if (stage === 'lead-won') return Boolean(lead?.wonActivityStage);
  return true;
};
const needsFollowUp = (lead) => !lead?.followUpDate && followUpMatters(lead);
const needsAssignee = (lead) => !lead?.assignedTo;

const MISSING = {
  any: { label: 'Missing follow-up or assignee', test: (l) => needsFollowUp(l) || needsAssignee(l) },
  both: { label: 'Missing both', test: (l) => needsFollowUp(l) && needsAssignee(l) },
  followUp: { label: 'No follow-up date', test: needsFollowUp },
  assignee: { label: 'Not assigned', test: needsAssignee },
};

const assigneeId = (lead) => {
  const a = lead?.assignedTo;
  return a ? String(a._id || a) : '';
};

const assigneeName = (lead, userLookup) => {
  const a = lead?.assignedTo;
  if (!a) return '';
  return a.name || userLookup?.[String(a._id || a)]?.name || '';
};

/** Filter state + the filtered rows. */
export function useLeadSearch(leads, userLookup) {
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [missing, setMissing] = useState('');

  const missingOptions = useMemo(() => [
    { id: '', label: 'All leads' },
    ...Object.entries(MISSING).map(([id, m]) => ({ id, label: m.label, sublabel: String((leads || []).filter(m.test).length) })),
  ], [leads]);

  const assigneeOptions = useMemo(() => {
    const byId = new Map();
    let unassigned = 0;
    (leads || []).forEach((lead) => {
      const id = assigneeId(lead);
      if (!id) { unassigned += 1; return; }
      const entry = byId.get(id) || { id, label: assigneeName(lead, userLookup) || 'Unknown employee', count: 0 };
      entry.count += 1;
      byId.set(id, entry);
    });
    const list = [...byId.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((u) => ({ id: u.id, label: u.label, sublabel: String(u.count) }));
    return [
      { id: '', label: 'All employees' },
      ...list,
      ...(unassigned ? [{ id: UNASSIGNED, label: 'Unassigned', sublabel: String(unassigned) }] : []),
    ];
  }, [leads, userLookup]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q && !assignee && !missing) return leads || [];
    return (leads || []).filter((lead) => {
      if (missing && !MISSING[missing].test(lead)) return false;
      const id = assigneeId(lead);
      if (assignee === UNASSIGNED ? id : assignee && id !== assignee) return false;
      if (!q) return true;
      return String(lead?.name || '').toLowerCase().includes(q)
        || assigneeName(lead, userLookup).toLowerCase().includes(q);
    });
  }, [leads, userLookup, text, assignee, missing]);

  return {
    filtered,
    active: Boolean(text.trim() || assignee || missing),
    barProps: { text, setText, assignee, setAssignee, assigneeOptions, missing, setMissing, missingOptions },
  };
}

export default function LeadSearchBar({ text, setText, assignee, setAssignee, assigneeOptions, missing, setMissing, missingOptions }) {
  // relative z-50: the dropdowns open above the table's sticky header (z-40).
  // Wraps on narrow screens; full-width stack on phones.
  return (
    <div className="relative z-50 flex flex-wrap items-center gap-2 w-full lg:w-auto">
      <label className="relative w-full sm:w-56">
        <span className="sr-only">Search leads</span>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search name or assigned to..."
          className="input-field !pl-8 !py-1.5 !text-sm w-full"
        />
      </label>
      <div className="w-full sm:w-48">
        <SearchableSelect
          options={assigneeOptions}
          value={assignee}
          onChange={setAssignee}
          placeholder="All employees"
          emptyMessage="No employees found"
        />
      </div>
      {setMissing && (
        <div className={`w-full sm:w-56 rounded-lg ${missing ? 'ring-2 ring-amber-300' : ''}`} title="Leads that still need a follow-up date or an assigned sales user">
          <SearchableSelect
            options={missingOptions}
            value={missing}
            onChange={setMissing}
            placeholder="All leads"
            emptyMessage="No options"
          />
        </div>
      )}
    </div>
  );
}
