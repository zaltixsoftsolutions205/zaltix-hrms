import { memo } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  Trash2,
} from 'lucide-react';

import LeadNameCell from '../Crm/LeadNameCell';
import { formatDate } from '../../utils/helpers';
import {
  formatPipelineStage,
  pipelineBadgeClass,
} from '../../utils/leadPipeline';
import { CellEditor, FormulaCellDisplay } from './CellEditors';
import { toEditorValue } from './fieldTypes';
import { FollowUpText } from './CellDisplay';

const dash = <span className="text-violet-200">—</span>;

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 6,
});

const isEmpty = (value) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

const Chip = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] whitespace-nowrap">
    {children}
  </span>
);

const optionLabel = (field, value) =>
  (field?.options || []).find(
    (option) => option.value === value
  )?.label ?? value;

/**
 * GlobalTableCell
 *
 * Responsibilities:
 * - Render native Lead fields and custom fields.
 * - Display the active cell editor.
 * - Show saving, saved, and error indicators.
 * - Show a hover action to clear a cell value.
 *
 * Clearing a cell must never delete the Lead or field definition.
 *
 * Expected handlers:
 * h.onOpenLead(lead)
 * h.onCellClick(rowId, colKey)
 * h.onCommit(rowId, colKey, value, nav)
 * h.onCancel()
 * h.onClear(rowId, colKey)
 * h.onToggleBool(rowId, colKey)   (checkbox fields only; boolean fields use the Yes/No editor)
 */
const GlobalTableCell = ({
  lead,
  col,
  entry,
  active,
  editing,
  status,
  pinStyle,
  pinClass,
  userLookup,
  h,
}) => {
  const rowId = lead._id;

  // Native fields read from the Lead record.
  // Custom fields read from their GlobalTableValue entry
  // (formula fields: the backend-calculated result, never stored).
  const raw =
    col.source === 'lead'
      ? lead[col.key]
      : entry?.value;

  const hasValue =
    col.source === 'custom'
      ? entry?._id != null && !isEmpty(raw)
      : !isEmpty(raw);

  // Formula and reference fields are not directly clearable.
  const canClear = Boolean(col.clearable) && Boolean(col.editable) && col.type !== 'formula' && col.type !== 'reference' && hasValue && !editing && status?.s !== 'saving';
  // Same stored-value -> editor-value conversion as the Add Row and the drawer
  const editorInitial = () =>
    col.type === 'assignee'
      ? toEditorValue(col, lead.assignedTo)
      : toEditorValue(col, raw);

  const renderDisplay = () => {
    // ---------------- Native Lead fields ----------------
    if (col.source === 'lead') {
      switch (col.type) {
        case 'name':
          return (
            <LeadNameCell
              lead={lead}
              onOpen={h.onOpenLead}
            />
          );

        case 'stage': {
          const stage = raw || 'lead';

          return (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${pipelineBadgeClass(stage)}`}
            >
              {formatPipelineStage(stage)}
            </span>
          );
        }

        case 'assignee': {
          const assignedToId =
            lead.assignedTo?._id || lead.assignedTo;

          const name =
            userLookup?.[assignedToId]?.name;

          return name || dash;
        }

        case 'date':
          return raw ? formatDate(raw) : dash;

        case 'followup':
          return raw ? <FollowUpText value={raw} /> : dash;

        case 'product':
          return raw?.name || (raw ? String(raw) : dash);

        case 'mandal': {
          // The lead's Mandal node, shown by name (options carry the user's Mandals).
          const id = lead.productLocation?._id || lead.productLocation;
          const option = id ? (col.options || []).find((o) => o.value === String(id)) : null;
          const label = option?.label || lead.mandal || '';
          return label ? <span className="truncate block text-xs" title={option?.title || label}>{label}</span> : dash;
        }

        case 'count':
          return (
            <span className="text-xs">
              {lead.visitCount ?? 0}
            </span>
          );

        default:
          return isEmpty(raw)
            ? dash
            : (
              <span className="truncate block text-xs">
                {String(raw)}
              </span>
            );
      }
    }

    // ---------------- Custom fields ----------------

    // checkbox: two states, toggled in place
    if (col.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={
            raw === true ||
            raw === 'true' ||
            raw === 1
          }
          disabled={!col.editable}
          aria-label={col.label}
          className="accent-violet-600 cursor-pointer"
          onClick={(event) => event.stopPropagation()}
          onChange={() => {
            h.onToggleBool(rowId, col.key);
          }}
        />
      );
    }

    if (col.type === 'formula') {
      return <FormulaCellDisplay value={raw} />;
    }

    if (isEmpty(raw)) {
      return dash;
    }

    switch (col.type) {
      // boolean: Yes / No / not set (empty is shown as a dash above)
      case 'boolean':
        return (
          <span className="text-xs">
            {raw === true || raw === 'true' ? 'Yes' : 'No'}
          </span>
        );

      case 'number': {
        const value = Number(raw);

        return (
          <span className="text-xs">
            {Number.isFinite(value) ? plain.format(value) : String(raw)}
          </span>
        );
      }

      case 'currency': {
        const value = Number(raw);

        return (
          <span className="text-xs">
            {Number.isFinite(value) ? inr.format(value) : String(raw)}
          </span>
        );
      }

      case 'date':
        return (
          <span className="text-xs">
            {formatDate(raw)}
          </span>
        );

      case 'datetime':
        return (
          <span className="text-xs">
            {formatDate(raw)}
          </span>
        );

      case 'email':
        return (
          <span className="truncate block text-xs">
            {String(raw)}
          </span>
        );

      case 'single-select':
        return (
          <Chip>
            {optionLabel(col.field, raw)}
          </Chip>
        );

      case 'multi-select':
        return (
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(raw) ? raw : [raw]).map((value) => (
              <Chip key={String(value)}>
                {optionLabel(col.field, value)}
              </Chip>
            ))}
          </div>
        );

      // person values are user ids; show their names
      case 'person':
        return (
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(raw) ? raw : [raw]).map((id) => (
              <Chip key={String(id)}>
                {userLookup?.[String(id)]?.name || String(id)}
              </Chip>
            ))}
          </div>
        );

      case 'reference':
        return (
          <span
            className="text-xs text-violet-400"
            title={String(raw)}
          >
            Linked record
          </span>
        );

      default:
        return (
          <span className="truncate block text-xs">
            {String(raw)}
          </span>
        );
    }
  };

  const statusIcon =
    status?.s === 'saving' ? (
      <Loader2
        size={13}
        className="animate-spin text-violet-400"
        aria-label="Saving"
      />
    ) : status?.s === 'error' ? (
      <span title={status.m || 'Failed to save'}>
        <AlertTriangle
          size={13}
          className="text-red-500"
          aria-label="Save failed"
        />
      </span>
    ) : status?.s === 'saved' ? (
      <Check
        size={13}
        className="text-emerald-500"
        aria-label="Saved"
      />
    ) : null;

  return (
    <td
      role="gridcell"
      aria-selected={active}
      className={`group relative ${pinClass || ''} ${active
          ? 'ring-2 ring-inset ring-violet-400'
          : ''
        } ${status?.s === 'error'
          ? 'bg-red-50/60'
          : ''
        }`}
      style={{
        minWidth: col.width,
        maxWidth: col.width ? col.width * 1.6 : undefined,
        ...pinStyle,
      }}
      onClick={() => {
        if (!editing) {
          h.onCellClick(rowId, col.key);
        }
      }}
    >
      <div className="relative flex items-center min-h-[1.6rem] pr-12">
        {/* Cell content */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <CellEditor
              col={col}
              initial={editorInitial()}
              userLookup={userLookup}
              onCommit={(value, nav) => {
                h.onCommit(rowId, col.key, value, nav);
              }}
              onCancel={h.onCancel}
            />
          ) : (
            <div className="min-w-0 w-full">
              {renderDisplay()}
            </div>
          )}
        </div>

        {/* Save status and clear-value action */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {statusIcon}

          {canClear && status?.s !== 'saving' && (
            <button
              type="button"
              title={`Clear ${col.label} (does not delete the Lead)`}
              aria-label={`Clear ${col.label}`}
              onClick={(event) => {
                event.stopPropagation();
                h.onClear(rowId, col.key);
              }}
              className={`w-5 h-5 shrink-0 flex items-center justify-center rounded
                text-violet-300 hover:text-red-500 hover:bg-red-50
                focus-visible:opacity-100 focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-violet-400
                transition-opacity ${active
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
                }`}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </td>
  );
};

export default memo(GlobalTableCell);