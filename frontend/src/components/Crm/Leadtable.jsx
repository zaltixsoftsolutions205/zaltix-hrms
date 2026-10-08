import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import LeadRow from './LeadRow';
import InlineLeadRow from './InlineLeadRow';
import LeadColumnHeader from './Leadcolumnheader';
import EmptyState from '../UI/EmptyState';
import { deleteLeadCustomField, updateLeadCustomField } from '../../services/Leadcustomfieldservice';
import { deleteLead } from '../../services/Leadservice';

const STANDARD_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'followUpDate', label: 'Next Follow-up' },
  { key: 'assignedTo', label: 'Assign To' },
  { key: 'pipelineStage', label: 'Pipeline Stage' },
  { key: 'visitCount', label: 'Visits' },
];

const isFieldValueEmpty = (value) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

const TableSkeleton = ({ colCount }) => (
  <tbody>
    {[...Array(5)].map((_, r) => (
      <tr key={r}>
        {[...Array(colCount)].map((__, c) => (
          <td key={c}><div className="h-4 bg-violet-100/70 rounded animate-pulse" /></td>
        ))}
      </tr>
    ))}
  </tbody>
);

const LeadTable = ({
  leads, customFields, valuesByLead, userLookup, loading, showInlineRow,
  onOpenLead, onOpenAddField, onStartInlineCreate, onOpenCreateDrawer,
  onInlineCreated, onInlineCancel, onFieldsChanged, onValueChanged, onLeadUpdated, onLeadDeleted,
  onEditField,
}) => {
  const colCount = STANDARD_COLUMNS.length + customFields.length + 1;
  const orderedColumns = useMemo(
    () => [
      ...STANDARD_COLUMNS.map((c) => ({ ...c, kind: 'standard' })),
      ...customFields.map((f) => ({ key: f._id, label: f.name, kind: 'custom', field: f })),
    ],
    [customFields]
  );

  const [pinnedColumns, setPinnedColumns] = useState(() => new Set(['name']));

  useEffect(() => {
    setPinnedColumns((prev) => {
      const validKeys = new Set(orderedColumns.map((c) => c.key));
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [orderedColumns]);

  const togglePin = (key) => {
    setPinnedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const [openMenuKey, setOpenMenuKey] = useState(null);
  const toggleMenu = (key) => setOpenMenuKey((prev) => (prev === key ? null : key));
  const closeMenu = () => setOpenMenuKey(null);

  const hasValueByField = useMemo(() => {
    const map = {};
    customFields.forEach((f) => {
      map[f._id] = leads.some((lead) => !isFieldValueEmpty(valuesByLead[lead._id]?.[f._id]));
    });
    return map;
  }, [customFields, leads, valuesByLead]);

  const lastPinnedKey = useMemo(() => {
    const pinnedInOrder = orderedColumns.filter((c) => pinnedColumns.has(c.key));
    return pinnedInOrder.length ? pinnedInOrder[pinnedInOrder.length - 1].key : null;
  }, [orderedColumns, pinnedColumns]);

  const removeField = async (field) => {
    if (hasValueByField[field._id]) {
      toast.error('Cannot remove this field because it contains data.');
      return;
    }
    try {
      await deleteLeadCustomField(field._id);
      toast.success('Field removed');
      onFieldsChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove field');
    }
  };

  const renameField = async (field, newName) => {
    try {
      await updateLeadCustomField(field._id, { name: newName });
      onFieldsChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to rename field');
      throw err;
    }
  };

  const handleDeleteLead = async (lead) => {
    if (!window.confirm(`Delete "${lead.name}"? This cannot be undone.`)) return;
    try {
      await deleteLead(lead._id);
      toast.success('Lead deleted');
      onLeadDeleted?.(lead._id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete lead');
    }
  };

  const thRefs = useRef({});
  const [pinnedLeftByKey, setPinnedLeftByKey] = useState({});

  useLayoutEffect(() => {
    const offsets = {};
    let running = 0;
    orderedColumns.forEach((col) => {
      if (!pinnedColumns.has(col.key)) return;
      offsets[col.key] = running;
      const el = thRefs.current[col.key];
      running += el ? el.offsetWidth : 0;
    });
    setPinnedLeftByKey(offsets);
  }, [orderedColumns, pinnedColumns, loading, leads]);

  const nameIsPinned = pinnedColumns.has('name');

  return (
    <div className="border border-violet-100 rounded-xl overflow-hidden">
      <div className="overflow-auto max-h-[70vh]">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              {orderedColumns.map((col) => (
                <LeadColumnHeader
                  key={col.key}
                  innerRef={(el) => { thRefs.current[col.key] = el; }}
                  column={col}
                  pinned={pinnedColumns.has(col.key)}
                  leftOffset={pinnedLeftByKey[col.key]}
                  isLastPinned={col.key === lastPinnedKey}
                  onTogglePin={togglePin}
                  onRemove={removeField}
                  onRename={renameField}
                  onEdit={onEditField}
                  hasValue={col.kind === 'custom' ? hasValueByField[col.key] : false}
                  menuOpen={openMenuKey === col.key}
                  onToggleMenu={() => toggleMenu(col.key)}
                  onCloseMenu={closeMenu}
                />
              ))}
              <th className="sticky top-0 right-0 bg-violet-50 z-30 text-center w-12">
                <button
                  onClick={onOpenAddField}
                  title="Add custom field"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-violet-500 hover:bg-violet-100 hover:text-violet-700 transition-colors font-bold"
                >
                  +
                </button>
              </th>
            </tr>
          </thead>

          {loading ? (
            <TableSkeleton colCount={colCount} />
          ) : (
            <tbody>
              {leads.map((lead) => (
                <LeadRow
                  key={lead._id}
                  lead={lead}
                  customFields={customFields}
                  values={valuesByLead[lead._id] || {}}
                  userLookup={userLookup}
                  onOpen={onOpenLead}
                  pinnedColumns={pinnedColumns}
                  pinnedLeftByKey={pinnedLeftByKey}
                  lastPinnedKey={lastPinnedKey}
                  onValueChanged={onValueChanged}
                  onLeadUpdated={onLeadUpdated}
                  onDeleteRequest={handleDeleteLead}
                />
              ))}

              {!showInlineRow && (
                <tr>
                  <td
                    style={nameIsPinned ? { position: 'sticky', left: pinnedLeftByKey.name ?? 0, zIndex: 20, isolation: 'isolate', backgroundColor: '#ffffff' } : undefined}
                  >
                    <button
                      onClick={onStartInlineCreate}
                      className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-violet-400 hover:bg-violet-50 hover:text-violet-700 transition-colors font-bold"
                      title="Add lead"
                    >
                      +
                    </button>
                  </td>
                  <td colSpan={colCount - 1} />
                </tr>
              )}

              <AnimatePresence>
                {showInlineRow && (
                  <InlineLeadRow
                    customFields={customFields}
                    onCreated={onInlineCreated}
                    onCancel={onInlineCancel}
                    pinnedColumns={pinnedColumns}
                    pinnedLeftByKey={pinnedLeftByKey}
                    lastPinnedKey={lastPinnedKey}
                  />
                )}
              </AnimatePresence>
            </tbody>
          )}
        </table>
      </div>

      {!loading && leads.length === 0 && !showInlineRow && (
        <div className="py-10">
          <EmptyState
            icon={<span className="text-4xl">◎</span>}
            title="No Leads Yet"
            message="Create your first lead to start tracking your sales pipeline."
            action={{ label: '+ Create Lead', onClick: onOpenCreateDrawer }}
          />
        </div>
      )}
    </div>
  );
};

export default LeadTable;