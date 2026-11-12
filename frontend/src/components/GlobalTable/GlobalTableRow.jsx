import { memo, useState } from 'react';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import GlobalTableCell from './GlobalTableCell';

const BG = '#ffffff';
const BG_HOVER = '#f5f3ff'; // violet-50, opaque so scrolled cells never show through
export const SELECT_COL_WIDTH = 40;
/**
 * One Lead row.
 * The trash in the LAST column deletes the whole Lead (entity), not a value.
 * (Cell-level "clear value" lives inside GlobalTableCell.)
 * rowAction (optional): { label(lead), disabledReason(lead), onClick(lead) } —
 * an extra button before the trash (Leads page: open the lead's own table).
 */
const GlobalTableRow = ({
  lead, columns, entries, activeColKey, editingColKey, statuses,
  pinnedSet, pinnedLeftByKey, lastPinnedKey, userLookup, h, onDeleteRequest, deleting, rowAction,
  selectable = false, selected = false, onToggleSelect,
}) => {
  const actionBlocked = rowAction ? rowAction.disabledReason?.(lead) : null;
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      className="hover:bg-violet-50/40 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Leading checkbox column (multi-select delete) */}
      {selectable && (
        <td className="sticky left-0 z-20" style={{ isolation: 'isolate', backgroundColor: selected ? '#ede9fe' : hovered ? BG_HOVER : BG, width: SELECT_COL_WIDTH }}>
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(lead._id)}
              aria-label={`Select lead ${lead.name}`}
              className="w-4 h-4 accent-violet-600 cursor-pointer"
            />
          </div>
        </td>
      )}
      {columns.map((col) => {
        const pinned = pinnedSet.has(col.key);
        return (
          <GlobalTableCell
            key={col.key}
            lead={lead}
            col={col}
            entry={col.source === 'custom' ? entries[col.key] : undefined}
            active={activeColKey === col.key}
            editing={editingColKey === col.key}
            status={statuses[col.key]}
            pinStyle={pinned
              ? {
                  position: 'sticky',
                  left: pinnedLeftByKey[col.key] ?? 0,
                  zIndex: 20,
                  isolation: 'isolate',
                  backgroundColor: hovered ? BG_HOVER : BG,
                }
              : undefined}
            pinClass={pinned && col.key === lastPinnedKey ? 'border-r border-violet-200' : ''}
            userLookup={userLookup}
            h={h}
          />
        );
      })}

      {/* Far-right action column: delete the ENTIRE lead */}
      <td className="sticky right-0 z-20" style={{ isolation: 'isolate', backgroundColor: hovered ? BG_HOVER : BG, width: rowAction ? 80 : 48 }}>
        <div className="flex items-center justify-center gap-1">
          {rowAction && (
            <button
              type="button"
              disabled={Boolean(actionBlocked)}
              onClick={() => rowAction.onClick(lead)}
              title={actionBlocked || rowAction.label(lead)}
              aria-label={actionBlocked || rowAction.label(lead)}
              className="w-6 h-6 flex items-center justify-center rounded text-violet-500 hover:text-violet-800 hover:bg-violet-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowUpRight size={14} />
            </button>
          )}
          {onDeleteRequest && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDeleteRequest(lead)}
              title="Delete this lead"
              aria-label={`Delete lead ${lead.name}`}
              className="w-6 h-6 flex items-center justify-center rounded text-violet-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

export default memo(GlobalTableRow);