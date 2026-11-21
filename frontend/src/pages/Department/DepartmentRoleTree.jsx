import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ShieldCheck,
    Crown,
    UserCog,
    Plus,
    Trash2,
    Save,
    Loader2,
    Users,
    Lock,
    RotateCcw,
    GitBranch,
    AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../../utils/api";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

// Project-module sub-features a role gets by default inside this department.
const ACCESS_KEYS = [
    { key: "moduleTree", label: "Module Tree", short: "Tree", hint: "Module cards and their links" },
    { key: "tasks", label: "Tasks & Plans", short: "Tasks", hint: "Tasks, plans and milestones" },
    { key: "bugs", label: "Bug Sheet", short: "Bugs", hint: "Report and work on bugs" },
    { key: "timeline", label: "Timeline", short: "Gantt", hint: "Gantt view" },
];
const LEVELS = ["none", "view", "edit"];
const LEVEL_STYLES = {
    none: "bg-gray-100 text-gray-500 border-gray-200",
    view: "bg-sky-50 text-sky-700 border-sky-200",
    edit: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const DEFAULT_ACCESS = { moduleTree: "view", tasks: "view", bugs: "view", timeline: "view" };

// "team-lead" -> "Team Lead", "technical_associate" -> "Technical Associate"
const roleLabel = (role) =>
    String(role || "")
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");

const normalizeRole = (role) => String(role || "").trim().toLowerCase().replace(/\s+/g, " ");

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

const FixedNode = ({ icon: Icon, title, subtitle, tone }) => (
    <div className={`inline-flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${tone}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
            <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="text-[11px] opacity-75 truncate">{subtitle}</p>
        </div>
        <Lock className="h-3.5 w-3.5 opacity-50 ml-1" aria-label="Fixed role" />
    </div>
);

const AccessDots = ({ access }) => (
    <div className="flex items-center gap-1 mt-1.5">
        {ACCESS_KEYS.map(({ key, label, short }) => {
            const level = access?.[key] || "none";
            return (
                <span
                    key={key}
                    title={`${label}: ${level}`}
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none ${LEVEL_STYLES[level]} ${level === "none" ? "line-through" : ""}`}
                >
                    {short}
                </span>
            );
        })}
    </div>
);

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

const DepartmentRoleTree = ({ departmentId, onSaved }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [tree, setTree] = useState([]);
    const [savedTree, setSavedTree] = useState([]);
    const [head, setHead] = useState(null);
    const [memberCounts, setMemberCounts] = useState({});
    const [canManage, setCanManage] = useState(false);
    const [roleOptions, setRoleOptions] = useState([]);
    const [selected, setSelected] = useState(null);
    const [stranded, setStranded] = useState([]);

    const [addOpen, setAddOpen] = useState(false);
    const [newRole, setNewRole] = useState("");
    const [newParent, setNewParent] = useState("");

    const applyResponse = (data) => {
        const t = (data.roleTree || []).map((n) => ({ ...n, projectAccess: { ...DEFAULT_ACCESS, ...(n.projectAccess || {}) } }));
        setTree(t);
        setSavedTree(t);
        setHead(data.head || null);
        setMemberCounts(data.memberCounts || {});
        setCanManage(Boolean(data.canManage));
    };

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const [treeRes, optRes] = await Promise.all([
                api.get(`/departments/${departmentId}/role-tree`),
                api.get("/departments/roles/options"),
            ]);
            applyResponse(treeRes.data);
            setRoleOptions(optRes.data.roles || []);
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to load roles");
        } finally {
            setLoading(false);
        }
    }, [departmentId]);

    useEffect(() => {
        load();
    }, [load]);

    const dirty = useMemo(() => JSON.stringify(tree) !== JSON.stringify(savedTree), [tree, savedTree]);
    const byRole = useMemo(() => new Map(tree.map((n) => [n.role, n])), [tree]);
    const childrenOf = useCallback(
        (parent) => tree.filter((n) => (n.parentRole || null) === parent).sort((a, b) => a.order - b.order),
        [tree]
    );

    // Roles in the department whose role isn't in the tree yet (useful hint).
    const unlistedMemberRoles = useMemo(
        () => Object.keys(memberCounts).filter((r) => !["admin", "manager"].includes(r) && !byRole.has(r)),
        [memberCounts, byRole]
    );

    // Loop-proof: a role is never visited twice, even if the edit state
    // somehow contains a parent cycle.
    const descendantsOf = useCallback(
        (role) => {
            const out = new Set();
            const walk = (r) => childrenOf(r).forEach((c) => {
                if (out.has(c.role) || c.role === role) return;
                out.add(c.role);
                walk(c.role);
            });
            walk(role);
            return out;
        },
        [childrenOf]
    );

    // Roles reachable from the Manager root; anything else is stuck in a loop
    // or points at a missing parent and is listed separately so it can be fixed.
    const reachable = useMemo(() => {
        const seen = new Set();
        const walk = (parent) => childrenOf(parent).forEach((c) => {
            if (seen.has(c.role)) return;
            seen.add(c.role);
            walk(c.role);
        });
        walk(null);
        return seen;
    }, [childrenOf]);
    const unreachable = useMemo(() => tree.filter((n) => !reachable.has(n.role)), [tree, reachable]);

    /** Would giving `role` this parent create a loop? */
    const createsLoop = (role, parentRole) =>
        Boolean(parentRole) && (parentRole === role || descendantsOf(role).has(parentRole));

    /* ---------------- tree edits (local until Save) ---------------- */

    const addRole = () => {
        const role = normalizeRole(newRole);
        if (!role) return toast.error("Enter or pick a role");
        if (["admin", "manager"].includes(role)) return toast.error("Admin and Manager are fixed top roles");
        if (byRole.has(role)) return toast.error("That role is already in the tree");
        if (newParent && !byRole.has(newParent)) return toast.error("Pick who this role reports to again");
        setTree((t) => [
            ...t,
            { role, parentRole: newParent || null, order: t.length, projectAccess: { ...DEFAULT_ACCESS } },
        ]);
        setSelected(role);
        setNewRole("");
        setAddOpen(false);
        return undefined;
    };

    const removeRole = (role) => {
        const node = byRole.get(role);
        // Children move up to the removed role's parent.
        setTree((t) =>
            t.filter((n) => n.role !== role).map((n) => (n.parentRole === role ? { ...n, parentRole: node?.parentRole || null } : n))
        );
        if (selected === role) setSelected(null);
    };

    const updateNode = (role, patch) => {
        if (patch.parentRole !== undefined && createsLoop(role, patch.parentRole)) {
            toast.error("A role can't report to itself or to a role below it");
            return;
        }
        setTree((t) => t.map((n) => (n.role === role ? { ...n, ...patch } : n)));
    };

    /** Same rules as the server: unique roles, parents exist, no loops. */
    const validateTree = () => {
        for (const n of tree) {
            if (n.parentRole && !byRole.has(n.parentRole)) return `"${roleLabel(n.role)}" reports to a role that is not in the tree.`;
        }
        if (unreachable.length) return `Fix who these roles report to: ${unreachable.map((n) => roleLabel(n.role)).join(", ")}.`;
        return null;
    };

    const setAccess = (role, key, level) => {
        const node = byRole.get(role);
        updateNode(role, { projectAccess: { ...node.projectAccess, [key]: level } });
    };

    const save = async () => {
        const problem = validateTree();
        if (problem) {
            toast.error(problem);
            return;
        }
        try {
            setSaving(true);
            setStranded([]);
            const res = await api.put(`/departments/${departmentId}/role-tree`, { roleTree: tree });
            applyResponse(res.data);
            toast.success("Roles saved");
            onSaved?.();
        } catch (err) {
            if (err.response?.status === 409) setStranded(err.response.data.employees || []);
            toast.error(err.response?.data?.message || "Failed to save roles");
        } finally {
            setSaving(false);
        }
    };

    /* ---------------- render ---------------- */

    // `seen` stops rendering if the edit state ever contains a parent loop.
    const renderBranch = (parent, seen = new Set()) => {
        const kids = childrenOf(parent).filter((k) => !seen.has(k.role));
        if (!kids.length) return null;
        const nextSeen = new Set([...seen, ...kids.map((k) => k.role)]);
        return (
            <ul className="ml-5 border-l-2 border-violet-100 pl-4 space-y-2 mt-2">
                {kids.map((node) => {
                    const isSel = selected === node.role;
                    const count = memberCounts[node.role] || 0;
                    return (
                        <li key={node.role} className="relative">
                            <span className="absolute -left-4 top-6 h-0.5 w-4 bg-violet-100" aria-hidden />
                            <button
                                type="button"
                                onClick={() => setSelected(node.role)}
                                className={`text-left w-full sm:w-auto sm:min-w-[240px] rounded-xl border px-3.5 py-2.5 transition-colors ${
                                    isSel
                                        ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100"
                                        : "border-violet-100 bg-white hover:bg-violet-50/40"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <UserCog className="h-4 w-4 text-violet-500 shrink-0" />
                                        <span className="text-sm font-semibold text-gray-800 truncate">{roleLabel(node.role)}</span>
                                    </div>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
                                        <Users className="h-3 w-3" />
                                        {count}
                                    </span>
                                </div>
                                <AccessDots access={node.projectAccess} />
                            </button>
                            {renderBranch(node.role, nextSeen)}
                        </li>
                    );
                })}
            </ul>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-violet-500">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    const selNode = selected ? byRole.get(selected) : null;
    const blockedParents = selNode ? new Set([selNode.role, ...descendantsOf(selNode.role)]) : new Set();
    const availableOptions = roleOptions.filter((r) => !byRole.has(r));

    return (
        <div className="space-y-4">
            {/* Header / actions */}
            <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 shrink-0">
                        <GitBranch className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Role Tree</h2>
                        <p className="text-xs text-gray-500">
                            Only employees whose role is in this tree can join the department. Higher roles sit on top.
                            Each role's permissions are its default access to this department's projects.
                        </p>
                    </div>
                </div>
                {canManage ? (
                    <div className="flex gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => { setAddOpen((v) => !v); setNewParent(selected || ""); }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-200 text-violet-700 text-sm font-medium hover:bg-violet-50"
                        >
                            <Plus className="w-4 h-4" /> Add Role
                        </button>
                        <button
                            type="button"
                            disabled={!dirty || saving}
                            onClick={() => { setTree(savedTree); setStranded([]); }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-40"
                            title="Discard changes"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            disabled={!dirty || saving}
                            onClick={save}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 self-start">
                        <Lock className="w-3.5 h-3.5" /> View only — admin or this department's manager can edit
                    </span>
                )}
            </div>

            {/* Add role form */}
            <AnimatePresence>
                {addOpen && canManage && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                            <label className="block">
                                <span className="text-xs font-medium text-gray-600">Role</span>
                                <select
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                                >
                                    <option value="">{availableOptions.length ? "Select a role" : "All roles are already in the tree"}</option>
                                    {availableOptions.map((r) => (
                                        <option key={r} value={r}>{roleLabel(r)}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-medium text-gray-600">Reports to</span>
                                <select
                                    value={newParent}
                                    onChange={(e) => setNewParent(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                                >
                                    <option value="">Manager (top)</option>
                                    {tree.map((n) => (
                                        <option key={n.role} value={n.role}>{roleLabel(n.role)}</option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={addRole}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
                            >
                                <Plus className="w-4 h-4" /> Add
                            </button>
                            <p className="sm:col-span-3 text-[11px] text-gray-500">
                                Role not listed? Set it on an employee first (Employee form → Role), then it appears here.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {stranded.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">These employees still have a role you removed:</p>
                        <p className="text-xs mt-1">
                            {stranded.map((e) => `${e.name} (${e.role})`).join(", ")}. Keep their role in the tree, or move them to another department first.
                        </p>
                    </div>
                </div>
            )}

            {unlistedMemberRoles.length > 0 && tree.length > 0 && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                    Members with roles not in the tree yet: {unlistedMemberRoles.map(roleLabel).join(", ")}. Add these roles before saving.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
                {/* Tree */}
                <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4 sm:p-5 overflow-x-auto">
                    <FixedNode icon={ShieldCheck} title="Admin" subtitle="Full access everywhere" tone="border-violet-300 bg-violet-600/10 text-violet-800" />
                    <div className="ml-5 border-l-2 border-violet-100 pl-4 pt-2">
                        <div className="relative">
                            <span className="absolute -left-4 top-6 h-0.5 w-4 bg-violet-100" aria-hidden />
                            <FixedNode
                                icon={Crown}
                                title="Manager"
                                subtitle={head?.name ? `${head.name} · department head` : "No head assigned"}
                                tone="border-amber-200 bg-amber-50 text-amber-800"
                            />
                        </div>
                        {tree.length === 0 ? (
                            <div className="ml-5 mt-3 rounded-xl border border-dashed border-violet-200 p-4 text-sm text-gray-500 max-w-md">
                                No roles yet. Nobody can be added to this department until you add the roles it uses.
                            </div>
                        ) : (
                            renderBranch(null)
                        )}
                    </div>

                    {unreachable.length > 0 && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                                <AlertTriangle className="w-3.5 h-3.5" /> Needs a parent
                            </p>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                                These roles report to each other in a loop or to a missing role. Select one and set “Reports to”.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {unreachable.map((n) => (
                                    <button key={n.role} type="button" onClick={() => setSelected(n.role)}
                                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${selected === n.role ? "border-violet-400 bg-white text-violet-700" : "border-amber-200 bg-white text-gray-700 hover:bg-amber-100"}`}>
                                        {roleLabel(n.role)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Selected role panel */}
                <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4 sm:p-5 h-fit">
                    {!selNode ? (
                        <div className="text-center py-8 text-sm text-gray-500">
                            <UserCog className="w-8 h-8 mx-auto text-violet-200 mb-2" />
                            Select a role in the tree to see its project permissions.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-base font-semibold text-gray-900">{roleLabel(selNode.role)}</h3>
                                    <p className="text-xs text-gray-500">
                                        {memberCounts[selNode.role] || 0} member(s) in this department
                                    </p>
                                </div>
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => removeRole(selNode.role)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-medium hover:bg-rose-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Remove
                                    </button>
                                )}
                            </div>

                            <label className="block">
                                <span className="text-xs font-medium text-gray-600">Reports to</span>
                                <select
                                    disabled={!canManage}
                                    value={selNode.parentRole || ""}
                                    onChange={(e) => updateNode(selNode.role, { parentRole: e.target.value || null })}
                                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-200"
                                >
                                    <option value="">Manager (top)</option>
                                    {tree
                                        .filter((n) => !blockedParents.has(n.role))
                                        .map((n) => (
                                            <option key={n.role} value={n.role}>{roleLabel(n.role)}</option>
                                        ))}
                                </select>
                            </label>

                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                    Project module permissions
                                </p>
                                <div className="space-y-2">
                                    {ACCESS_KEYS.map(({ key, label, hint }) => (
                                        <div key={key} className="rounded-xl border border-gray-100 p-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-800">{label}</p>
                                                    <p className="text-[11px] text-gray-400">{hint}</p>
                                                </div>
                                                <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0" role="radiogroup" aria-label={label}>
                                                    {LEVELS.map((level) => {
                                                        const active = selNode.projectAccess?.[key] === level;
                                                        return (
                                                            <button
                                                                key={level}
                                                                type="button"
                                                                role="radio"
                                                                aria-checked={active}
                                                                disabled={!canManage}
                                                                onClick={() => setAccess(selNode.role, key, level)}
                                                                className={`px-2.5 py-1 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed ${
                                                                    active ? LEVEL_STYLES[level] : "bg-white text-gray-400 hover:bg-gray-50"
                                                                }`}
                                                            >
                                                                {level}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Admin and the department manager always have full access.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DepartmentRoleTree;
