import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    Pencil,
    Building2,
    UserCircle2,
    Users,
    FolderKanban,
    ListChecks,
    BarChart3,
    Users2,
    AlertCircle,
    X,
} from "lucide-react";
import toast from "react-hot-toast";
import Breadcrumb from "../../components/UI/Breadcrumb";

// NOTE: adjust this import to match your project's actual API utility path.
import api from "../../utils/api";

// NOTE: adjust this import to match where Assignmentselects.jsx actually
// lives in your project (e.g. "../../components/UI/Assignmentselects").
// Nothing inside Assignmentselects.jsx is modified — it is reused as-is.
import { DepartmentSelect, EmployeeSelect } from "../../components/UI/Assignmentselects";

import DepartmentAnalysisTab from "./DepartmentAnalysisTab";
import DepartmentEmployeeManagement from "./DepartmentEmployeeManagement";

/* ------------------------------------------------------------------ */
/* Small shared primitives (violet/glass HRMS look)                    */
/* ------------------------------------------------------------------ */

const STATUS_STYLES = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    inactive: "bg-gray-100 text-gray-600 border-gray-200",
};

const Badge = ({ status, children }) => {
    const key = (status || "").toLowerCase();
    const style = STATUS_STYLES[key] || "bg-gray-100 text-gray-600 border-gray-200";
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${style}`}>
            {children ?? status ?? "Unknown"}
        </span>
    );
};

const StatChip = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-2 rounded-xl border border-violet-100 bg-white/60 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Icon className="h-4 w-4" />
        </div>
        <div>
            <p className="text-sm font-semibold text-gray-900 leading-none">{value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
        </div>
    </div>
);

/* ------------------------------------------------------------------ */
/* Skeleton loader                                                    */
/* ------------------------------------------------------------------ */

const SkeletonBlock = ({ className = "" }) => (
    <div className={`animate-pulse bg-gray-100 rounded-xl ${className}`} />
);

const DepartmentDetailsSkeleton = () => (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <SkeletonBlock className="h-8 w-72" />
        <SkeletonBlock className="h-40 w-full" />
        <SkeletonBlock className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
                <SkeletonBlock key={i} className="h-24" />
            ))}
        </div>
        <SkeletonBlock className="h-72 w-full" />
    </div>
);

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

const TABS = [
    { key: "analysis", label: "Analysis", icon: BarChart3 },
    { key: "management", label: "Employee Management", icon: Users2 },
];

const DepartmentDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [department, setDepartment] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [employeeTaskStats, setEmployeeTaskStats] = useState({});
    const [employeeProjectStats, setEmployeeProjectStats] = useState({});
    const [projectStats, setProjectStats] = useState({});
    const [taskStats, setTaskStats] = useState({});
    const [leadPositions, setLeadPositions] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Active tab lives at the page level so management actions can refetch
    // the department without ever bouncing the user back to Analysis.
    const [activeTab, setActiveTab] = useState("analysis");

    const [showEditForm, setShowEditForm] = useState(false);
    const [savingDepartment, setSavingDepartment] = useState(false);
    const [editForm, setEditForm] = useState({
        name: "",
        code: "",
        description: "",
        status: "active",
        headOf: "",
        parentDepartment: "",
    });

    const fetchDepartment = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const response = await api.get(`/departments/${id}`);

            if (response.data.success) {
                setDepartment(response.data.department);
                setEmployees(response.data.employees || []);
                setProjects(response.data.projects || []);
                setTasks(response.data.tasks || []);
                setEmployeeTaskStats(response.data.employeeTaskStats || {});
                setEmployeeProjectStats(response.data.employeeProjectStats || {});
                setProjectStats(response.data.projectStats || {});
                setTaskStats(response.data.taskStats || {});
                setLeadPositions(response.data.leadPositions || []);
                setRecentActivity(response.data.recentActivity || []);
            }
        } catch (err) {
            console.error("Failed to fetch department:", err);
            setError(err.response?.data?.message || "Failed to load department");
            toast.error(err.response?.data?.message || "Failed to load department");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchDepartment();
        }
    }, [id, fetchDepartment]);

    // Passed down to the Employee Management tab so every mutation
    // (add/remove employee, lead position changes, project team changes,
    // shifting a project's department) refreshes real data without a
    // full page reload and without resetting the active tab.
    const handleRefresh = useCallback(() => {
        fetchDepartment();
    }, [fetchDepartment]);

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleOpenEdit = () => {
        setEditForm({
            name: department.name || "",
            code: department.code || "",
            description: department.description || "",
            status: department.status || "active",
            headOf: department.headOf?._id || department.headOf || "",
            parentDepartment: department.parentDepartment?._id || department.parentDepartment || "",
        });
        setShowEditForm(true);
    };

    const handleUpdateDepartment = async (e) => {
        e.preventDefault();
        try {
            setSavingDepartment(true);
            const response = await api.put(`/departments/${id}`, editForm);
            if (response.data.success) {
                toast.success("Department updated successfully");
                setShowEditForm(false);
                await fetchDepartment();
            }
        } catch (err) {
            console.error("Failed to update department:", err);
            toast.error(err.response?.data?.message || "Failed to update department");
        } finally {
            setSavingDepartment(false);
        }
    };

    /* ------------------------------------------------------------------ */
    /* Loading / error / not-found states                                 */
    /* ------------------------------------------------------------------ */

    if (loading) {
        return <DepartmentDetailsSkeleton />;
    }

    if (error && !department) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-7 h-7 text-rose-400" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Department not found</h2>
                <p className="text-sm text-gray-500 mt-1">{error}</p>
                <button
                    onClick={() => navigate(-1)}
                    className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
            </div>
        );
    }

    if (!department) {
        return null;
    }

    const totalEmployees = employees.length;
    const totalProjects = projects.length;
    const totalTasks = tasks.length;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <Breadcrumb
                items={[
                    { label: "Employee Management", path: "/admin/employee-management" },
                    { label: "Workspace", path: "/admin/employee-management/workspace" },
                    { label: department.name },
                ]}
            />

            {/* ---------------- Edit Department Modal ---------------- */}
            <AnimatePresence>
                {showEditForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                            className="w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">Edit Department</h2>
                                    <p className="text-sm text-gray-500 mt-1">Update department information</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowEditForm(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateDepartment} className="p-6 space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Department Name
                                        </label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={editForm.name}
                                            onChange={handleEditChange}
                                            required
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Department Code
                                        </label>
                                        <input
                                            type="text"
                                            name="code"
                                            value={editForm.code}
                                            onChange={handleEditChange}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                    <select
                                        name="status"
                                        value={editForm.status}
                                        onChange={handleEditChange}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>

                                {/* Head of Department — reuses the existing EmployeeSelect
                                    "department-head" mode untouched. */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Head of Department
                                    </label>
                                    <EmployeeSelect
                                        mode="department-head"
                                        value={editForm.headOf}
                                        onChange={(val) => setEditForm((prev) => ({ ...prev, headOf: val }))}
                                        placeholder="Select Head of Department"
                                    />
                                </div>

                                {/* Parent Department — reuses the existing DepartmentSelect
                                    "parent" mode, excluding this department itself. */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Parent Department
                                    </label>
                                    <DepartmentSelect
                                        mode="parent"
                                        excludeId={id}
                                        value={editForm.parentDepartment}
                                        onChange={(val) => setEditForm((prev) => ({ ...prev, parentDepartment: val }))}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        name="description"
                                        value={editForm.description}
                                        onChange={handleEditChange}
                                        rows={4}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
                                        placeholder="Department description"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditForm(false)}
                                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={savingDepartment}
                                        className="px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {savingDepartment ? "Saving..." : "Save Changes"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ---------------- Department Header (violet/glass) ---------------- */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 shadow-sm"
            >
                <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-3 mb-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="mt-1 p-2 rounded-lg border border-violet-100 bg-white/70 text-violet-500 hover:bg-white hover:text-violet-700 transition-colors shrink-0"
                            aria-label="Go back"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>

                        <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 border border-violet-100 text-violet-600 text-xl shadow-sm">
                                    {department.icon ? (
                                        <span>{department.icon}</span>
                                    ) : (
                                        <Building2 className="h-6 w-6" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 truncate">
                                            {department.name}
                                        </h1>
                                        <Badge status={department.status} />
                                    </div>
                                    <p className="text-sm text-violet-500 font-medium mt-0.5">{department.code}</p>
                                    {department.description && (
                                        <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">{department.description}</p>
                                    )}
                                </div>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleOpenEdit}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors self-start shrink-0"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit Department
                            </motion.button>
                        </div>
                    </div>

                    {/* Head / Parent — stacked on mobile, two-col on tablet+ */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 pl-0 sm:pl-[60px]">
                        <div className="flex items-center gap-2 text-sm">
                            <UserCircle2 className="w-4 h-4 text-violet-400" />
                            <span className="text-gray-400">Head:</span>
                            <span className="font-medium text-gray-800">
                                {department.headOf?.name || "Not assigned"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Building2 className="w-4 h-4 text-violet-400" />
                            <span className="text-gray-400">Parent:</span>
                            <span className="font-medium text-gray-800">
                                {department.parentDepartment?.name || "None"}
                            </span>
                        </div>
                    </div>

                    {/* Counts — desktop: full row, tablet: two-col, mobile: stacked */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-0 sm:pl-[60px]">
                        <StatChip icon={Users} label="Employees" value={totalEmployees} />
                        <StatChip icon={FolderKanban} label="Projects" value={totalProjects} />
                        <StatChip icon={ListChecks} label="Tasks" value={totalTasks} />
                    </div>
                </div>
            </motion.div>

            {/* ---------------- Tabs (visually separate from header) ---------------- */}
            <div className="flex items-center gap-1 rounded-xl border border-violet-100 bg-white p-1 w-fit">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isActive ? "text-violet-700" : "text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="department-tab-indicator"
                                    className="absolute inset-0 rounded-lg bg-violet-50 border border-violet-200"
                                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                                />
                            )}
                            <Icon className="w-4 h-4 relative z-10" />
                            <span className="relative z-10">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ---------------- Tab content ---------------- */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                >
                    {activeTab === "analysis" ? (
                        <DepartmentAnalysisTab
                            employees={employees}
                            projects={projects}
                            tasks={tasks}
                            employeeTaskStats={employeeTaskStats}
                            employeeProjectStats={employeeProjectStats}
                            projectStats={projectStats}
                            taskStats={taskStats}
                            recentActivity={recentActivity}
                        />
                    ) : (
                        <DepartmentEmployeeManagement
                            departmentId={id}
                            department={department}
                            employees={employees}
                            projects={projects}
                            leadPositions={leadPositions}
                            employeeTaskStats={employeeTaskStats}
                            employeeProjectStats={employeeProjectStats}
                            onRefresh={handleRefresh}
                        />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default DepartmentDetails;