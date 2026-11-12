import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronRight, Loader2, MapPin, Package, RefreshCw, Search, X } from "lucide-react";
import api from "../../utils/api";

/**
 * ProductMandalAssignment — checkbox tree for an employee's CRM data scope.
 *
 * value:    [{ product, mandals: [locationId] }]  (only leaf IDs are stored)
 * onChange: (next array) => void
 *
 * Tree:  Product → Location → … (any depth) → Mandal (a location with no
 *        sub-locations). Loaded once from GET /employees/assignment-options.
 *
 * Behavior:
 *  - Ticking any parent (product, location, sub-location) adds every Mandal
 *    beneath it; unticking removes them. Branches are independent.
 *  - Parent state is derived from its Mandals: all → checked, some →
 *    indeterminate, none → unchecked. Parents themselves are never stored.
 *  - Expand/collapse is separate state and never touches the selection.
 *  - Saved IDs that are no longer assignable Mandals (deleted, product
 *    inactivated, or the node gained sub-locations) are dropped on load.
 */

function TriCheckbox({ state, onChange, disabled, label }) {
    const ref = useRef(null);

    useEffect(() => {
        if (ref.current) ref.current.indeterminate = state === "partial";
    }, [state]);

    return (
        <input
            ref={ref}
            type="checkbox"
            aria-label={label}
            checked={state === "all"}
            disabled={disabled}
            onChange={onChange}
            className="w-4 h-4 shrink-0 rounded border-violet-300 text-violet-600 accent-violet-600 focus:ring-violet-400 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        />
    );
}

const stateOf = (selectedCount, total) =>
    total === 0 || selectedCount === 0 ? "none" : selectedCount === total ? "all" : "partial";

// Build lookup tables for every product's location tree from the flat list.
function buildTree(products, locations) {
    const nodes = new Map();
    const children = new Map(); // parentId | `root:${productId}` -> [nodeId]

    locations.forEach((l) => {
        nodes.set(String(l._id), { id: String(l._id), name: l.name, parent: l.parent ? String(l.parent) : null, product: String(l.product) });
    });

    nodes.forEach((n) => {
        // A parent outside this product's tree (or missing) makes the node a root.
        const parent = n.parent && nodes.get(n.parent)?.product === n.product ? n.parent : null;
        const key = parent || `root:${n.product}`;
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(n.id);
    });

    const leavesUnder = new Map(); // nodeId -> [leafId]
    const leafToProduct = new Map();
    const productLeaves = new Map();

    const collect = (id, seen) => {
        if (leavesUnder.has(id)) return leavesUnder.get(id);
        if (seen.has(id)) return []; // defensive: break a corrupt parent cycle
        seen.add(id);
        const kids = children.get(id) || [];
        const leaves = kids.length ? kids.flatMap((k) => collect(k, seen)) : [id];
        if (!kids.length) leafToProduct.set(id, nodes.get(id).product);
        leavesUnder.set(id, leaves);
        return leaves;
    };

    products.forEach((p) => {
        const pid = String(p._id);
        const roots = children.get(`root:${pid}`) || [];
        productLeaves.set(pid, roots.flatMap((r) => collect(r, new Set())));
    });

    return { nodes, children, leavesUnder, leafToProduct, productLeaves };
}

export default function ProductMandalAssignment({ value = [], onChange }) {
    const [options, setOptions] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState(() => new Set());
    const [query, setQuery] = useState("");

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await api.get("/employees/assignment-options");
            setOptions({
                products: res.data?.products || [],
                locations: res.data?.locations || [],
            });
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load products");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const tree = useMemo(
        () => (options ? buildTree(options.products, options.locations) : null),
        [options]
    );

    const selected = useMemo(
        () => new Set((Array.isArray(value) ? value : []).flatMap((a) => (a.mandals || []).map(String))),
        [value]
    );

    // Group a set of Mandal IDs back under their products, in product order.
    const emit = (nextSelected) => {
        const byProduct = new Map();
        nextSelected.forEach((id) => {
            const pid = tree.leafToProduct.get(id);
            if (!pid) return;
            if (!byProduct.has(pid)) byProduct.set(pid, []);
            byProduct.get(pid).push(id);
        });
        onChange(
            options.products
                .map((p) => String(p._id))
                .filter((pid) => byProduct.has(pid))
                .map((pid) => ({ product: pid, mandals: byProduct.get(pid) }))
        );
    };

    // Drop saved IDs that are no longer assignable Mandals (edit mode).
    useEffect(() => {
        if (!tree) return;
        const stale = [...selected].filter((id) => !tree.leafToProduct.has(id));
        if (stale.length) {
            emit(new Set([...selected].filter((id) => tree.leafToProduct.has(id))));
            toast(`${stale.length} previously assigned Mandal${stale.length > 1 ? "s are" : " is"} no longer available and was removed`, { icon: "ℹ️" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tree, selected]);

    const toggleLeaves = (leaves, currentState) => {
        const next = new Set(selected);
        if (currentState === "all") leaves.forEach((id) => next.delete(id));
        else leaves.forEach((id) => next.add(id));
        emit(next);
    };

    const toggleExpanded = (key) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // Search: a node is shown when it, a descendant, or an ancestor matches.
    const q = query.trim().toLowerCase();
    const subtreeMatch = useMemo(() => {
        if (!tree || !q) return null;
        const memo = new Map();
        const visit = (id) => {
            if (memo.has(id)) return memo.get(id);
            memo.set(id, false);
            const kidsMatch = (tree.children.get(id) || []).map(visit).some(Boolean);
            const match = tree.nodes.get(id).name.toLowerCase().includes(q) || kidsMatch;
            memo.set(id, match);
            return match;
        };
        tree.nodes.forEach((_, id) => visit(id));
        return memo;
    }, [tree, q]);

    const countSelected = (leaves) => leaves.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0);

    const renderNode = (id, ancestorMatched) => {
        const node = tree.nodes.get(id);
        const kids = tree.children.get(id) || [];
        const isLeaf = kids.length === 0;

        if (subtreeMatch && !ancestorMatched && !subtreeMatch.get(id)) return null;

        const selfMatch = q && node.name.toLowerCase().includes(q);
        const childMatches = subtreeMatch && kids.some((k) => subtreeMatch.get(k));
        const isOpen = expanded.has(id) || Boolean(childMatches && !ancestorMatched);

        const leaves = tree.leavesUnder.get(id) || [];
        const sel = countSelected(leaves);
        const state = stateOf(sel, leaves.length);

        return (
            <div key={id}>
                <div
                    className="flex items-center gap-1.5 py-1 pl-1 pr-2 rounded-lg hover:bg-violet-50 transition-colors"
                >
                    {isLeaf ? (
                        <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                            <MapPin className="w-3 h-3 text-violet-300" />
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => toggleExpanded(id)}
                            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
                            className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-violet-400 hover:text-violet-700 hover:bg-violet-100"
                        >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                    )}

                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                        <TriCheckbox state={state} label={node.name} onChange={() => toggleLeaves(leaves, state)} />
                        <span className={`text-xs truncate ${isLeaf ? "text-violet-800" : "font-semibold text-violet-900"} ${selfMatch ? "bg-amber-100 rounded px-0.5" : ""}`}>
                            {node.name}
                        </span>
                    </label>

                    {!isLeaf && (
                        <span className={`text-[10px] shrink-0 tabular-nums rounded-full px-1.5 py-0.5 ${sel ? "bg-violet-100 text-violet-700 font-semibold" : "text-violet-400"}`}>
                            {sel}/{leaves.length}
                        </span>
                    )}
                </div>

                {!isLeaf && isOpen && (
                    <div className="ml-3.5 pl-1 border-l border-violet-100">
                        {kids.map((k) => renderNode(k, ancestorMatched || selfMatch))}
                    </div>
                )}
            </div>
        );
    };

    const totalSelected = selected.size;
    const productsWithSelection = (Array.isArray(value) ? value : []).filter((a) => a.mandals?.length).length;

    return (
        <div className="border border-violet-100 rounded-xl p-3 bg-violet-50/30">
            <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                    <p className="text-xs font-semibold text-violet-800">Product &amp; Mandal Assignment</p>
                    <p className="text-[11px] text-violet-500 mt-0.5">
                        Tick a product or location to assign every Mandal under it. Mandals added later are not assigned automatically.
                    </p>
                </div>
                {totalSelected > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        className="text-[11px] text-violet-500 hover:text-violet-700 underline underline-offset-2 shrink-0"
                    >
                        Clear all
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2 mb-2">
                <span
                    className={`text-[11px] rounded-full px-2 py-0.5 ${totalSelected ? "bg-violet-600 text-white font-semibold" : "bg-white border border-violet-200 text-violet-500"}`}
                >
                    {totalSelected
                        ? `${totalSelected} Mandal${totalSelected > 1 ? "s" : ""} · ${productsWithSelection} product${productsWithSelection > 1 ? "s" : ""}`
                        : "No Mandals assigned"}
                </span>
            </div>

            {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-xs text-violet-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading products…
                </div>
            )}

            {!loading && error && (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <p className="text-xs text-red-600">{error}</p>
                    <button
                        type="button"
                        onClick={load}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg px-2.5 py-1 hover:bg-violet-50"
                    >
                        <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                </div>
            )}

            {!loading && !error && tree && options.products.length === 0 && (
                <p className="text-xs text-violet-500 text-center py-6">No active products available. Create products in the CRM first.</p>
            )}

            {!loading && !error && tree && options.products.length > 0 && (
                <>
                    <div className="relative mb-2">
                        <Search className="w-3.5 h-3.5 text-violet-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search products, locations or Mandals"
                            className="w-full border border-violet-200 rounded-xl pl-8 pr-8 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-violet-400 hover:text-violet-700"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                        {(() => {
                            const rendered = options.products.map((p) => {
                                const pid = String(p._id);
                                const roots = tree.children.get(`root:${pid}`) || [];
                                const productMatch = Boolean(q) && p.name.toLowerCase().includes(q);
                                const anyNodeMatch = subtreeMatch && roots.some((r) => subtreeMatch.get(r));
                                if (q && !productMatch && !anyNodeMatch) return null;

                                const leaves = tree.productLeaves.get(pid) || [];
                                const sel = countSelected(leaves);
                                const state = stateOf(sel, leaves.length);
                                const key = `p:${pid}`;
                                const isOpen = expanded.has(key) || Boolean(anyNodeMatch && !productMatch);

                                return (
                                    <div key={pid} className="bg-white border border-violet-100 rounded-xl">
                                        <div className="flex items-center gap-2 px-2 py-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(key)}
                                                disabled={roots.length === 0}
                                                aria-label={isOpen ? `Collapse ${p.name}` : `Expand ${p.name}`}
                                                className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-violet-500 hover:text-violet-800 hover:bg-violet-100 disabled:opacity-30"
                                            >
                                                <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                            </button>
                                            <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                                                <TriCheckbox
                                                    state={state}
                                                    label={p.name}
                                                    disabled={leaves.length === 0}
                                                    onChange={() => toggleLeaves(leaves, state)}
                                                />
                                                <Package className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                                <span className={`text-sm font-semibold text-violet-900 truncate ${productMatch ? "bg-amber-100 rounded px-0.5" : ""}`}>
                                                    {p.name}
                                                </span>
                                            </label>
                                            <span
                                                className={`text-[10px] shrink-0 tabular-nums rounded-full px-2 py-0.5 ${leaves.length === 0 ? "text-violet-300" : sel ? "bg-violet-600 text-white font-semibold" : "bg-violet-50 text-violet-500"}`}
                                            >
                                                {leaves.length === 0 ? "No Mandals" : `${sel}/${leaves.length} Mandals`}
                                            </span>
                                        </div>

                                        {isOpen && roots.length > 0 && (
                                            <div className="px-1.5 pb-2 border-t border-violet-50 pt-1">
                                                {roots.map((r) => renderNode(r, productMatch))}
                                            </div>
                                        )}
                                    </div>
                                );
                            });

                            return rendered.some(Boolean) ? rendered : (
                                <p className="text-xs text-violet-500 text-center py-6">No products or locations match “{query}”.</p>
                            );
                        })()}
                    </div>
                </>
            )}
        </div>
    );
}
