import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, MoreVertical, Pencil, Pin, Trash2 } from 'lucide-react';

/**
 * Menu is rendered in a portal with fixed positioning, anchored to the ⋮
 * button, so the table's overflow container can never clip it.
 * It closes on outside click, Escape, resize and scroll.
 */
const HeaderMenu = ({ anchorRef, items, onClose }) => {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 208;
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 208, zIndex: 60 }}
      className="bg-white border border-violet-100 rounded-lg shadow-lg py-1 text-xs"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => { onClose(); item.onClick(); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            item.danger ? 'text-red-600 hover:bg-red-50' : 'text-violet-700 hover:bg-violet-50'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
};

/**
 * One column header.
 *  - Native Lead columns: pin / move only (no edit, no delete: they are not Global Table fields)
 *  - Custom fields: pin / edit / move / delete
 */
const GlobalTableHeader = ({
  col, pinned, leftOffset, isLastPinned, canMoveLeft, canMoveRight,
  onTogglePin, onMove, onEdit, onDelete, innerRef,
}) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  const items = [
    { label: pinned ? 'Unpin column' : 'Pin column', icon: <Pin size={13} />, onClick: () => onTogglePin(col.key) },
    ...(col.source === 'custom' && !col.systemManaged && onEdit
      ? [{ label: 'Edit field', icon: <Pencil size={13} />, onClick: () => onEdit(col.field) }]
      : []),
    { label: 'Move left', icon: <ArrowLeft size={13} />, disabled: !canMoveLeft, onClick: () => onMove(col.key, -1) },
    { label: 'Move right', icon: <ArrowRight size={13} />, disabled: !canMoveRight, onClick: () => onMove(col.key, 1) },
    ...(col.source === 'custom' && !col.systemManaged && onDelete
      ? [{ label: 'Delete field', icon: <Trash2 size={13} />, danger: true, onClick: () => onDelete(col.field) }]
      : []),
  ];

  return (
    <th
      ref={innerRef}
      scope="col"
      style={{
        minWidth: col.width,
        position: 'sticky',
        top: 0,
        zIndex: pinned ? 40 : 30,
        ...(pinned ? { left: leftOffset ?? 0 } : {}),
      }}
      className={`bg-violet-50 ${isLastPinned ? 'border-r border-violet-200' : ''}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 min-w-0">
          <span className="truncate uppercase tracking-wide">{col.label}</span>
          {pinned && <Pin size={11} className="text-violet-500 shrink-0" aria-label="Pinned" />}
        </span>
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${col.label} column menu`}
          onClick={() => setOpen((o) => !o)}
          className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-violet-400 hover:bg-violet-100 hover:text-violet-700"
        >
          <MoreVertical size={13} />
        </button>
      </div>
      {open && <HeaderMenu anchorRef={btnRef} items={items} onClose={() => setOpen(false)} />}
    </th>
  );
};

export default memo(GlobalTableHeader);