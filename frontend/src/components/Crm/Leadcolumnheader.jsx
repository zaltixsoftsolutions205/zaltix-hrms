import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { MoreVertical, Pin, PinOff, Pencil, Trash2 } from 'lucide-react';

const LeadColumnHeader = ({
  innerRef, column, pinned, leftOffset, isLastPinned,
  onTogglePin, onRemove, onRename, onEdit, hasValue,
  menuOpen, onToggleMenu, onCloseMenu,
}) => {
  const isCustom = column.kind === 'custom';
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(column.label);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      onCloseMenu();
    };
    const handleKeyDown = (e) => { if (e.key === 'Escape') onCloseMenu(); };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, onCloseMenu]);

  // Quick-rename shortcut — independent of the ⋮ → Edit field action below.
  // Only renames the name inline; options/required/type still go through
  // the modal.
  const startRename = () => { if (isCustom) { setDraftName(column.label); setRenaming(true); } };
  const cancelRename = () => { setRenaming(false); setDraftName(column.label); };
  const commitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) { toast.error('Field name cannot be empty.'); cancelRename(); return; }
    if (trimmed === column.label) { setRenaming(false); return; }
    setRenaming(false);
    await onRename(column.field, trimmed).catch(() => {});
  };

  // ⋮ → Edit field opens the full CustomFieldCreateModal (name, type-locked,
  // options, required) — this is the one place that edits everything, not
  // just the name.
  const handleEditClick = () => {
    onCloseMenu();
    onEdit(column.field);
  };

  const handleRemoveClick = () => {
    if (hasValue) return;
    onCloseMenu();
    if (window.confirm(`Remove "${column.label}"? This cannot be undone.`)) onRemove(column.field);
  };

  const stickyStyle = {
    position: 'sticky',
    top: 0,
    zIndex: menuOpen ? 40 : (pinned ? 30 : 20),
    isolation: 'isolate',
    backgroundColor: '#faf5ff',
    ...(pinned ? { left: leftOffset ?? 0 } : {}),
  };

  return (
    <th ref={innerRef} className={pinned && isLastPinned ? 'border-r border-violet-200' : ''} style={stickyStyle}>
      <div className="relative flex items-center justify-between gap-1">
        {renaming ? (
          <input
            autoFocus
            className="input-field !py-1 !text-xs flex-1 min-w-0"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
            onBlur={commitRename}
          />
        ) : (
          <span
            className={`truncate ${isCustom ? 'cursor-text' : ''} select-none`}
            onDoubleClick={startRename}
            title={isCustom ? 'Double-click to rename' : undefined}
          >
            {column.label}
          </span>
        )}

        <div className="relative flex-shrink-0 flex items-center gap-0.5">
          {pinned && (
            <button
              type="button"
              onClick={() => onTogglePin(column.key)}
              className="w-5 h-5 flex items-center justify-center rounded text-violet-500 hover:bg-violet-100 transition-colors"
              title="Unpin column"
            >
              <Pin size={13} fill="currentColor" />
            </button>
          )}

          <button
            ref={triggerRef}
            type="button"
            onClick={onToggleMenu}
            className="w-5 h-5 flex items-center justify-center rounded text-violet-400 hover:bg-violet-100 hover:text-violet-700 transition-colors"
            title="Column options"
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-white border border-violet-100 rounded-lg shadow-lg py-1" style={{ zIndex: 100 }}>
              <button
                type="button"
                onClick={() => { onTogglePin(column.key); onCloseMenu(); }}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
              >
                {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                {pinned ? 'Unpin column' : 'Pin column'}
              </button>
              {isCustom && (
                <>
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
                  >
                    <Pencil size={14} />
                    Edit field
                  </button>
                  <button
                    type="button"
                    disabled={hasValue}
                    title={hasValue ? 'Cannot remove this field because it contains data.' : undefined}
                    onClick={handleRemoveClick}
                    className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs font-medium transition-colors ${hasValue ? 'text-violet-200 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`}
                  >
                    <Trash2 size={14} />
                    Remove field
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </th>
  );
};

export default LeadColumnHeader;