// The ONLY clickable entry point into the Lead detail/edit drawer.
// Other cells in the row stay plain table cells (see LeadRow.jsx).
const LeadNameCell = ({ lead, onOpen }) => (
  <button onClick={() => onOpen(lead)} className="group flex items-center gap-1.5 text-left">
    <span className="font-semibold text-violet-900 group-hover:text-violet-700 transition-colors">
      {lead.name}
    </span>
    <span className="text-violet-300 opacity-0 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-sm">
      →
    </span>
  </button>
);

export default LeadNameCell;