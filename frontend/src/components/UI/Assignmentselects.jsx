import React, { useState, useEffect, useMemo, useRef, useCallback, } from "react";
import toast from "react-hot-toast";
import api from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";

/* ============================================================================
 * SHARED HELPERS
 * ==========================================================================*/

/** Lower-cases a role string safely (mirrors backend's `String(role).toLowerCase()`). */
const roleOf = (role) => String(role || "").toLowerCase();

/**
 * Defensively coerces API payloads into an array so the UI never crashes on
 * `undefined`, `null`, or a non-array value (e.g. an error object).
 */
const asArray = (data) => (Array.isArray(data) ? data : []);

/**
 * Case-insensitive local filter over a list of `{ label, sublabel }` options.
 * Used for client-side search once a batch of records (<=100) is loaded.
 */
function filterOptions(options, query) {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
        (opt) =>
            opt.label.toLowerCase().includes(q) ||
            (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
}

/** Hook: invokes `handler` on any mousedown outside `ref`. */
function useClickOutside(ref, handler) {
    useEffect(() => {
        function onMouseDown(event) {
            if (!ref.current || ref.current.contains(event.target)) return;
            handler();
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [ref, handler]);
}

/* ============================================================================
 * BASE SEARCHABLE SELECT (internal, not exported)
 *
 * A single accessible, styled dropdown shell shared by Department / Project /
 * Employee selects, so search, loading, empty-state, click-outside, and
 * disabled/blocked behavior is implemented exactly once.
 * ==========================================================================*/

function BaseSearchableSelect({
    options, // [{ id, label, sublabel }]
    value,
    onChange,
    loading = false,
    disabled = false,
    blocked = false, // dependent select isn't ready yet (e.g. no department chosen)
    blockedMessage = "Select an option first",
    placeholder = "Select...",
    emptyMessage = "No results found",
    loadingMessage = "Loading...",
}) {

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const containerRef = useRef(null);

    useClickOutside(containerRef, () => setOpen(false));

    const filtered = useMemo(() => filterOptions(options, query), [options, query]);
    const selected = useMemo(
        () => options.find((opt) => opt.id === value), [options, value]
    );

    const isDisabled = disabled || blocked;

    const handleToggle = () => {
        if (isDisabled) return;
        setOpen((prev) => !prev);
    };

    const handleSelect = (id) => {
        onChange(id);
        setOpen(false);
        setQuery("");
    };

    let displayText = placeholder;
    if (selected) displayText = selected.label;
    else if (blocked) displayText = blockedMessage;

    return (
        <div className="relative w-full" ref={containerRef}>
            <button
                type="button"
                disabled={isDisabled}
                onClick={handleToggle}
                className={[
                    "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-violet-400",
                    isDisabled
                        ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                        : "border-violet-200 bg-white text-violet-700 hover:border-violet-400",
                ].join(" ")}
            >
                <span className="truncate text-left">{displayText}</span>
                <svg
                    className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                >
                    <path
                        d="M5 7.5L10 12.5L15 7.5"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>

            {open && !isDisabled && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-violet-200 bg-white shadow-lg">
                    <div className="border-b border-violet-100 p-2">
                        <input
                            autoFocus
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search..."
                            className="w-full rounded-lg border border-violet-200 px-2 py-1.5 text-sm text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                        {loading ? (
                            <div className="px-3 py-3 text-sm text-gray-400">{loadingMessage}</div>
                        ) : filtered.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-gray-400">{emptyMessage}</div>
                        ) : (
                            filtered.map((opt) => (
                                <div key={opt.id} onClick={() => handleSelect(opt.id)}
                                    className={["cursor-pointer px-3 py-2 text-sm hover:bg-violet-50",
                                        opt.id === value ? "bg-violet-100 font-medium text-violet-700" : "text-gray-700",
                                    ].join(" ")}
                                >
                                    <span>{opt.label}</span>
                                    {opt.sublabel && (
                                        <span className="ml-1.5 text-xs text-gray-400">{opt.sublabel}</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ============================================================================
 * DEPARTMENT SELECT
 *
 * modes:
 *   "normal" -> Task / Project / Employee "Department" pickers
 *   "parent" -> Department form's "Parent Department" picker (supports excludeId)
 *
 * Role behavior:
 *   admin / hr  -> all active departments (GET /api/departments?status=active)
 *   manager     -> same endpoint; the backend now scopes results to
 *                  departments where headOf === req.user._id (see backend
 *                  change below). We deliberately do NOT filter on the
 *                  frontend only, since that would be fake security.
 *   team-lead / employee / other -> use the department already attached to
 *                  the logged-in user (existing hierarchy) instead of
 *                  fetching the full list.
 * ==========================================================================*/

function DepartmentSelect({ value, onChange, mode = "normal", excludeId = null, disabled = false, placeholder, }) {

    const { user: currentUser } = useAuth();

    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(false);
    const role = roleOf(currentUser?.role);

    useEffect(() => {
        let cancelled = false;
        // Admin / HR / Manager all go through the same authenticated endpoint.
        // The backend applies manager scoping itself (req.user), so the
        // frontend just displays whatever comes back.
        if (role === "admin" || role === "hr" || role === "manager") {
            async function loadDepartments() {
                setLoading(true);
                try {
                    const res = await api.get("/departments", { params: { status: "active", page: 1, limit: 100 }, });
                    if (!cancelled) {
                        setDepartments(asArray(res?.data?.departments));
                    }
                } catch (err) {
                    if (!cancelled) {
                        toast.error(err.response?.data?.message || "Failed to load departments");
                        setDepartments([]);
                    }
                } finally {
                    if (!cancelled) setLoading(false);
                }
            }
            loadDepartments();
        } else {
            // Team lead / employee / other roles: use the department already
            // present on the logged-in user rather than calling the list API.
            const ownDepartment = currentUser?.department;
            setDepartments(ownDepartment ? [ownDepartment] : []);
        }

        return () => {
            cancelled = true;
        };
        // Only role + currentUser identity should trigger a reload; we don't
        // want this list refetched every time the *selected* value changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, currentUser?._id, currentUser?.department?._id]);

    const options = useMemo(() => {
        let list = departments;
        if (mode === "parent" && excludeId) {
            list = list.filter((dept) => dept._id !== excludeId);
        }
        return list.map((dept) => ({ id: dept._id, label: dept.name, sublabel: dept.code, }));
    }, [departments, mode, excludeId]);

    const resolvedPlaceholder =
        placeholder || (mode === "parent" ? "Select Parent Department" : "Select Department");

    return (
        <BaseSearchableSelect
            options={options}
            value={value}
            onChange={onChange}
            loading={loading}
            disabled={disabled}
            placeholder={resolvedPlaceholder}
            loadingMessage="Loading departments..."
            emptyMessage="No departments found"
        />
    );
}

/* ============================================================================
 * PROJECT SELECT
 *
 * Depends on a selected department:
 *   no departmentId -> disabled, "Select department first"
 *   departmentId set -> GET /api/projects?department=ID&page=1&limit=100
 *
 * Role filtering (admin/hr/manager/team-lead) is already applied server-side
 * by the existing Project controller, so the frontend does not duplicate it.
 * Reloads ONLY when departmentId changes (see effect dependency array).
 * ==========================================================================*/

function ProjectSelect({
    value,
    onChange,
    departmentId,
    disabled = false,
    placeholder = "Select Project",
}) {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!departmentId) {
            setProjects([]);
            return undefined;
        }

        let cancelled = false;
        async function loadProjects() {
            setLoading(true);
            try {
                const res = await api.get("/projects", {
                    params: { department: departmentId, page: 1, limit: 100 },
                });
                if (!cancelled) {
                    setProjects(asArray(res?.data?.projects));
                }
            } catch (err) {
                if (!cancelled) {
                    toast.error(err.response?.data?.message || "Failed to load projects");
                    setProjects([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadProjects();

        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    const options = useMemo(
        () =>
            projects.map((project) => ({
                id: project._id,
                label: project.name,
                sublabel: project.projectCode,
            })),
        [projects]
    );

    return (
        <BaseSearchableSelect
            options={options}
            value={value}
            onChange={onChange}
            loading={loading}
            disabled={disabled}
            blocked={!departmentId}
            blockedMessage="Select department first"
            placeholder={placeholder}
            loadingMessage="Loading projects..."
            emptyMessage="No projects found for this department"
        />
    );
}

/* ============================================================================
 * EMPLOYEE SELECT
 *
 * modes:
 *   "assigned-to"     -> Task's "Assigned To". Uses the `employees` prop
 *                        (selectedProject.teamMembers) directly; makes NO
 *                        API call of its own. Pass `blocked` to indicate no
 *                        project is selected yet, vs. an empty team list.
 *   "team-lead"       -> Project's "Team Lead". Fetches
 *                        GET /api/employees?department=ID&isActive=true and
 *                        filters to role === "team-lead". Reloads only when
 *                        departmentId changes.
 *   "department-head" -> Department's "Head of Department". Fetches ALL
 *                        active employees (an employee may head multiple
 *                        departments, so nothing is excluded), sorted by the
 *                        fixed role order below, then by name.
 * ==========================================================================*/

// Fixed role ordering for "department-head" mode. Unknown/custom roles sort
// after every named role, per spec section 18.
const HEAD_ROLE_ORDER = ["manager", "team-lead", "hr", "sales", "field_sales", "employee"];

function headRoleRank(role) {
    const idx = HEAD_ROLE_ORDER.indexOf(roleOf(role));
    return idx === -1 ? HEAD_ROLE_ORDER.length : idx;
}

const EMPLOYEE_MODE_DEFAULTS = {
    "assigned-to": {
        placeholder: "Select Employee",
        blockedMessage: "Select project first",
        emptyMessage: "No employees assigned to this project",
        loadingMessage: "Loading employees...",
    },
    "team-lead": {
        placeholder: "Select Team Lead",
        blockedMessage: "Select department first",
        emptyMessage: "No team leads found",
        loadingMessage: "Loading team leads...",
    },
    "department-head": {
        placeholder: "Select Head of Department",
        blockedMessage: "Select an option first",
        emptyMessage: "No employees found",
        loadingMessage: "Loading employees...",
    },
};

function EmployeeSelect({
    value,
    onChange,
    mode,
    departmentId,
    projectId,          // NEW: required for assigned-to mode
    employees = [],     // keep for backward compatibility with other forms
    blocked = false,
    disabled = false,
    placeholder,
}) {
    const [fetched, setFetched] = useState([]);
    const [loading, setLoading] = useState(false);

    console.log("EmployeeSelect mode:", mode, "departmentId:", departmentId, "blocked:", blocked);
    // const { user: currentUser } = useAuth();

    /* ============================================================================
  * EMPLOYEE SELECT
  *
  * modes:
  *   "assigned-to"
  *       -> Task's "Assigned To".
  *       -> Uses projectId.
  *       -> Fetches GET /projects/:projectId.
  *       -> Uses that exact project's teamMembers.
  *       -> Also includes manager/projectManager where applicable.
  *
  *   "team-lead"
  *       -> Fetches GET /employees?department=ID&isActive=true
  *       -> Filters to role === "team-lead".
  *
  *   "department-head"
  *       -> Fetches ALL active employees.
  * ==========================================================================*/
    useEffect(() => {
        if (mode !== "assigned-to") return undefined;

        if (!projectId) {
            setFetched([]);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;

        async function loadProjectMembers() {
            setLoading(true);

            try {
                const res = await api.get(`/projects/${projectId}`);

                const project =
                    res?.data?.project ||
                    res?.data;

                const members = [
                    ...(project?.teamMembers || []),
                ];
                // Include project manager
                if (project?.manager && !members.some((member) => String(member?._id) === String(project.manager?._id))) {
                    members.unshift(project.manager);
                }
                // Include projectManager if your project response uses this field
                if (project?.projectManager && !members.some((member) => String(member?._id) === String(project.projectManager?._id))) {
                    members.unshift(project.projectManager);
                }
                if (!cancelled) {
                    setFetched(members);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("Failed to load project members:", err);
                    toast.error(err.response?.data?.message || "Failed to load project members");
                    setFetched([]);
                }
            } finally {
                if (!cancelled) { setLoading(false); }
            }
        }
        loadProjectMembers();
        return () => { cancelled = true; };
    }, [mode, projectId]);
    useEffect(() => {
        if (mode !== "team-lead") return undefined;
        if (!departmentId) {
            setFetched([]);
            return undefined;
        }
        let cancelled = false;
        async function loadTeamLeads() {
            setLoading(true);
            try {
                const res = await api.get("/employees", { params: { department: departmentId, isActive: true }, });
                console.log("EMPLOYEE API RESPONSE:", res.data);
                if (!cancelled) {
                    const list = asArray(res?.data);
                    setFetched(list);
                }
            } catch (err) {
                if (!cancelled) {
                    toast.error(err.response?.data?.message || "Failed to load employees");
                    setFetched([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadTeamLeads();

        return () => { cancelled = true; };
    }, [mode, departmentId]);

    // --- "department-head" mode: fetch ALL active employees, independent of
    // any department selection ---
    useEffect(() => {
        if (mode !== "department-head") return undefined;

        let cancelled = false;
        async function loadAllEmployees() {
            setLoading(true);
            try {
                const res = await api.get("/employees", { params: { isActive: true } });
                if (!cancelled) {
                    setFetched(asArray(res?.data));
                }
            } catch (err) {
                if (!cancelled) {
                    toast.error(err.response?.data?.message || "Failed to load employees");
                    setFetched([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadAllEmployees();
        return () => { cancelled = true; };
    }, [mode]);

    // "assigned-to" mode never fetches — it only reads the `employees` prop
    // (selectedProject.teamMembers), supplied by the parent form.
    const sourceList = fetched;
    const options = useMemo(() => {
        // Copy before sorting so we never mutate the prop / API response array.
        const list = asArray(sourceList).slice();
        if (mode === "department-head") {
            list.sort((a, b) => {
                const rankDiff = headRoleRank(a.role) - headRoleRank(b.role);
                if (rankDiff !== 0) return rankDiff;
                return String(a.name || "").localeCompare(String(b.name || ""));
            });
        }

        return list.map((emp) => ({
            id: emp._id,
            label: emp.name,
            sublabel: emp.employeeId,
        }));
    }, [sourceList, mode]);

    const defaults = EMPLOYEE_MODE_DEFAULTS[mode] || EMPLOYEE_MODE_DEFAULTS["department-head"];

    const isBlocked = mode === "team-lead" ? !departmentId : mode === "assigned-to" ? !projectId : false;

    const isLoading = loading;

    return (
        <BaseSearchableSelect
            options={options}
            value={value}
            onChange={onChange}
            loading={isLoading}
            disabled={disabled}
            blocked={isBlocked}
            blockedMessage={defaults.blockedMessage}
            placeholder={placeholder || defaults.placeholder}
            loadingMessage={defaults.loadingMessage}
            emptyMessage={defaults.emptyMessage}
        />
    );
}

/* ============================================================================
 * EMPLOYEE MULTI SELECT
 *
 * Used for Project -> Team Members.
 *
 * Fetches all active employees belonging to the selected department.
 * Supports:
 *   - Search
 *   - Multiple checkbox selection
 *   - Excluding the selected manager/team lead
 *   - Department dependency
 * ==========================================================================*/

function EmployeeMultiSelect({
    value = [],
    onChange,
    departmentId,
    excludeId = null,
    disabled = false,
    label = "Team Members",
}) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!departmentId) {
            setEmployees([]);
            return undefined;
        }
        let cancelled = false;
        async function loadEmployees() {
            setLoading(true);
            try {
                const res = await api.get("/employees", { params: { department: departmentId, isActive: true, }, });
                if (!cancelled) { setEmployees(asArray(res?.data)); }
            } catch (err) {
                if (!cancelled) { toast.error(err.response?.data?.message || "Failed to load employees"); setEmployees([]); }
            } finally {
                if (!cancelled) { setLoading(false); }
            }
        }
        loadEmployees();
        return () => { cancelled = true; };
    }, [departmentId]);

    const filteredEmployees = useMemo(() => {
        const q = query.trim().toLowerCase();
        return employees.filter((employee) => employee._id !== excludeId).filter((employee) => {
            if (!q) return true;
            return (String(employee.name || "").toLowerCase().includes(q) || String(employee.employeeId || "").toLowerCase().includes(q) || String(employee.email || "").toLowerCase().includes(q));
        });
    }, [employees, excludeId, query]);

    const selectedIds = Array.isArray(value) ? value : [];

    const toggleEmployee = (employeeId) => {
        if (selectedIds.includes(employeeId)) {
            onChange(selectedIds.filter((id) => id !== employeeId));
        } else {
            onChange([...selectedIds, employeeId,]);
        }
    };

    return (
        <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {label}
            </label>

            <div
                className={[
                    "rounded-xl border border-gray-100 p-2.5",
                    disabled ? "bg-gray-50" : "bg-white",
                ].join(" ")}
            >
                {/* Department not selected */}
                {!departmentId && (
                    <p className="px-1 py-2 text-xs text-gray-300">
                        Select a department first
                    </p>
                )}

                {/* Loading */}
                {departmentId && loading && (
                    <p className="px-1 py-2 text-xs text-gray-300">
                        Loading employees…
                    </p>
                )}

                {/* Search */}
                {departmentId && !loading && employees.length > 0 && (
                    <div className="mb-2">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) =>
                                setQuery(e.target.value)
                            }
                            placeholder="Search employees..."
                            disabled={disabled}
                            className="w-full rounded-lg border border-violet-200 px-2.5 py-2 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-100"
                        />
                    </div>
                )}

                {/* Empty */}
                {departmentId &&
                    !loading &&
                    employees.length === 0 && (
                        <p className="px-1 py-2 text-xs text-gray-300">
                            No employees found in this department.
                        </p>
                    )}

                {/* Search empty */}
                {departmentId &&
                    !loading &&
                    employees.length > 0 &&
                    filteredEmployees.length === 0 && (
                        <p className="px-1 py-2 text-xs text-gray-300">
                            No matching employees found.
                        </p>
                    )}

                {/* Employee list */}
                {departmentId &&
                    !loading &&
                    filteredEmployees.length > 0 && (
                        <div className="max-h-40 space-y-1 overflow-y-auto">
                            {filteredEmployees.map((employee) => {
                                const checked =
                                    selectedIds.includes(
                                        employee._id
                                    );

                                return (
                                    <label
                                        key={employee._id}
                                        className={[
                                            "flex items-center gap-2 rounded-lg px-1.5 py-1.5",
                                            disabled
                                                ? "cursor-not-allowed opacity-60"
                                                : "cursor-pointer hover:bg-gray-50",
                                        ].join(" ")}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={disabled}
                                            onChange={() =>
                                                toggleEmployee(
                                                    employee._id
                                                )
                                            }
                                            className="rounded border-gray-300 text-violet-600 focus:ring-violet-200"
                                        />

                                        <div className="min-w-0">
                                            <div className="text-xs font-medium text-gray-600">
                                                {employee.name}
                                            </div>

                                            {employee.employeeId && (
                                                <div className="text-[10px] text-gray-400">
                                                    {employee.employeeId}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}
            </div>

            {/* Selected count */}
            {selectedIds.length > 0 && (
                <p className="mt-1.5 text-[11px] text-gray-400">
                    {selectedIds.length} employee
                    {selectedIds.length !== 1 ? "s" : ""} selected
                </p>
            )}
        </div>
    );
}

export { DepartmentSelect, ProjectSelect, EmployeeSelect, EmployeeMultiSelect };