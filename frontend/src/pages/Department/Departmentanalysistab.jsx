import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    Users,
    UserCheck,
    FolderKanban,
    Activity,
    ListChecks,
    CheckCircle2,
    Search,
    Clock,
    AlertTriangle,
    TimerReset,
    Gauge,
    Hourglass,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

const Card = ({ className = "", children }) => (
    <div className={`bg-white rounded-2xl border border-violet-100 shadow-sm ${className}`}>{children}</div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }) => (
    <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Icon className="w-4 h-4" />
        </div>
        <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
    </div>
);

const EmptyState = ({ icon: Icon = Activity, title }) => (
    <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-11 h-11 rounded-full bg-violet-50 flex items-center justify-center mb-3">
            <Icon className="w-5 h-5 text-violet-300" />
        </div>
        <p className="text-sm text-gray-500">{title}</p>
    </div>
);

const ProgressBar = ({ value = 0 }) => {
    const pct = Math.min(100, Math.max(0, Number(value) || 0));
    return (
        <div className="w-full">
            <div className="w-full h-1.5 bg-violet-50 rounded-full overflow-hidden">
                <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-[11px] text-gray-400 mt-1 block">{pct}%</span>
        </div>
    );
};

const STATUS_STYLES = {
    planning: "bg-indigo-50 text-indigo-700 border-indigo-200",
    "in-progress": "bg-blue-50 text-blue-700 border-blue-200",
    "on-hold": "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
    "not-started": "bg-gray-100 text-gray-600 border-gray-200",
    review: "bg-violet-50 text-violet-700 border-violet-200",
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

const KpiCard = ({ label, value, icon: Icon }) => (
    <Card className="p-4">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600">
                <Icon className="w-4 h-4" />
            </div>
        </div>
    </Card>
);

const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

const DepartmentAnalysisTab = ({
    employees = [],
    projects = [],
    tasks = [],
    employeeTaskStats = {},
    employeeProjectStats = {},
    projectStats = {},
    taskStats = {},
    recentActivity = [],
}) => {
    const [employeeSearch, setEmployeeSearch] = useState("");

    const activeEmployees = useMemo(() => employees.filter((e) => e.isActive).length, [employees]);

    const kpis = [
        { label: "Employees", value: employees.length, icon: Users },
        { label: "Active Employees", value: activeEmployees, icon: UserCheck },
        { label: "Projects", value: projectStats.totalProjects ?? projects.length, icon: FolderKanban },
        { label: "Active Projects", value: projectStats.activeProjects ?? 0, icon: Activity },
        { label: "Tasks", value: taskStats.totalTasks ?? tasks.length, icon: ListChecks },
        { label: "Completed Tasks", value: taskStats.completedTasks ?? 0, icon: CheckCircle2 },
        { label: "Overall Completion", value: `${taskStats.completionRate ?? 0}%`, icon: Gauge },
    ];

    const filteredEmployees = useMemo(() => {
        const q = employeeSearch.trim().toLowerCase();
        if (!q) return employees;
        return employees.filter((emp) =>
            [emp.name, emp.employeeId, emp.designation, emp.role].some((v) =>
                String(v || "").toLowerCase().includes(q)
            )
        );
    }, [employees, employeeSearch]);

    const projectStatusCounts = [
        { key: "planningProjects", label: "Planning" },
        { key: "inProgressProjects", label: "In Progress" },
        { key: "onHoldProjects", label: "On Hold" },
        { key: "completedProjects", label: "Completed" },
        { key: "cancelledProjects", label: "Cancelled" },
    ];

    const taskStatusCounts = [
        { key: "notStartedTasks", label: "Not Started" },
        { key: "inProgressTasks", label: "In Progress" },
        { key: "reviewTasks", label: "Review" },
        { key: "completedTasks", label: "Completed" },
        { key: "cancelledTasks", label: "Cancelled" },
    ];

    return (
        <div className="space-y-6">
            {/* A. KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((kpi) => (
                    <KpiCard key={kpi.label} {...kpi} />
                ))}
            </div>

            {/* B. Employee Analysis */}
            <section>
                <Card className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <SectionTitle icon={Users} title="Employee Analysis" subtitle="Workload per department employee" />
                        <div className="relative w-full sm:w-64">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={employeeSearch}
                                onChange={(e) => setEmployeeSearch(e.target.value)}
                                placeholder="Search employee"
                                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-colors"
                            />
                        </div>
                    </div>

                    {filteredEmployees.length === 0 ? (
                        <EmptyState icon={Users} title="No employees found" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-violet-50/50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                                        <th className="px-4 py-3">Employee</th>
                                        <th className="px-4 py-3">Role</th>
                                        <th className="px-4 py-3 text-center">Projects</th>
                                        <th className="px-4 py-3 text-center">Tasks</th>
                                        <th className="px-4 py-3 text-center">Completed</th>
                                        <th className="px-4 py-3 text-center">In Progress</th>
                                        <th className="px-4 py-3 text-center">Pending</th>
                                        <th className="px-4 py-3 w-40">Completion</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredEmployees.map((emp) => {
                                        const tStats = employeeTaskStats[emp._id] || {
                                            totalTasks: 0,
                                            completedTasks: 0,
                                            inProgressTasks: 0,
                                            pendingTasks: 0,
                                            completionPercentage: 0,
                                        };
                                        const pStats = employeeProjectStats[emp._id] || { totalProjects: 0 };
                                        return (
                                            <tr key={emp._id} className="hover:bg-violet-50/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-800">{emp.name}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {emp.employeeId}
                                                        {emp.designation ? ` · ${emp.designation}` : ""}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3 text-gray-600 capitalize">{emp.role || "—"}</td>
                                                <td className="px-4 py-3 text-center text-gray-700">{pStats.totalProjects}</td>
                                                <td className="px-4 py-3 text-center text-gray-700">{tStats.totalTasks}</td>
                                                <td className="px-4 py-3 text-center text-emerald-600 font-medium">
                                                    {tStats.completedTasks}
                                                </td>
                                                <td className="px-4 py-3 text-center text-blue-600 font-medium">
                                                    {tStats.inProgressTasks}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-500">{tStats.pendingTasks}</td>
                                                <td className="px-4 py-3">
                                                    <ProgressBar value={tStats.completionPercentage} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </section>

            {/* C. Project Analysis */}
            <section>
                <Card className="p-5">
                    <SectionTitle icon={FolderKanban} title="Project Analysis" />

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                        {projectStatusCounts.map((s) => (
                            <div key={s.key} className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2.5 text-center">
                                <p className="text-lg font-semibold text-gray-900">{projectStats[s.key] ?? 0}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {projects.length === 0 ? (
                        <EmptyState icon={FolderKanban} title="No projects in this department" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-violet-50/50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                                        <th className="px-4 py-3">Project</th>
                                        <th className="px-4 py-3">Manager</th>
                                        <th className="px-4 py-3 text-center">Team</th>
                                        <th className="px-4 py-3 w-36">Progress</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {projects.map((project) => (
                                        <tr key={project._id} className="hover:bg-violet-50/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-800">{project.name}</p>
                                                <p className="text-xs text-gray-400">{project.projectCode}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">{project.manager?.name || "Unassigned"}</td>
                                            <td className="px-4 py-3 text-center text-gray-700">
                                                {(project.teamMembers || []).length}
                                            </td>
                                            <td className="px-4 py-3">
                                                <ProgressBar value={project.progress} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge status={project.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </section>

            {/* D. Task Analysis */}
            <section>
                <Card className="p-5">
                    <SectionTitle icon={ListChecks} title="Task Analysis" />

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                        {taskStatusCounts.map((s) => (
                            <div key={s.key} className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2.5 text-center">
                                <p className="text-lg font-semibold text-gray-900">{taskStats[s.key] ?? 0}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2.5 flex items-center gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{taskStats.overdueTasks ?? 0}</p>
                                <p className="text-[11px] text-gray-500">Overdue</p>
                            </div>
                        </div>
                        <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5 flex items-center gap-2.5">
                            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{taskStats.dueSoonTasks ?? 0}</p>
                                <p className="text-[11px] text-gray-500">Due Soon</p>
                            </div>
                        </div>
                        <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2.5 flex items-center gap-2.5">
                            <Gauge className="w-4 h-4 text-violet-500 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{taskStats.averageProgress ?? 0}%</p>
                                <p className="text-[11px] text-gray-500">Avg Progress</p>
                            </div>
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2.5 flex items-center gap-2.5">
                            <Hourglass className="w-4 h-4 text-blue-500 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-gray-900">
                                    {taskStats.actualHours ?? 0}
                                    <span className="text-xs text-gray-400 font-normal"> / {taskStats.estimatedHours ?? 0}h</span>
                                </p>
                                <p className="text-[11px] text-gray-500">Actual / Est. Hours</p>
                            </div>
                        </div>
                    </div>
                </Card>
            </section>

            {/* E. Recent Activity */}
            <section>
                <Card className="p-5">
                    <SectionTitle icon={TimerReset} title="Recent Activity" />
                    {recentActivity.length === 0 ? (
                        <EmptyState icon={TimerReset} title="No recent activity" />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentActivity.map((activity, i) => (
                                <motion.li
                                    key={activity._id || i}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.02 }}
                                    className="flex items-start gap-3 py-3"
                                >
                                    <div className="w-2 h-2 rounded-full bg-violet-500 mt-2 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm text-gray-800">
                                            {activity.message || activity.action || activity.type || "Activity"}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {activity.user?.name && (
                                                <span className="text-xs text-gray-400">{activity.user.name}</span>
                                            )}
                                            {activity.createdAt && (
                                                <span className="text-xs text-gray-400">{formatDate(activity.createdAt)}</span>
                                            )}
                                        </div>
                                    </div>
                                </motion.li>
                            ))}
                        </ul>
                    )}
                </Card>
            </section>
        </div>
    );
};

export default DepartmentAnalysisTab;