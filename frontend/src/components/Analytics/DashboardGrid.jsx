import { useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import WidgetCard from './WidgetCard';

const Grid = WidthProvider(Responsive);

export const COLS = 12;
const ROW_HEIGHT = 56;
const BREAKPOINTS = { lg: 768, xs: 0 };

/** Starting size [w, h] of a widget added to a dashboard. */
const SIZES = {
  score: [3, 3], growth: [3, 4], ranking: [4, 6], bar: [6, 6], donut: [4, 6], line: [6, 6], area: [6, 6], butterfly: [6, 6], table: [12, 7], funnel: [4, 6],
};
export const defaultSize = (chartType) => SIZES[chartType] || [6, 6];

/** First free spot (top to bottom, left to right) for a w × h widget. */
export function findSpot(layouts, w, h) {
  const hit = (x, y) => layouts.some((l) => x < l.x + l.w && x + w > l.x && y < l.y + l.h && y + h > l.y);
  const bottom = layouts.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= COLS; x += 1) if (!hit(x, y)) return { x, y };
  }
  return { x: 0, y: bottom };
}

/**
 * Dashboard widgets on a 12-column grid (react-grid-layout).
 *   items     [{ id, widget, layout: { x, y, w, h } }]
 *   editing   drag by the card header, resize from the corner
 *   onLayout  (items with new layouts) while editing
 * Phones (< 768px) get one column in layout order and cannot be edited.
 */
export default function DashboardGrid({
  items, filters, editing, onLayout, onEditWidget, onRemove, onBreakpoint,
}) {
  const layouts = useMemo(() => {
    const lg = items.map((it) => ({
      i: it.id, ...it.layout, minW: 2, minH: 2, maxH: 40,
    }));
    let y = 0;
    const xs = [...lg]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((l) => {
        const out = { i: l.i, x: 0, y, w: 1, h: Math.max(l.h, 4) };
        y += out.h;
        return out;
      });
    return { lg, xs };
  }, [items]);

  const handleLayout = (current, all) => {
    if (!editing || !all.lg) return;
    const byId = new Map(all.lg.map((l) => [l.i, l]));
    let changed = false;
    const next = items.map((it) => {
      const l = byId.get(it.id);
      if (!l) return it;
      const layout = {
        x: l.x, y: l.y, w: l.w, h: l.h,
      };
      if (layout.x !== it.layout.x || layout.y !== it.layout.y || layout.w !== it.layout.w || layout.h !== it.layout.h) changed = true;
      return { ...it, layout };
    });
    if (changed) onLayout(next);
  };

  return (
    <Grid
      className={`analytics-grid ${editing ? 'is-editing' : ''}`}
      layouts={layouts}
      breakpoints={BREAKPOINTS}
      cols={{ lg: COLS, xs: 1 }}
      rowHeight={ROW_HEIGHT}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      compactType="vertical"
      isDraggable={editing}
      isResizable={editing}
      draggableHandle=".widget-drag"
      draggableCancel=".widget-no-drag"
      resizeHandles={['se']}
      onLayoutChange={handleLayout}
      onBreakpointChange={(bp) => onBreakpoint?.(bp)}
      useCSSTransforms
    >
      {items.map((it) => (
        <div key={it.id}>
          <WidgetCard widget={it.widget} filters={filters} fill editing={editing}
            onEdit={onEditWidget} onRemove={() => onRemove(it.id)} />
        </div>
      ))}
    </Grid>
  );
}
