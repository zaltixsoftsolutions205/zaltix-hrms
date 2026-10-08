import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../../utils/api";
import ModuleAccessPicker from "./ModuleAccessPicker";
import { DepartmentSelect, ProjectSelect, } from "./Assignmentselects";

const PRESET_ROLES = [
    "employee",
    "manager",
    "team-lead",
    "sales",
    "inside-sales",
    "product-executive",
    "hr",
    "technical_associate",
    "bda",
];

const INITIAL_FORM = {
    employeeId: "",
    name: "",
    email: "",
    role: "employee",
    customRole: "",
    departmentId: "",
    projectId: "",
    designation: "",
    phone: "",
    joiningDate: "",
    basicSalary: "",
    employeeType: "experienced",
    moduleAccess: [],
};

function Field({
    label,
    className = "",
    ...props
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-violet-700 mb-1">
                {label}
            </label>

            <input
                {...props}
                className={`w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 ${className}`}
            />
        </div>
    );
}

function SelectField({
    label,
    children,
    className = "",
    ...props
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-violet-700 mb-1">
                {label}
            </label>

            <select
                {...props}
                className={`w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 ${className}`}
            >
                {children}
            </select>
        </div>
    );
}

export default function EmployeeForm({
    mode = "create",
    employee = null,

    loading = false,

    onSubmit,
    onCancel,
}) {
    const isEdit = mode === "edit";

    const [form, setForm] = useState(INITIAL_FORM);

    /*
     * =========================================================
     * LOAD DEPARTMENTS
     * =========================================================
     */

    // useEffect(() => {
    //     const loadDepartments = async () => {
    //         try {
    //             setDepartmentLoading(true);

    //             const res = await api.get("/departments");

    //             const data = res.data;

    //             const list =
    //                 data?.departments ||
    //                 data?.data ||
    //                 (Array.isArray(data) ? data : []);

    //             setDepartments(list);
    //         } catch (err) {
    //             toast.error(
    //                 err.response?.data?.message ||
    //                 "Failed to load departments"
    //             );
    //         } finally {
    //             setDepartmentLoading(false);
    //         }
    //     };

    //     loadDepartments();
    // }, []);

    /*
     * =========================================================
     * INITIALIZE FORM
     * =========================================================
     *
     * Works for BOTH:
     *
     * CREATE
     * EDIT
     */

    useEffect(() => {
        if (!employee) {
            setForm(INITIAL_FORM);
            return;
        }

        const employeeRole = employee.role || "employee";

        const isPresetRole = PRESET_ROLES.includes(employeeRole);

        setForm({
            employeeId: employee.employeeId || "",
            name: employee.name || "",
            email: employee.email || "",
            role: isPresetRole ? employeeRole : "custom",
            customRole: isPresetRole ? "" : employeeRole,

            /*
             * Support all possible populated/unpopulated
             * department formats.
             */
            departmentId: employee.department?._id || employee.departmentId || employee.department || "",
            /*
             * Support populated/unpopulated project.
             */
            projectId: employee.project?._id || employee.projectId || employee.project || "",
            designation: employee.designation || "",
            phone: employee.phone || "",
            joiningDate: employee.joiningDate ? new Date(employee.joiningDate).toISOString().split("T")[0] : "",
            basicSalary: employee.basicSalary ?? "",
            employeeType: employee.employeeType || "experienced",

            moduleAccess: Array.isArray(employee.moduleAccess) ? employee.moduleAccess.map((item) => ({ module: item.module, permission: item.permission, })) : [],
        });
    }, [employee]);
    /*
     * =========================================================
     * LOAD PROJECTS
     * =========================================================
     *
     * Projects are required only for Team Lead.
     *
     * We also load projects in edit mode when an existing
     * project is already assigned.
     */
    // useEffect(() => {
    //     const shouldLoadProjects = form.role === "team-lead" || Boolean(form.projectId);
    //     if (!shouldLoadProjects) {
    //         setProjects([]);
    //         return;
    //     }
    //     const loadProjects = async () => {
    //         try {
    //             setProjectLoading(true);
    //             const params = {};
    //             /*
    //              * Only request projects for the selected department.
    //              */
    //             if (form.departmentId) {params.department = form.departmentId;}

    //             const res = await api.get("/projects", {params,});
    //             const data = res.data;
    //             const list = data?.projects || data?.data || (Array.isArray(data) ? data : []);
    //             setProjects(list);
    //         } catch (err) {
    //             toast.error(err.response?.data?.message || "Failed to load projects");
    //         } finally {
    //             setProjectLoading(false);
    //         }
    //     };
    //     loadProjects();
    // },[form.departmentId, form.role, form.projectId]);
    /*
     * =========================================================
     * AVAILABLE PROJECTS
     * =========================================================
     *
     * Extra frontend protection:
     *
     * Only projects belonging to the selected department
     * are displayed.
     */
    /*
     * =========================================================
     * FIELD UPDATE
     * =========================================================
     */

    const updateField = (key, value) => {
        setForm((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    /*
     * =========================================================
     * ROLE CHANGE
     * =========================================================
     *
     * Manager:
     *   Department required
     *
     * Team Lead:
     *   Department required
     *   Project required
     *
     * Other roles:
     *   Project is removed
     */

    const handleRoleChange = (e) => {
        const role = e.target.value;

        setForm((prev) => ({
            ...prev,
            role,
            customRole: "",
            projectId: role === "team-lead" ? prev.projectId : "",
        }));
    };
    /*
     * =========================================================
     * DEPARTMENT CHANGE
     * =========================================================
     *
     * Whenever department changes:
     *
     * Manager:
     *   gets new department
     *
     * Team Lead:
     *   gets new department
     *   old project is removed because it may belong
     *   to the previous department.
     */
    // const handleDepartmentChange = (e) => {
    //     const departmentId = e.target.value;
    //     setForm((prev) => ({
    //         ...prev,
    //         departmentId,
    //         /*
    //          * Project must be re-selected after changing
    //          * department.
    //          */
    //         projectId: "",
    //     }));
    // };
    /*
     * =========================================================
     * VALIDATION
     * =========================================================
     */
    const validate = () => {
        if (!form.employeeId.trim()) {
            toast.error("Employee ID is required");
            return false;
        }
        if (!form.name.trim()) {
            toast.error("Employee name is required");
            return false;
        }
        if (!form.email.trim()) {
            toast.error("Email is required");
            return false;
        }
        if (form.role === "custom" && !form.customRole.trim()) {
            toast.error("Please enter a custom role");
            return false;
        }
        /*
         * MANAGER
         */
        if (form.role === "manager" && !form.departmentId) {
            toast.error("Please assign a department to the manager");
            return false;
        }
        /*
         * TEAM LEAD
         */
        if (form.role === "team-lead" && !form.departmentId) {
            toast.error("Please assign a department to the team lead");
            return false;
        }
        if (form.role === "team-lead" && !form.projectId) {
            toast.error("Please assign a project to the team lead");
            return false;
        }
        return true;
    };

    /*
     * =========================================================
     * SUBMIT
     * =========================================================
     */

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) {
            return;
        }

        const payload = {
            employeeId: form.employeeId || undefined,
            name: form.name.trim(),
            email: form.email.trim(),
            role: form.role === "custom" ? form.customRole.trim() : form.role,
            designation: form.designation,
            phone: form.phone,
            joiningDate: form.joiningDate || undefined,
            basicSalary: Number(form.basicSalary) || 0,
            employeeType: form.employeeType,
            /*
             * Manager + Team Lead:
             * department assignment.
             *
             * Other employees:
             * department is optional.
             */
            departmentId: form.departmentId || null,
            /*
             * ONLY TEAM LEAD receives projectId.
             */
            projectId: form.role === "team-lead" ? form.projectId || null : null,
            moduleAccess: form.moduleAccess,
        };

        /*
         * HREmployees decides:
         *
         * CREATE -> POST /employees
         * EDIT   -> PUT /employees/:id
         */
        onSubmit(payload, form);
    };

    /*
     * =========================================================
     * RENDER
     * =========================================================
     */

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* =====================================================
          BASIC INFORMATION
      ===================================================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Employee ID *" value={form.employeeId} onChange={(e) => updateField("employeeId", e.target.value)} placeholder="e.g. EMP001" required />
                <Field label="Name *" value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Employee full name" required />
                <Field label="Email *" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="Login email" required />
            </div>
            {/* =====================================================
          DESIGNATION / PHONE
      ===================================================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Designation" value={form.designation} onChange={(e) => updateField("designation", e.target.value)} placeholder="Job title" />
                <Field label="Phone" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="Phone number" />
            </div>
            {/* =====================================================
          ROLE
      ===================================================== */}

            <SelectField label="Role" value={form.role} onChange={handleRoleChange}>
                {PRESET_ROLES.map((role) => (
                    <option key={role} value={role}>
                        {role}
                    </option>
                ))}

                <option value="custom">Custom…</option>
            </SelectField>
            {/* CUSTOM ROLE */}
            {form.role === "custom" && (
                <Field label="Custom Role" placeholder="Enter custom role" value={form.customRole} onChange={(e) => updateField("customRole", e.target.value)} />
            )}

            {/* =====================================================
          DEPARTMENT
      ===================================================== */}

            <div className={form.role === "team-lead" ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>

                <DepartmentSelect
                    value={form.departmentId}
                    onChange={(value) => {
                        setForm((prev) => ({
                            ...prev,
                            departmentId: value,
                            projectId: "",
                        }));
                    }}
                />

                {/* =================================================
            TEAM LEAD PROJECT
        ================================================= */}

                {form.role === "team-lead" && (
                    <ProjectSelect
                        value={form.projectId}
                        onChange={(value) => {
                            updateField("projectId", value);
                        }}
                        departmentId={form.departmentId}
                    />
                )}

            </div>

            {/* =====================================================
          ROLE ASSIGNMENT INFORMATION
      ===================================================== */}

            {(form.role === "manager" ||
                form.role === "team-lead") && (
                    <div className="border border-violet-100 rounded-xl p-3 bg-violet-50/40">

                        <p className="text-xs font-semibold text-violet-800">

                            {form.role === "manager"
                                ? "Manager Assignment"
                                : "Team Lead Assignment"}

                        </p>

                        <p className="text-xs text-violet-500 mt-1">

                            {form.role === "manager"
                                ? "This employee will be assigned as the manager of the selected department."
                                : "This employee will be assigned as the team lead for the selected department and project."}

                        </p>

                    </div>
                )}

            {/* =====================================================
          JOINING DATE / SALARY
      ===================================================== */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <Field
                    label="Joining Date"
                    type="date"
                    value={form.joiningDate}
                    onChange={(e) =>
                        updateField(
                            "joiningDate",
                            e.target.value
                        )
                    }
                />

                <Field
                    label="Basic Salary (₹)"
                    type="number"
                    value={form.basicSalary}
                    onChange={(e) =>
                        updateField(
                            "basicSalary",
                            e.target.value
                        )
                    }
                />

            </div>

            {/* =====================================================
          EMPLOYEE TYPE
      ===================================================== */}

            <SelectField
                label="Employee Type"
                value={form.employeeType}
                onChange={(e) =>
                    updateField(
                        "employeeType",
                        e.target.value
                    )
                }
            >

                <option value="fresher">
                    Fresher
                </option>

                <option value="experienced">
                    Experienced
                </option>

            </SelectField>

            {/* =====================================================
          MODULE ACCESS
      ===================================================== */}

            <div className="border-t border-violet-100 pt-3">

                <ModuleAccessPicker
                    value={form.moduleAccess}
                    onChange={(access) =>
                        updateField(
                            "moduleAccess",
                            access
                        )
                    }
                />

            </div>

            {/* =====================================================
          ACTION BUTTONS
      ===================================================== */}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">

                <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
                >

                    {loading
                        ? isEdit
                            ? "Saving…"
                            : "Creating…"
                        : isEdit
                            ? "Save Changes"
                            : "Create Employee"}

                </button>

                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-2.5 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-sm font-semibold transition-colors"
                >
                    Cancel
                </button>

            </div>

        </form>
    );
}