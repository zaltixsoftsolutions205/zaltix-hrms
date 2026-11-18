import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Users,
    UserPlus,
    UserMinus,
    Crown,
    Plus,
    Pencil,
    X,
    ChevronDown,
    ChevronRight,
    FolderKanban,
    ArrowRightLeft,
    Loader2,
    Mail,
} from "lucide-react";
import toast from "react-hot-toast";

// NOTE: adjust these import paths to match your project's actual locations.
import api from "../../utils/api";
import { DepartmentSelect, EmployeeSelect } from "../../components/UI/Assignmentselects";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

const Card = ({ className = "", children }) => (
    <div className={`bg-white rounded-2xl border border-violet-100 shadow-sm ${className}`}>{children}</div>
);

const SectionTitle = ({ icon: Icon, title, subtitle, action }) => (
    <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Icon className="w-4 h-4" />
            </div>
            <div>
                <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
            </div>
        </div>
        {action}
    </div>
);

const EmptyState = ({ icon: Icon = Users, title }) => (
    <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-11 h-11 rounded-full bg-violet-50 flex items-center justify-center mb-3">
            <Icon className="w-5 h-5 text-violet-300" />
        </div>
        <p className="text-sm text-gray-500">{title}</p>
    </div>
);

const Avatar = ({ src, name }) => {
    const initials = (name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    if (src) {
        return <img src={src} alt={name || "Employee"} className="w-9 h-9 rounded-full object-cover border border-violet-100" />;
    }
    return (
        <div className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 text-xs font-semibold flex items-center justify-center border border-violet-100">
            {initials}
        </div>
    );
};

const STATUS_STYLES = {
    planning: "bg-indigo-50 text-indigo-700 border-indigo-200",
    "in-progress": "bg-blue-50 text-blue-700 border-blue-200",
    "on-hold": "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

const Badge = ({ status }) => {
    const key = (status || "").toLowerCase();
    const style = STATUS_STYLES[key] || "bg-gray-100 text-gray-600 border-gray-200";
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${style}`}>
            {status ? status.replace("-", " ") : "Unknown"}
        </span>
    );
};

const IconButton = ({ icon: Icon, label, onClick, tone = "violet", disabled = false }) => {
    const tones = {
        violet: "border-violet-200 text-violet-700 hover:bg-violet-50",
        rose: "border-rose-200 text-rose-600 hover:bg-rose-50",
        gray: "border-gray-200 text-gray-600 hover:bg-gray-50",
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone]}`}
        >
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
};

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

const DepartmentEmployeeManagement = ({
    departmentId,
    department,
    employees = [],
    projects = [],
    leadPositions = [],
    employeeTaskStats = {},
    employeeProjectStats = {},
    onRefresh,
}) => {
    const headId = department?.headOf?._id || department?.headOf || null;

    /* ---------------- A. Department Employees ---------------- */
    const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
    const [newEmployeeId, setNewEmployeeId] = useState("");
    const [savingEmployee, setSavingEmployee] = useState(false);
    const [removingEmployeeId, setRemovingEmployeeId] = useState(null);

    const handleAddEmployee = async () => {
        if (!newEmployeeId) {
            toast.error("Select an employee first");
            return;
        }
        try {
            setSavingEmployee(true);
            const res = await api.post(`/departments/${departmentId}/employees`, {
                employeeId: newEmployeeId,
            });
            if (res.data.success) {
                toast.success(res.data.message || "Employee added successfully");
                setAddEmployeeOpen(false);
                setNewEmployeeId("");
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to add employee");
        } finally {
            setSavingEmployee(false);
        }
    };

    const handleRemoveEmployee = async (employee) => {
        if (headId && String(employee._id) === String(headId)) {
            toast.error("Cannot remove the department head. Change the department head first.");
            return;
        }
        try {
            setRemovingEmployeeId(employee._id);
            const res = await api.delete(`/departments/${departmentId}/employees/${employee._id}`);
            if (res.data.success) {
                toast.success(res.data.message || "Employee removed successfully");
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to remove employee");
        } finally {
            setRemovingEmployeeId(null);
        }
    };

    /* ---------------- B. Lead Positions ---------------- */
    const [showAddLead, setShowAddLead] = useState(false);
    const [leadForm, setLeadForm] = useState({ title: "", description: "" });
    const [savingLead, setSavingLead] = useState(false);
    const [assigningLeadId, setAssigningLeadId] = useState(null);
    const [leadAssigneeId, setLeadAssigneeId] = useState("");
    const [savingLeadAssignment, setSavingLeadAssignment] = useState(false);
    const [unassigningLeadId, setUnassigningLeadId] = useState(null);

    const handleCreateLead = async () => {
        if (!leadForm.title.trim()) {
            toast.error("Lead position title is required");
            return;
        }
        try {
            setSavingLead(true);
            const res = await api.post(`/departments/${departmentId}/leads`, leadForm);
            if (res.data.success) {
                toast.success("Lead position created successfully");
                setShowAddLead(false);
                setLeadForm({ title: "", description: "" });
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to create lead position");
        } finally {
            setSavingLead(false);
        }
    };

    const openAssignLead = (leadId, currentUserId) => {
        setAssigningLeadId(leadId);
        setLeadAssigneeId(currentUserId || "");
    };

    const handleAssignLead = async (leadId) => {
        if (!leadAssigneeId) {
            toast.error("Select an employee first");
            return;
        }
        try {
            setSavingLeadAssignment(true);
            const res = await api.put(`/departments/${departmentId}/leads/${leadId}`, {
                userId: leadAssigneeId,
            });
            if (res.data.success) {
                toast.success("Lead position assigned successfully");
                setAssigningLeadId(null);
                setLeadAssigneeId("");
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to assign lead position");
        } finally {
            setSavingLeadAssignment(false);
        }
    };

    const handleUnassignLead = async (leadId) => {
        try {
            setUnassigningLeadId(leadId);
            const res = await api.delete(`/departments/${departmentId}/leads/${leadId}`);
            if (res.data.success) {
                toast.success("Lead position unassigned");
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to unassign lead position");
        } finally {
            setUnassigningLeadId(null);
        }
    };

    /* ---------------- C. Department Projects ---------------- */
    const [expandedProjectId, setExpandedProjectId] = useState(null);
    const [addingMemberProjectId, setAddingMemberProjectId] = useState(null);
    const [newMemberId, setNewMemberId] = useState("");
    const [savingMember, setSavingMember] = useState(false);
    const [removingMember, setRemovingMember] = useState(null); // `${projectId}:${userId}`
    const [shiftingProjectId, setShiftingProjectId] = useState(null);
    const [shiftTargetDeptId, setShiftTargetDeptId] = useState("");
    const [savingShift, setSavingShift] = useState(false);

    const toggleExpandProject = (projectId) => {
        setExpandedProjectId((prev) => (prev === projectId ? null : projectId));
    };

    const handleAddProjectMember = async (projectId) => {
        if (!newMemberId) {
            toast.error("Select an employee first");
            return;
        }
        try {
            setSavingMember(true);
            const res = await api.post(`/projects/${projectId}/team-members`, { userId: newMemberId });
            if (res.data.success) {
                toast.success("Team member added successfully");
                setAddingMemberProjectId(null);
                setNewMemberId("");
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to add team member");
        } finally {
            setSavingMember(false);
        }
    };

    const handleRemoveProjectMember = async (projectId, userId) => {
        try {
            setRemovingMember(`${projectId}:${userId}`);
            const res = await api.delete(`/projects/${projectId}/team-members/${userId}`);
            if (res.data.success) {
                toast.success("Team member removed successfully");
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to remove team member");
        } finally {
            setRemovingMember(null);
        }
    };

    const handleShiftDepartment = async (projectId) => {
        if (!shiftTargetDeptId) {
            toast.error("Select a target department first");
            return;
        }
        try {
            setSavingShift(true);
            const res = await api.put(`/projects/${projectId}/department`, {
                departmentId: shiftTargetDeptId,
            });
            if (res.data.success) {
                toast.success("Project department updated successfully");
                setShiftingProjectId(null);
                setShiftTargetDeptId("");
                onRefresh();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to shift project department");
        } finally {
            setSavingShift(false);
        }
    };

    const projectTeamCount = (project) => (project.teamMembers || []).length;

    return (
        <div className="space-y-6">
            {/* ==================== A. DEPARTMENT EMPLOYEES ==================== */}
            <Card className="p-5">
                <SectionTitle
                    icon={Users}
                    title="Department Employees"
                    subtitle={`${employees.length} total`}
                    action={
                        <button
                            onClick={() => setAddEmployeeOpen((v) => !v)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors"
                        >
                            <UserPlus className="w-3.5 h-3.5" />
                            Add Employee
                        </button>
                    }
                />

                <AnimatePresence>
                    {addEmployeeOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden mb-4"
                        >
                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                                <div className="flex-1">
                                    <EmployeeSelect
                                        mode="department-head"
                                        value={newEmployeeId}
                                        onChange={setNewEmployeeId}
                                        placeholder="Select employee to add"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAddEmployee}
                                        disabled={savingEmployee}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {savingEmployee ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        Add
                                    </button>
                                    <button
                                        onClick={() => {
                                            setAddEmployeeOpen(false);
                                            setNewEmployeeId("");
                                        }}
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {employees.length === 0 ? (
                    <EmptyState icon={Users} title="No employees in this department yet" />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {employees.map((emp) => {
                            const isHead = headId && String(emp._id) === String(headId);
                            const tStats = employeeTaskStats[emp._id] || { totalTasks: 0 };
                            const pStats = employeeProjectStats[emp._id] || { totalProjects: 0 };
                            return (
                                <div
                                    key={emp._id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 p-3 hover:bg-violet-50/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar src={emp.profilePicture} name={emp.name} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="font-medium text-gray-800 truncate">{emp.name}</p>
                                                {isHead && (
                                                    <span title="Department Head">
                                                        <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400 truncate">
                                                {emp.employeeId} · {emp.designation || emp.role}
                                            </p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                {pStats.totalProjects} projects · {tStats.totalTasks} tasks
                                            </p>
                                        </div>
                                    </div>
                                    <IconButton
                                        icon={UserMinus}
                                        label="Remove"
                                        tone="rose"
                                        disabled={isHead || removingEmployeeId === emp._id}
                                        onClick={() => handleRemoveEmployee(emp)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* ==================== B. LEAD POSITIONS ==================== */}
            <Card className="p-5">
                <SectionTitle
                    icon={Crown}
                    title="Lead Positions"
                    subtitle={`${leadPositions.length} positions`}
                    action={
                        <button
                            onClick={() => setShowAddLead((v) => !v)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add Lead Position
                        </button>
                    }
                />

                <AnimatePresence>
                    {showAddLead && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden mb-4"
                        >
                            <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-3">
                                <input
                                    type="text"
                                    value={leadForm.title}
                                    onChange={(e) => setLeadForm((p) => ({ ...p, title: e.target.value }))}
                                    placeholder="Position title (e.g. Technical Lead)"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
                                />
                                <input
                                    type="text"
                                    value={leadForm.description}
                                    onChange={(e) => setLeadForm((p) => ({ ...p, description: e.target.value }))}
                                    placeholder="Description (optional)"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
                                />
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => setShowAddLead(false)}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateLead}
                                        disabled={savingLead}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {savingLead && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Create
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {leadPositions.length === 0 ? (
                    <EmptyState icon={Crown} title="No lead positions defined yet" />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {leadPositions.map((lead) => (
                            <div key={lead._id} className="rounded-xl border border-violet-100 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{lead.title}</p>
                                        {lead.description && (
                                            <p className="text-xs text-gray-400 mt-0.5">{lead.description}</p>
                                        )}
                                        <p className="text-sm text-gray-600 mt-1.5">
                                            {lead.user?.name || <span className="text-gray-400">Unassigned</span>}
                                        </p>
                                    </div>
                                    <span
                                        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                            lead.isActive
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : "bg-gray-100 text-gray-500 border-gray-200"
                                        }`}
                                    >
                                        {lead.isActive ? "Active" : "Inactive"}
                                    </span>
                                </div>

                                {assigningLeadId === lead._id ? (
                                    <div className="mt-3 space-y-2">
                                        <EmployeeSelect
                                            mode="department-head"
                                            value={leadAssigneeId}
                                            onChange={setLeadAssigneeId}
                                            placeholder="Select employee"
                                        />
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => setAssigningLeadId(null)}
                                                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => handleAssignLead(lead._id)}
                                                disabled={savingLeadAssignment}
                                                className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                                            >
                                                {savingLeadAssignment ? "Saving..." : "Save"}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2 mt-3">
                                        <IconButton
                                            icon={Pencil}
                                            label={lead.user ? "Change Lead" : "Assign"}
                                            onClick={() => openAssignLead(lead._id, lead.user?._id)}
                                        />
                                        {lead.user && (
                                            <IconButton
                                                icon={X}
                                                label="Unassign"
                                                tone="rose"
                                                disabled={unassigningLeadId === lead._id}
                                                onClick={() => handleUnassignLead(lead._id)}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ==================== C. DEPARTMENT PROJECTS ==================== */}
            <Card className="p-5">
                <SectionTitle icon={FolderKanban} title="Department Projects" subtitle={`${projects.length} projects`} />

                {projects.length === 0 ? (
                    <EmptyState icon={FolderKanban} title="No projects in this department" />
                ) : (
                    <div className="space-y-3">
                        {projects.map((project) => {
                            const isExpanded = expandedProjectId === project._id;
                            return (
                                <div key={project._id} className="rounded-xl border border-violet-100 overflow-hidden">
                                    <button
                                        onClick={() => toggleExpandProject(project._id)}
                                        className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-violet-50/30 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {isExpanded ? (
                                                <ChevronDown className="w-4 h-4 text-violet-400 shrink-0" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-violet-400 shrink-0" />
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-800 truncate">{project.name}</p>
                                                <p className="text-xs text-gray-400">
                                                    {project.projectCode} · {project.manager?.name || "Unassigned"} ·{" "}
                                                    {projectTeamCount(project)} member
                                                    {projectTeamCount(project) !== 1 ? "s" : ""}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge status={project.status} />
                                        </div>
                                    </button>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="overflow-hidden border-t border-violet-100 bg-violet-50/20"
                                            >
                                                <div className="p-4 space-y-4">
                                                    {/* Team members */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                                                Team Members
                                                            </p>
                                                            <button
                                                                onClick={() =>
                                                                    setAddingMemberProjectId((prev) =>
                                                                        prev === project._id ? null : project._id
                                                                    )
                                                                }
                                                                className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800"
                                                            >
                                                                <UserPlus className="w-3.5 h-3.5" />
                                                                Add Employee
                                                            </button>
                                                        </div>

                                                        {addingMemberProjectId === project._id && (
                                                            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                                                <div className="flex-1">
                                                                    <EmployeeSelect
                                                                        mode="department-head"
                                                                        value={newMemberId}
                                                                        onChange={setNewMemberId}
                                                                        placeholder="Select employee"
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => handleAddProjectMember(project._id)}
                                                                    disabled={savingMember}
                                                                    className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                                                                >
                                                                    {savingMember ? "Adding..." : "Add"}
                                                                </button>
                                                            </div>
                                                        )}

                                                        {projectTeamCount(project) === 0 ? (
                                                            <p className="text-xs text-gray-400">No team members yet</p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {project.teamMembers.map((member) => (
                                                                    <div
                                                                        key={member._id}
                                                                        className="flex items-center justify-between gap-2 bg-white rounded-lg border border-violet-100 px-3 py-2"
                                                                    >
                                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                                            <Avatar src={member.profilePicture} name={member.name} />
                                                                            <div className="min-w-0">
                                                                                <p className="text-sm text-gray-800 truncate">{member.name}</p>
                                                                                <p className="text-[11px] text-gray-400 truncate">
                                                                                    {member.employeeId}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <IconButton
                                                                            icon={UserMinus}
                                                                            label="Remove"
                                                                            tone="rose"
                                                                            disabled={
                                                                                removingMember === `${project._id}:${member._id}`
                                                                            }
                                                                            onClick={() =>
                                                                                handleRemoveProjectMember(project._id, member._id)
                                                                            }
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Shift department */}
                                                    <div className="pt-3 border-t border-violet-100">
                                                        {shiftingProjectId === project._id ? (
                                                            <div className="flex flex-col sm:flex-row gap-2">
                                                                <div className="flex-1">
                                                                    <DepartmentSelect
                                                                        mode="normal"
                                                                        value={shiftTargetDeptId}
                                                                        onChange={setShiftTargetDeptId}
                                                                        placeholder="Select new department"
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => {
                                                                            setShiftingProjectId(null);
                                                                            setShiftTargetDeptId("");
                                                                        }}
                                                                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleShiftDepartment(project._id)}
                                                                        disabled={savingShift}
                                                                        className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                                                                    >
                                                                        {savingShift ? "Moving..." : "Confirm Shift"}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <IconButton
                                                                icon={ArrowRightLeft}
                                                                label="Shift Department"
                                                                onClick={() => {
                                                                    setShiftingProjectId(project._id);
                                                                    setShiftTargetDeptId("");
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default DepartmentEmployeeManagement;