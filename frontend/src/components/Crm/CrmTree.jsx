import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, MapPin, Package, RefreshCw, Search, Star, Table2, X } from 'lucide-react';

/**
 * CrmTree — the Product → Location → … → Mandal → Table navigator shared by
 * the Product Detail page (whole tree, for admin / hr / manager) and the
 * Leads page (only the employee's territory).
 *
 * Data comes flat, as GET /leads/territory returns it:
 *   products  [{ _id, name }]
 *   locations [{ _id, name, parent, product }]
 *   tables    [{ _id, name, product, location, count }]
 *
 * selection: { kind: 'all' } | { kind: 'product', id } | { kind: 'node', id } | { kind: 'table', id }
 * onSelect(selection, { product, path, table }) — path is root-first location nodes.
 *
 * singleProductId: render one product's locations at the top level (no product rows).
 * allLeads: { label, count } shows the pinned "All my leads" entry.
 */

const keyOf = (id) => String(id);

export function buildTreeIndex(products = [], locations = [], tables = []) {
  const nodes = new Map(locations.map((l) => [keyOf(l._id), { ...l, _id: keyOf(l._id), parent: l.parent ? keyOf(l.parent) : null, product: keyOf(l.product) }]));
  const children = new Map(); // parentId | `root:${productId}` -> [node]
  nodes.forEach((n) => {
    const parent = n.parent && nodes.has(n.parent) ? n.parent : null;
    const key = parent || `root:${n.product}`;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(n);
  });
  children.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

  const tablesAt = new Map();
  tables.forEach((t) => {
    const key = keyOf(t.location);
    if (!tablesAt.has(key)) tablesAt.set(key, []);
    tablesAt.get(key).push({ ...t, _id: keyOf(t._id), product: keyOf(t.product), location: key });
  });
  tablesAt.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

  const productsById = new Map(products.map((p) => [keyOf(p._id), p]));

  const pathTo = (id) => {
    const out = [];
    const seen = new Set();
    let current = nodes.get(keyOf(id));
    while (current && !seen.has(current._id)) {
      seen.add(current._id);
      out.unshift(current);
      current = current.parent ? nodes.get(current.parent) : null;
    }
    return out;
  };

  const tableById = new Map();
  tablesAt.forEach((list) => list.forEach((t) => tableById.set(t._id, t)));

  const isMandal = (id) => !(children.get(keyOf(id)) || []).length;

  return { nodes, children, tablesAt, productsById, pathTo, tableById, isMandal };
}

const rowBase = 'w-full flex items-center gap-1.5 rounded-lg pr-2 py-1.5 text-left text-xs transition-colors';
const rowState = (active) => (active ? 'bg-violet-600 text-white' : 'text-violet-900 hover:bg-violet-50');

export default function CrmTree({
  products = [],
  locations = [],
  tables = [],
  selection,
  onSelect,
  singleProductId,
  allLeads,
  loading = false,
  error = '',
  onRetry,
  emptyMessage = 'Nothing here yet.',
}) {
  const index = useMemo(() => buildTreeIndex(products, locations, tables), [products, locations, tables]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Open the branch that holds the current selection (e.g. restored from storage).
  useEffect(() => {
    if (!selection || selection.kind === 'all') return;
    const open = [];
    if (selection.kind === 'product') open.push(`p:${selection.id}`);
    const nodeId = selection.kind === 'table' ? index.tableById.get(keyOf(selection.id))?.location : selection.kind === 'node' ? selection.id : null;
    if (nodeId) {
      const path = index.pathTo(nodeId);
      if (path[0]) open.push(`p:${path[0].product}`);
      path.forEach((n) => open.push(n._id));
    }
    if (open.length) setExpanded((prev) => new Set([...prev, ...open]));
  }, [selection, index]);

  // Search: keep a node when it, a descendant, or one of its tables matches.
  const matches = useMemo(() => {
    if (!q) return null;
    const memo = new Map();
    const visit = (id) => {
      if (memo.has(id)) return memo.get(id);
      memo.set(id, false);
      const node = index.nodes.get(id);
      const self = node.name.toLowerCase().includes(q)
        || (index.tablesAt.get(id) || []).some((t) => t.name.toLowerCase().includes(q));
      const kids = (index.children.get(id) || []).map((c) => visit(c._id)).some(Boolean);
      memo.set(id, self || kids);
      return self || kids;
    };
    index.nodes.forEach((_, id) => visit(id));
    return memo;
  }, [index, q]);

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const select = (sel, ctx) => onSelect?.(sel, ctx);

  const renderTables = (node, depth) => (index.tablesAt.get(node._id) || [])
    .filter((t) => !q || t.name.toLowerCase().includes(q) || node.name.toLowerCase().includes(q))
    .map((t) => {
      const active = selection?.kind === 'table' && keyOf(selection.id) === t._id;
      return (
        <button
          key={t._id}
          type="button"
          onClick={() => select({ kind: 'table', id: t._id }, { product: index.productsById.get(t.product), path: index.pathTo(node._id), table: t })}
          className={`${rowBase} ${rowState(active)}`}
          style={{ paddingLeft: depth * 14 + 26 }}
          aria-current={active ? 'true' : undefined}
        >
          <Table2 size={13} className={active ? 'text-white' : 'text-amber-600'} />
          <span className="truncate flex-1">{t.name}</span>
          {typeof t.count === 'number' && (
            <span className={`text-[10px] tabular-nums rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-violet-50 text-violet-500'}`}>{t.count}</span>
          )}
        </button>
      );
    });

  const renderNode = (node, depth) => {
    if (matches && !matches.get(node._id)) return null;
    const kids = index.children.get(node._id) || [];
    const nodeTables = index.tablesAt.get(node._id) || [];
    const mandal = kids.length === 0;
    const hasContent = kids.length > 0 || nodeTables.length > 0;
    const open = expanded.has(node._id) || Boolean(q);
    const active = selection?.kind === 'node' && keyOf(selection.id) === node._id;

    return (
      <div key={node._id}>
        <div className={`${rowBase} ${rowState(active)} !p-0`}>
          <span style={{ width: depth * 14 + 6 }} className="shrink-0" />
          {hasContent ? (
            <button
              type="button"
              onClick={() => toggle(node._id)}
              aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
              aria-expanded={open}
              className={`w-5 h-6 shrink-0 flex items-center justify-center rounded ${active ? 'text-white' : 'text-violet-400 hover:text-violet-700'}`}
            >
              <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
          ) : <span className="w-5 shrink-0" />}
          <button
            type="button"
            onClick={() => {
              select({ kind: 'node', id: node._id }, { product: index.productsById.get(node.product), path: index.pathTo(node._id) });
              if (hasContent && !expanded.has(node._id)) toggle(node._id);
            }}
            className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5 pr-2 text-left"
            aria-current={active ? 'true' : undefined}
          >
            {mandal && <MapPin size={12} className={active ? 'text-white' : 'text-violet-400'} />}
            <span className={`truncate ${mandal ? '' : 'font-semibold'}`}>{node.name}</span>
            {mandal && nodeTables.length > 0 && (
              <span className={`ml-auto text-[10px] ${active ? 'text-white/80' : 'text-violet-400'}`}>{nodeTables.length} table{nodeTables.length > 1 ? 's' : ''}</span>
            )}
          </button>
        </div>
        {open && (
          <div>
            {kids.map((k) => renderNode(k, depth + 1))}
            {renderTables(node, depth)}
          </div>
        )}
      </div>
    );
  };

  const productList = singleProductId
    ? products.filter((p) => keyOf(p._id) === keyOf(singleProductId))
    : products;

  const visibleProducts = productList.filter((p) => {
    if (!q) return true;
    if (p.name.toLowerCase().includes(q)) return true;
    return (index.children.get(`root:${keyOf(p._id)}`) || []).some((r) => matches?.get(r._id));
  });

  return (
    <div className="flex flex-col min-h-0">
      <div className="relative mb-2">
        <Search size={13} className="text-violet-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Mandal / table"
          aria-label="Search the tree"
          className="w-full border border-violet-200 rounded-xl pl-8 pr-7 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-violet-400 hover:text-violet-700">
            <X size={13} />
          </button>
        )}
      </div>

      {allLeads && (
        <>
          <button
            type="button"
            onClick={() => select({ kind: 'all' }, {})}
            className={`${rowBase} ${rowState(selection?.kind === 'all')} px-2 font-semibold`}
            aria-current={selection?.kind === 'all' ? 'true' : undefined}
          >
            <Star size={13} className={selection?.kind === 'all' ? 'text-white' : 'text-amber-500'} />
            <span className="flex-1 truncate">{allLeads.label || 'All my leads'}</span>
            {typeof allLeads.count === 'number' && (
              <span className={`text-[10px] tabular-nums rounded-full px-1.5 ${selection?.kind === 'all' ? 'bg-white/20' : 'bg-violet-50 text-violet-500'}`}>{allLeads.count}</span>
            )}
          </button>
          <div className="my-2 border-t border-violet-100" />
        </>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-violet-500">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-xs text-red-600">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg px-2.5 py-1 hover:bg-violet-50">
              <RefreshCw size={12} /> Retry
            </button>
          )}
        </div>
      ) : visibleProducts.length === 0 ? (
        <p className="text-xs text-violet-500 text-center py-6">{q ? `Nothing matches “${query}”.` : emptyMessage}</p>
      ) : (
        <nav aria-label="Products and locations" className="space-y-0.5 overflow-y-auto">
          {visibleProducts.map((p) => {
            const pid = keyOf(p._id);
            const roots = index.children.get(`root:${pid}`) || [];
            if (singleProductId) {
              return roots.length
                ? roots.map((r) => renderNode(r, 0))
                : <p key={pid} className="text-xs text-violet-500 text-center py-6">{emptyMessage}</p>;
            }
            const key = `p:${pid}`;
            const open = expanded.has(key) || Boolean(q);
            const active = selection?.kind === 'product' && keyOf(selection.id) === pid;
            return (
              <div key={pid}>
                <div className={`${rowBase} ${rowState(active)} !p-0`}>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-label={open ? `Collapse ${p.name}` : `Expand ${p.name}`}
                    aria-expanded={open}
                    className={`w-6 h-7 shrink-0 flex items-center justify-center rounded ${active ? 'text-white' : 'text-violet-500 hover:text-violet-800'}`}
                  >
                    <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { select({ kind: 'product', id: pid }, { product: p, path: [] }); if (!open) toggle(key); }}
                    className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5 pr-2 text-left font-bold text-[13px]"
                  >
                    <Package size={13} className={active ? 'text-white' : 'text-violet-500'} />
                    <span className="truncate">{p.name}</span>
                  </button>
                </div>
                {open && roots.map((r) => renderNode(r, 1))}
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
