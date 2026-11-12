import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ChevronDown, Eye, MapPin, Table2,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import GlobalTab from '../../components/GlobalTable/GlobalTab';
import GlobalTable from '../../components/GlobalTable/GlobalTable';
import LeadSearchBar, { useLeadSearch } from '../../components/GlobalTable/LeadSearchBar';
import CrmTree, { buildTreeIndex } from '../../components/Crm/CrmTree';
import { getAssignableUsers } from '../../services/Userservice';
import { canAccessEdit } from '../../constants/modules';

/**
 * Leads page — the employee's way into their part of the product tree.
 *
 * Left:  CrmTree with "All my leads" + the products, locations, Mandals and
 *        tables from GET /leads/territory (admin/hr/manager see everything).
 * Right: "All my leads" -> the single Leads table; new leads pick Product +
 *        Mandal from the employee's assignments.
 *        a Mandal / table -> that Mandal's tables as tabs, one GlobalTable.
 *        a product / location -> the Mandals beneath it.
 * The backend enforces every scope rule; this page only mirrors it.
 */

const storageKey = (userId) => `leads.selection.${userId || 'anon'}`;

const readSelection = (userId) => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId)));
    return value && typeof value.kind === 'string' ? value : { kind: 'all' };
  } catch {
    return { kind: 'all' };
  }
};

const writeSelection = (userId, selection) => {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(selection)); } catch { /* storage unavailable */ }
};

function Breadcrumb({ product, path, table, onSelect }) {
  return (
    <nav aria-label="Location" className="flex items-center gap-1.5 flex-wrap text-xs">
      {product && (
        <button type="button" onClick={() => onSelect({ kind: 'product', id: String(product._id) })} className="font-semibold text-violet-500 hover:text-violet-700">
          {product.name}
        </button>
      )}
      {path.map((node, i) => (
        <span key={node._id} className="flex items-center gap-1.5">
          <span className="text-gray-300">›</span>
          <button
            type="button"
            onClick={() => onSelect({ kind: 'node', id: node._id })}
            className={`font-semibold ${i === path.length - 1 && !table ? 'text-gray-900' : 'text-violet-500 hover:text-violet-700'}`}
          >
            {node.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function MandalTable({ table, userLookup, onChanged, readOnly }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const requestId = useRef(0);

  // No paging in the UI: every page of the table (at most 100 per request) is loaded.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      // Keyed by _id: a record returned on two pages is kept once (duplicate row keys
      // make React leave stale rows on screen).
      const byId = new Map();
      for (let page = 1; ; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await api.get(`/global-tables/${table._id}/records`, { params: { page, limit: 100 } });
        if (id !== requestId.current) return;
        (data.records || []).forEach((item) => { if (item?.record?._id) byId.set(String(item.record._id), item.record); });
        if (!data.pagination?.hasNextPage) break;
      }
      setRecords([...byId.values()]);
    } catch (err) {
      if (id === requestId.current) toast.error(err.response?.data?.message || 'Failed to load table records');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [table._id]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onChanged?.(); };
  const search = useLeadSearch(records, userLookup);

  return (
    <section className="space-y-3" aria-label={`${table.name} table`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-gray-500">
          {loading && records.length === 0 ? ' ' : search.active
            ? `${search.filtered.length} of ${records.length} records`
            : `${records.length} record${records.length !== 1 ? 's' : ''}`}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2 w-full lg:w-auto">
          <LeadSearchBar {...search.barProps} />
          {!readOnly && <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>+ Create Lead</button>}
        </div>
      </div>
      <GlobalTable
        key={table._id}
        tableId={table._id}
        leads={search.filtered}
        userLookup={userLookup}
        loading={loading}
        onOpenCreateDrawer={() => setCreateOpen(true)}
        createDrawerOpen={createOpen}
        onCreateDrawerClose={() => setCreateOpen(false)}
        onLeadUpdated={(lead) => setRecords((rows) => rows.map((row) => (row._id === lead._id ? { ...row, ...lead } : row)))}
        onLeadDeleted={(leadId) => { setRecords((rows) => rows.filter((row) => row._id !== leadId)); refresh(); }}
        onLeadCreated={refresh}
        onRefreshLeads={refresh}
        showViews
        viewKey="crm.leads.view"
        readOnly={readOnly}
      />
    </section>
  );
}

export default function Lead() {
  const { user } = useAuth();
  // 'lead' module: view = see the leads; edit = create / change / delete them.
  const readOnly = !canAccessEdit(user, 'lead');
  const [territory, setTerritory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [selection, setSelection] = useState(() => readSelection(user?._id));
  const [treeOpenMobile, setTreeOpenMobile] = useState(false);

  const loadTerritory = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/leads/territory');
      setTerritory(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load your products and Mandals');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { loadTerritory(); }, [loadTerritory]);
  useEffect(() => { getAssignableUsers().then(setUsers).catch(() => setUsers([])); }, []);

  const index = useMemo(
    () => buildTreeIndex(territory?.products, territory?.locations, territory?.tables),
    [territory]
  );
  const userLookup = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);

  // "All my leads" is view + edit only. Its Mandal column is a dropdown of the
  // Mandals this user works in (name shown, full path on hover).
  const locationPicker = useMemo(() => ({
    mandalOptions: (territory?.mandals || [])
      .map((id) => index.nodes.get(String(id)))
      .filter(Boolean)
      .map((node) => ({ value: node._id, label: node.name, title: index.pathTo(node._id).map((n) => n.name).join(' › ') }))
      .sort((x, y) => x.title.localeCompare(y.title)),
  }), [territory, index]);

  // Drop a remembered selection that no longer exists in the territory.
  useEffect(() => {
    if (!territory) return;
    const exists = selection.kind === 'all'
      || (selection.kind === 'product' && index.productsById.has(String(selection.id)))
      || (selection.kind === 'node' && index.nodes.has(String(selection.id)))
      || (selection.kind === 'table' && index.tableById.has(String(selection.id)));
    if (!exists) setSelection({ kind: 'all' });
  }, [territory, index, selection]);

  const choose = (next) => {
    // A Mandal opens its first table straight away.
    if (next.kind === 'node' && index.isMandal(next.id)) {
      const first = (index.tablesAt.get(String(next.id)) || [])[0];
      if (first) next = { kind: 'table', id: first._id };
    }
    setSelection(next);
    writeSelection(user?._id, next);
    setTreeOpenMobile(false);
  };

  // "All my leads" row button: jump to the lead's own table (or its Mandal).
  const rowAction = useMemo(() => {
    const targetOf = (lead) => {
      const table = lead.globalTableId ? index.tableById.get(String(lead.globalTableId)) : null;
      if (table) {
        const mandal = index.nodes.get(table.location);
        return { selection: { kind: 'table', id: table._id }, label: `Open ${index.productsById.get(table.product)?.name || ''} › ${mandal?.name || ''} › ${table.name}` };
      }
      const nodeId = lead.productLocation ? String(lead.productLocation?._id || lead.productLocation) : null;
      const node = nodeId ? index.nodes.get(nodeId) : null;
      if (node) return { selection: { kind: 'node', id: node._id }, label: `Open ${index.productsById.get(node.product)?.name || ''} › ${node.name}` };
      return null;
    };
    return {
      label: (lead) => targetOf(lead)?.label || 'Open table',
      disabledReason: (lead) => (targetOf(lead) ? null : 'This lead has no Mandal yet — pick one in the Mandal column'),
      onClick: (lead) => { const target = targetOf(lead); if (target) choose(target.selection); },
    };
    // choose only depends on index/user, both covered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // What the right-hand side shows for the current selection.
  const view = useMemo(() => {
    if (selection.kind === 'table') {
      const table = index.tableById.get(String(selection.id));
      if (!table) return null;
      const path = index.pathTo(table.location);
      return { kind: 'table', table, path, product: index.productsById.get(table.product), siblings: index.tablesAt.get(table.location) || [] };
    }
    if (selection.kind === 'node') {
      const node = index.nodes.get(String(selection.id));
      if (!node) return null;
      return { kind: 'node', node, path: index.pathTo(node._id), product: index.productsById.get(node.product) };
    }
    if (selection.kind === 'product') {
      const product = index.productsById.get(String(selection.id));
      return product ? { kind: 'product', product, path: [] } : null;
    }
    return { kind: 'all' };
  }, [selection, index]);

  // Mandals under a product / location, for the "pick a Mandal" view.
  const mandalsUnder = (rootKey) => {
    const out = [];
    const walk = (key) => (index.children.get(key) || []).forEach((n) => {
      if (index.isMandal(n._id)) out.push(n);
      else walk(n._id);
    });
    walk(rootKey);
    return out;
  };

  const noTerritory = territory && territory.scope === 'territory' && !(territory.products || []).length;
  const currentLabel = view?.kind === 'table' ? `${view.path.at(-1)?.name || ''} · ${view.table.name}`
    : view?.kind === 'node' ? view.node.name
      : view?.kind === 'product' ? view.product.name
        : 'All my leads';

  const tree = (
    <CrmTree
      products={territory?.products || []}
      locations={territory?.locations || []}
      tables={territory?.tables || []}
      selection={selection}
      onSelect={choose}
      allLeads={{ label: 'All my leads', count: territory?.allLeadsCount }}
      loading={loading}
      error={error}
      onRetry={() => loadTerritory()}
      emptyMessage={territory?.scope === 'own' ? 'Product tables are available to sales roles.' : 'No products or Mandals assigned yet.'}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-violet-900 flex items-center gap-2">
            My Leads
            {readOnly && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2.5 py-0.5 text-xs font-semibold" title="You can see these leads but not create, change or delete them">
                <Eye size={13} /> View only
              </span>
            )}
          </h2>
          <p className="text-xs text-violet-500">
            {territory?.scope === 'all' ? 'Every product and Mandal.' : 'Your assigned products and Mandals.'}
          </p>
        </div>
        {territory?.canManageTree && view?.product && (
          <Link to={`/crm/products/${view.product._id}`} className="text-xs font-semibold text-violet-600 hover:text-violet-800 hover:underline">
            Manage this product →
          </Link>
        )}
      </div>

      {/* Mobile: the tree is a collapsible panel above the table. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setTreeOpenMobile((v) => !v)}
          aria-expanded={treeOpenMobile}
          className="w-full flex items-center justify-between gap-2 glass-card px-3 py-2 text-sm font-semibold text-violet-900"
        >
          <span className="flex items-center gap-2 min-w-0"><MapPin size={14} className="text-violet-500 shrink-0" /><span className="truncate">{currentLabel}</span></span>
          <ChevronDown size={16} className={`shrink-0 transition-transform ${treeOpenMobile ? 'rotate-180' : ''}`} />
        </button>
        {treeOpenMobile && <div className="glass-card p-3 mt-2 max-h-[60vh] overflow-y-auto">{tree}</div>}
      </div>

      {/* The sidebar card stretches to the height of the table panel; the tree inside stays in view while scrolling. */}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] items-stretch">
        <aside className="hidden lg:block glass-card p-3 self-stretch">
          <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-y-auto">
            {tree}
          </div>
        </aside>

        <main className="min-w-0 glass-card p-4 space-y-4">
          {noTerritory ? (
            <div className="py-12 text-center">
              <MapPin size={28} className="mx-auto text-violet-300" />
              <p className="mt-3 font-semibold text-violet-900">You haven&apos;t been assigned any products or Mandals yet.</p>
              <p className="text-sm text-violet-500 mt-1">Ask HR or your manager to assign them in your employee profile.</p>
            </div>
          ) : !view || view.kind === 'all' ? (
            <GlobalTab
              createdBy="me"
              title="All my leads"
              locationPicker={locationPicker}
              rowAction={rowAction}
              showViews
              viewKey="crm.allLeads.view"
              onLeadsChanged={() => loadTerritory({ quiet: true })}
              readOnly={readOnly}
            />
          ) : (
            <>
              <Breadcrumb product={view.product} path={view.path} table={view.kind === 'table' ? view.table : null} onSelect={choose} />

              {view.kind === 'table' && (
                <>
                  <div role="tablist" aria-label="Tables in this Mandal" className="flex gap-2 overflow-x-auto pb-1">
                    {view.siblings.map((t) => {
                      const active = t._id === view.table._id;
                      return (
                        <button
                          key={t._id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => choose({ kind: 'table', id: t._id })}
                          className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-violet-100 text-violet-700 hover:bg-violet-50'}`}
                        >
                          <Table2 size={13} className="text-amber-600" />
                          {t.name}
                          <span className="text-[10px] font-normal text-gray-500">{t.count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <MandalTable key={view.table._id} table={view.table} userLookup={userLookup} onChanged={() => loadTerritory({ quiet: true })} readOnly={readOnly} />
                </>
              )}

              {view.kind === 'node' && index.isMandal(view.node._id) && (
                <div className="py-12 text-center">
                  <Table2 size={28} className="mx-auto text-violet-300" />
                  <p className="mt-3 font-semibold text-violet-900">No tables in {view.node.name} yet.</p>
                  <p className="text-sm text-violet-500 mt-1">An admin, HR or a manager can add one from the Product page.</p>
                </div>
              )}

              {(view.kind === 'product' || (view.kind === 'node' && !index.isMandal(view.node._id))) && (() => {
                const mandals = mandalsUnder(view.kind === 'product' ? `root:${view.product._id}` : view.node._id);
                return mandals.length === 0 ? (
                  <p className="py-10 text-center text-sm text-violet-500">No Mandals here yet.</p>
                ) : (
                  <div>
                    <p className="text-xs text-violet-500 mb-2">Pick a Mandal to open its tables.</p>
                    {/* Same card layout as the location cards on the Product page. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {mandals.map((m) => {
                        const mTables = index.tablesAt.get(m._id) || [];
                        const leads = mTables.reduce((n, t) => n + (t.count || 0), 0);
                        const open = () => choose({ kind: 'node', id: m._id });
                        return (
                          <div
                            key={m._id}
                            onClick={open}
                            className="glass-card p-4 cursor-pointer hover:shadow-md transition-all min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <MapPin size={16} className="text-violet-400 flex-shrink-0" />
                              <h3 className="font-bold text-gray-900 truncate" title={m.name}>{m.name}</h3>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 truncate">
                              {index.pathTo(m._id).slice(0, -1).map((n) => n.name).join(' › ') || view.product?.name}
                            </p>

                            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-2xl font-bold text-violet-700 leading-none">{leads}</p>
                                <p className="text-[10px] text-gray-500 mt-1">lead{leads !== 1 ? 's' : ''}</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-gray-700 leading-none">{mTables.length}</p>
                                <p className="text-[10px] text-gray-500 mt-1">table{mTables.length !== 1 ? 's' : ''}</p>
                              </div>
                            </div>

                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); open(); }}
                                className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                              >
                                Open →
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
