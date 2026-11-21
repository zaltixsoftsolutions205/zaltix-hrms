import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, AlertTriangle, Users, Building2, FolderKanban, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../utils/api";

const selectCls =
    "mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200";

/**
 * Delete a department after showing what it affects.
 *   - employees move to the chosen department (if their role is allowed
 *     there) or become unassigned
 *   - child departments move up a level
 *   - owned projects get a new owning department
 * The department itself is soft-deleted on the server.
 */
const DeleteDepartmentModal = ({ department, onClose, onDeleted }) => {
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [moveTo, setMoveTo] = useState("");
    const [newOwner, setNewOwner] = useState("");

    useEffect(() => {
        if (!department?._id) return undefined;
        let cancelled = false;
        setPreview(null);
        setMoveTo("");
        setNewOwner("");
        setLoading(true);
        api.get(`/departments/${department._id}/delete-preview`)
            .then((res) => { if (!cancelled) setPreview(res.data); })
            .catch((err) => {
                if (cancelled) return;
                toast.error(err.response?.data?.message || "Could not load what this department affects");
                onClose();
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [department?._id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!department) return null;

    const employees = preview?.employees || [];
    const owned = preview?.ownedProjects || [];
    const shared = preview?.sharedProjects || [];
    const children = preview?.childDepartments || [];
    const target = preview?.targets?.find((t) => t._id === moveTo);
    const willMove = target ? target.acceptsCount : 0;
    const willUnassign = employees.length - willMove;
    const needsOwner = owned.length > 0;

    const confirm = async () => {
        if (needsOwner && !newOwner) {
            toast.error("Choose the department that takes over its projects");
            return;
        }
        try {
            setDeleting(true);
            const res = await api.delete(`/departments/${department._id}`, {
                data: { moveEmployeesTo: moveTo || undefined, newProjectOwner: newOwner || undefined },
            });
            const s = res.data.summary || {};
            toast.success(
                `Department deleted. ${s.employeesMoved || 0} moved, ${s.employeesUnassigned || 0} unassigned, ${s.projectsReowned || 0} project(s) re-owned.`
            );
            onDeleted?.();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not delete the department");
        } finally {
            setDeleting(false);
        }
    };

    const Stat = ({ icon: Icon, label, value }) => (
        <div className="rounded-xl bg-gray-50 px-3 py-2 flex items-center gap-2">
            <Icon className="w-4 h-4 text-violet-500 shrink-0" />
            <div>
                <p className="text-sm font-bold text-gray-900 leading-none">{value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
            </div>
        </div>
    );

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
                onClick={() => !deleting && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-dept-title"
                    className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
                >
                    <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <h3 id="delete-dept-title" className="text-base font-semibold text-gray-900">Delete department</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{department.name}</p>
                        </div>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {loading || !preview ? (
                        <div className="py-14 flex justify-center text-violet-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : (
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-3 gap-2">
                                <Stat icon={Users} label="Employees" value={employees.length} />
                                <Stat icon={Building2} label="Child depts" value={children.length} />
                                <Stat icon={FolderKanban} label="Projects" value={owned.length + shared.length} />
                            </div>

                            {employees.length > 0 && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600" htmlFor="del-move-to">
                                        Move its {employees.length} employee(s) to
                                    </label>
                                    <select id="del-move-to" className={selectCls} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                                        <option value="">Nowhere — leave them without a department</option>
                                        {preview.targets.map((t) => (
                                            <option key={t._id} value={t._id}>
                                                {t.name} — {t.acceptsCount}/{employees.length} allowed by its roles
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        {moveTo
                                            ? `${willMove} will move${willUnassign ? `, ${willUnassign} whose role isn't allowed there will be unassigned` : ""}.`
                                            : "Everyone will be unassigned. They keep their accounts and roles."}
                                    </p>
                                </div>
                            )}

                            {needsOwner && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600" htmlFor="del-owner">
                                        New owning department for its {owned.length} project(s) *
                                    </label>
                                    <select id="del-owner" className={selectCls} value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
                                        <option value="">Select department</option>
                                        {preview.targets.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                                    </select>
                                    <p className="text-[11px] text-gray-500 mt-1 truncate" title={owned.map((p) => p.name).join(", ")}>
                                        {owned.map((p) => p.name).join(", ")}
                                    </p>
                                </div>
                            )}

                            <ul className="text-xs text-gray-600 space-y-1.5 list-disc pl-4">
                                {children.length > 0 && (
                                    <li>{children.length} child department(s) ({children.map((c) => c.name).join(", ")}) move up one level.</li>
                                )}
                                {shared.length > 0 && <li>It is removed from {shared.length} other project(s) it takes part in.</li>}
                                {preview.department.head && (
                                    <li>{preview.department.head.name} is no longer its manager (they go back to employee if they manage no other department).</li>
                                )}
                                <li>The department is hidden but kept on record.</li>
                            </ul>

                            {preview.employeesInProjects > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2 text-xs text-amber-800">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>
                                        {preview.employeesInProjects} of its employees work on these projects. Their project permissions come
                                        from their department&apos;s role tree, so after the move they get the new department&apos;s
                                        role-tree defaults on these projects (unless their own module access overrides them).
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            disabled={deleting || loading || !preview || (needsOwner && !newOwner)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
                        >
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Delete department
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default DeleteDepartmentModal;
