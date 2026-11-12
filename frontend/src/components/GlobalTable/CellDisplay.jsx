import LeadNameCell from '../Crm/LeadNameCell';
import { formatDate } from '../../utils/helpers';
import { formatPipelineStage, pipelineBadgeClass } from '../../utils/leadPipeline';
import { getTypeMeta, isEmptyValue } from './fieldTypes';
import { productId, productName, productLabelFromOptions } from './productRef';
import { formatFollowUp, isFollowUpOverdue } from '../../utils/followUp';

const dash = <span className="text-violet-200">—</span>;
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 });

const Chip = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] whitespace-nowrap">{children}</span>
);

/** A lead's follow-up: the day, its time when one was set, red when overdue. */
export const FollowUpText = ({ value }) => (
  <span className={`text-xs whitespace-nowrap ${isFollowUpOverdue(value) ? 'text-red-600 font-semibold' : ''}`} title={isFollowUpOverdue(value) ? 'Overdue' : undefined}>
    {formatFollowUp(value)}
  </span>
);

const optionLabel = (field, value) => ((field && field.options) || []).find((o) => o.value === value)?.label ?? value;

/**
 * Read-only rendering of ONE cell value, by type. The same function renders native Lead columns
 * and custom fields, so a value looks the same wherever it lives.
 * Formula cells receive the backend's calculated value (`computedValue`), never a stored value.
 */
const CellDisplay = ({ col, lead, raw, computedValue, userLookup, onOpenLead, onToggleBool, canEdit }) => {
  const meta = getTypeMeta(col.type);

  /* ---- native-only presentation types ---- */
  if (col.source === 'lead') {
    switch (col.type) {
      case 'name': return <LeadNameCell lead={lead} onOpen={onOpenLead} />;
      case 'stage': {
        const stage = raw || 'lead';
        return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${pipelineBadgeClass(stage)}`}>{formatPipelineStage(stage)}</span>;
      }
      case 'assignee': return userLookup?.[lead.assignedTo?._id || lead.assignedTo]?.name || dash;
      case 'product': {
        // Populated { _id, name } -> its name; raw ObjectId string -> name from the loaded products.
        // Never the id and never "[object Object]". A missing / deleted product reads as empty.
        const ref = lead && lead.product !== undefined ? lead.product : raw;
        const id = productId(ref);
        if (!id) return dash;
        const name = productName(ref) || productLabelFromOptions(col.options, id);
        if (name) return <span className="truncate block text-xs" title={name}>{name}</span>;
        if (col.productsState === 'loading') return <span className="text-xs text-violet-300">…</span>;
        return <span className="text-xs italic text-violet-400" title="This product could not be found">Unknown product</span>;
      }
      case 'mandal': {
          // The lead's Mandal node, shown by name (options carry the user's Mandals).
          const id = lead.productLocation?._id || lead.productLocation;
          const option = id ? (col.options || []).find((o) => o.value === String(id)) : null;
          const label = option?.label || lead.mandal || '';
          return label ? <span className="truncate block text-xs" title={option?.title || label}>{label}</span> : dash;
        }

      case 'count': return <span className="text-xs">{lead.visitCount ?? 0}</span>;
      case 'followup': return raw ? <FollowUpText value={raw} /> : dash;
      default: break;
    }
  }

  /* ---- formula: calculated, read-only ---- */
  if (meta.calculated) {
    if (!(col.field && col.field.config && col.field.config.expression)) {
      return <span className="text-xs text-red-500" title="This formula has no expression">Invalid formula</span>;
    }
    if (computedValue === null || computedValue === undefined) {
      return <span className="text-xs text-violet-300 italic" title="Not enough data to calculate (an input is empty or the result is undefined)">—</span>;
    }
    return <span className="text-xs italic text-violet-700" title="Calculated value (read-only)">{plain.format(Number(computedValue))}</span>;
  }

  if (meta.unknown) {
    return <span className="text-xs text-red-500" title={`Unsupported field type "${col.type}"`}>Unsupported</span>;
  }

  /* ---- checkbox / boolean ---- */
  if (col.type === 'checkbox') {
    return (
      <input
        type="checkbox" checked={raw === true} disabled={!canEdit || !col.editable} aria-label={col.label} className="accent-violet-600 cursor-pointer"
        onClick={(e) => e.stopPropagation()} onChange={() => onToggleBool(lead._id, col.key)}
      />
    );
  }
  if (col.type === 'boolean') return raw === true ? <Chip>Yes</Chip> : raw === false ? <Chip>No</Chip> : dash;

  if (isEmptyValue(raw)) return dash;

  switch (col.type) {
    case 'number': return <span className="text-xs">{plain.format(Number(raw))}</span>;
    case 'currency': return <span className="text-xs">{inr.format(Number(raw))}</span>;
    case 'date': return <span className="text-xs">{formatDate(raw)}</span>;
    case 'datetime': { const d = new Date(raw); return <span className="text-xs">{Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleString()}</span>; }
    case 'email': return <a href={`mailto:${raw}`} onClick={(e) => e.stopPropagation()} className="text-xs text-violet-600 hover:underline truncate block">{raw}</a>;
    case 'single-select': return <Chip>{optionLabel(col.field, raw)}</Chip>;
    case 'multi-select': return <div className="flex flex-wrap gap-1">{(Array.isArray(raw) ? raw : [raw]).map((v) => <Chip key={v}>{optionLabel(col.field, v)}</Chip>)}</div>;
    case 'person': return <div className="flex flex-wrap gap-1">{(Array.isArray(raw) ? raw : [raw]).map((id) => <Chip key={String(id)}>{userLookup?.[String(id)]?.name || 'Unknown user'}</Chip>)}</div>;
    case 'reference': return <span className="text-xs text-violet-400" title={String(raw)}>Linked record</span>;
    default: return <span className="truncate block text-xs">{String(raw)}</span>;
  }
};

export default CellDisplay;