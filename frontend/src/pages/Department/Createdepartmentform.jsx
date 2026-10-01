import React, { useState, useEffect, useMemo, } from "react";
import { Search } from "lucide-react";
import toast from "react-hot-toast";
import ModuleAccessPicker from "../../components/UI/ModuleAccessPicker";

import { ROLE_DEFAULT_ACCESS, PERMISSIONS, } from "../../constants/modules";
import api from "../../utils/api";
import { DepartmentSelect, EmployeeSelect, } from "../../components/UI/Assignmentselects";
const initialForm = { name: "", code: "", description: "", status: "active", headOf: "", parentDepartment: "", members: [], moduleAccess: [], };

// =====================================================
// Get Effective Module Access
// =====================================================
const getEffectiveModuleAccess = (employee) => {
    if (!employee) { return []; }
    // Explicit permissions
    if (Array.isArray(employee.moduleAccess) && employee.moduleAccess.length > 0) {
        return employee.moduleAccess.map((item) => ({ module: item.module, permission: item.permission || PERMISSIONS.VIEW, }));
    }
    // Role default permissions
    return (ROLE_DEFAULT_ACCESS[employee.role] || []).map((item) => ({
        module: item.module,
        permission: item.permission || PERMISSIONS.VIEW,
    }));
};
// =====================================================
// Component
// =====================================================
const CreateDepartmentForm = ({ open, onClose, onCreated, department, }) => {
    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [memberSearch, setMemberSearch] = useState("");
    // =====================================================
    // Edit Mode
    // =====================================================
    const isEdit = Boolean(department?._id);
    // =====================================================
    // Initial Form
    // =====================================================
    const getInitialForm = (dept) => {
        const headId = dept?.headOf?._id || dept?.headOf || "";
        return {
            name: dept?.name || "",
            code: dept?.code || "",
            description: dept?.description || "",
            status: dept?.status || "active",
            headOf: headId,
            parentDepartment: dept?.parentDepartment?._id || dept?.parentDepartment || "",
            members: [],
            moduleAccess: dept?.headOf?.moduleAccess || [],
        };
    };
    // =====================================================
    // Load Employees + Departments
    // =====================================================
    useEffect(() => {
        if (!open) {
            return;
        }
        setMemberSearch("");
        const loadDirectories = async () => {
            try {
                const [employeesRes, departmentsRes] = await Promise.all([
                    api.get("/employees"),
                    api.get("/departments", {
                        params: { limit: 1000, },
                    }),
                ]);

                // =================================================
                // Employees
                // =================================================
                const employeeList =
                    employeesRes.data?.employees ||
                    employeesRes.data?.users ||
                    employeesRes.data?.data ||
                    employeesRes.data ||
                    [];

                // =================================================
                // Departments
                // =================================================
                const departmentList =
                    departmentsRes.data?.departments || [];

                setEmployees(
                    Array.isArray(employeeList)
                        ? employeeList
                        : []
                );

                setDepartments(
                    Array.isArray(departmentList)
                        ? departmentList
                        : []
                );
                // =================================================
                // EDIT MODE
                // =================================================
                if (department?._id) {
                    const departmentId = String(department._id);
                    const headId = String(
                        department.headOf?._id || department.headOf || ""
                    );

                    // =================================================
                    // Department has no `members` field - User.department
                    // is the source of truth. Derive the checked members
                    // from the employee list we just fetched: an employee
                    // is checked when employee.department === department._id.
                    // =================================================
                    const safeEmployeeList = Array.isArray(employeeList) ? employeeList : [];

                    const currentMemberIds = safeEmployeeList
                        .filter((employee) => {
                            const employeeDeptId =
                                employee.department?._id ||
                                employee.department ||
                                null;
                            return (
                                employeeDeptId &&
                                String(employeeDeptId) === departmentId
                            );
                        })
                        .map((employee) => String(employee._id));

                    // =================================================
                    // Head must always be selected/checked, even in the
                    // edge case where their User.department doesn't
                    // point at this department (managers can head a
                    // department without their department field being set).
                    // =================================================
                    if (headId && !currentMemberIds.includes(headId)) {
                        currentMemberIds.push(headId);
                    }

                    // =================================================
                    // Initialize Edit Form
                    // =================================================
                    setForm({
                        ...getInitialForm(department),
                        members: currentMemberIds,
                    });
                } else {
                    // =================================================
                    // CREATE MODE
                    // =================================================
                    setForm(getInitialForm(null));
                }
            } catch (err) {
                console.error(
                    "Failed to load employees/departments:",
                    err
                );

                setEmployees([]);
                setDepartments([]);
                setForm(getInitialForm(department));

                toast.error(
                    "Failed to load department data."
                );
            }
        };

        loadDirectories();
    }, [open, department]);
    // =====================================================
    // Normal Input Change
    // =====================================================
    const handleChange = (e) => {
        const { name, value, } = e.target;
        setForm((prev) => ({ ...prev, [name]: value, }));
    };
    // =====================================================
    // Toggle Normal Member
    // =====================================================
    const toggleMember = (userId) => {
        const id = String(userId);
        setForm((prev) => {
            // Department head cannot be removed
            if (String(prev.headOf) === id) { return prev; }
            const alreadySelected = prev.members.some((memberId) => String(memberId) === id);
            return { ...prev, members: alreadySelected ? prev.members.filter((memberId) => String(memberId) !== id) : [...prev.members, id,], };
        });
    };
    // =====================================================
    // Available Employees
    // =====================================================
    //
    // CREATE:
    //   - Employees without department
    //   - Managers are available for head selection,
    //     but normal member list should not treat
    //     managers as normal employees.
    //
    // EDIT:
    //   - Current department employees
    //   - Employees without department
    //   - Current head
    //
    // NOTE: "current head" here is driven by the LIVE
    // form.headOf selection (not the original department
    // prop). This is what makes the member checklist react
    // immediately when the admin picks/changes the Head of
    // Department dropdown, instead of only updating on the
    // next form open.
    //
    // =====================================================
    const availableEmployees = useMemo(() => {
        const currentDepartmentId = department?._id ? String(department._id) : null;
        const currentHeadId = form.headOf ? String(form.headOf) : null;
        return employees.filter((employee) => {
            // =====================================================
            // Only active employees
            // =====================================================
            if (employee.isActive === false) {
                return false;
            }
            const employeeId = String(employee._id);
            const role = String(employee.role || "").toLowerCase();
            const employeeDepartment = employee.department?._id || employee.department || null;
            const employeeDepartmentId = employeeDepartment ? String(employeeDepartment) : null;
            // =====================================================
            // Currently Selected Department Head
            // =====================================================
            //
            // Always show the selected head.
            // He will be checked + disabled.
            //
            if (currentHeadId && employeeId === currentHeadId) {
                return true;
            }
            // =====================================================
            // Managers
            // =====================================================
            //
            // Other managers are NOT normal department
            // members.
            //
            if (role === "manager") {
                return false;
            }
            // =====================================================
            // CREATE MODE
            // =====================================================
            // Only employees without a department.
            if (!currentDepartmentId) {
                return !employeeDepartmentId;
            }
            // =====================================================
            // EDIT MODE
            // =====================================================
            //
            // Show employees already belonging to this
            // department.
            //
            if (employeeDepartmentId === currentDepartmentId) {
                return true;
            }
            // =====================================================
            // EDIT MODE
            // =====================================================
            //
            // Also show employees who are currently
            // unassigned.
            //
            if (!employeeDepartmentId) {
                return true;
            }
            // =====================================================
            // Employees belonging to another department
            // are hidden.
            // =====================================================
            return false;
        });
    }, [employees, department, form.headOf,]);
    // =====================================================
    // Head Candidates
    // =====================================================
    //
    // All active employees can be selected as head.
    // Managers may head multiple departments.
    //
    // =====================================================
    const headCandidates = useMemo(() => {
        return employees.filter((employee) => employee.isActive !== false);
    }, [employees,]);
    // =====================================================
    // Search Members
    // =====================================================
    const filteredEmployees =
        useMemo(() => {
            const value = memberSearch.trim().toLowerCase();
            if (!value) { return availableEmployees; }
            return availableEmployees.filter(
                (employee) =>
                    employee.name?.toLowerCase().includes(value) ||
                    employee.employeeId?.toLowerCase().includes(value) ||
                    employee.email?.toLowerCase().includes(value)
            );
        }, [availableEmployees, memberSearch,]);
    // =====================================================
    // Change Department Head
    // =====================================================
    const handleHeadChange = (e) => {
        const headId = e.target.value;
        const selectedEmployee = employees.find((employee) => String(employee._id) === String(headId));
        setForm((prev) => {
            let nextMembers = [...prev.members,];
            // =============================================
            // Remove previous head
            // =============================================
            if (prev.headOf) {
                nextMembers = nextMembers.filter((memberId) => String(memberId) !== String(prev.headOf));
            }
            // =============================================
            // Add new head
            // =============================================
            if (headId) {
                const alreadyMember = nextMembers.some((memberId) => String(memberId) === String(headId));
                if (!alreadyMember) { nextMembers.push(String(headId)); }
            }
            return {
                ...prev,
                headOf: headId,
                members: nextMembers,
                moduleAccess: getEffectiveModuleAccess(selectedEmployee),
            };
        });
    };
    // =====================================================
    // Submit
    // =====================================================
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
            toast.error("Department name is required");
            return;
        }
        if (!form.headOf) {
            toast.error("Please select a Head of Department");
            return;
        }
        try {
            setSaving(true);


            // =============================================
            // Make sure head is always in members.
            //
            // form.members already reflects exactly what's
            // checked in the UI - if the admin unchecked
            // someone, they're simply absent here, and the
            // backend diffs against the live User.department
            // list to detect the removal.
            // =============================================

            const finalMembers = [...new Set([...(Array.isArray(form.members) ? form.members : []), form.headOf,]),].filter(Boolean).map(String);
            const payload = { ...form, members: finalMembers, };
            let response;
            if (isEdit) {
                response = await api.put(`/departments/${department._id}`, payload);
            } else {
                response = await api.post("/departments", payload);
            }
            if (response.data?.success) {
                toast.success(isEdit ? "Department updated successfully" : "Department created successfully");
                onCreated?.(response.data.department);
                onClose?.();
            }
        } catch (err) {
            console.error(isEdit ? "Failed to update department:" : "Failed to create department:", err);
            toast.error(err.response?.data?.message || (isEdit ? "Failed to update department" : "Failed to create department")
            );
        } finally { setSaving(false); }
    };
    // =====================================================
    // Don't Render When Closed
    // =====================================================
    if (!open) {
        return null;
    }

    // =====================================================
    // Render
    // =====================================================
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
                {/* ================================================= */}
                {/* Header */}
                {/* ================================================= */}
                <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            {isEdit ? "Edit Department" : "Create Department"}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            {isEdit ? "Update department details" : "Add a new department"}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
                        ×
                    </button>
                </div>
                {/* ================================================= */}
                {/* Form */}
                {/* ================================================= */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* ================================================= */}
                    {/* Name + Code */}
                    {/* ================================================= */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department Name</label>
                            <input type="text" name="name" value={form.name} onChange={handleChange} required className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1"> Department Code </label>
                            <input type="text" name="code" value={form.code} onChange={handleChange} placeholder="Auto-generated if left blank" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
                        </div>
                    </div>
                    {/* ================================================= */}
                    {/* Status */}
                    {/* ================================================= */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">  Status </label>
                        <select name="status" value={form.status} onChange={handleChange} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200">
                            <option value="active">  Active</option>
                            <option value="inactive"> Inactive</option>
                        </select>
                    </div>
                    {/* ================================================= */}
                    {/* Head + Parent */}
                    {/* ================================================= */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* ================================================= */}
                        {/* Head */}
                        {/* ================================================= */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1"> Head of Department</label>
                            <EmployeeSelect
                                value={form.headOf}
                                onChange={(headId) => {
                                    const selectedEmployee = employees.find(
                                        (employee) =>
                                            String(employee._id) === String(headId)
                                    );

                                    setForm((prev) => {
                                        let nextMembers = [...prev.members];

                                        // Remove previous head from members
                                        if (prev.headOf) {
                                            nextMembers = nextMembers.filter(
                                                (memberId) =>
                                                    String(memberId) !== String(prev.headOf)
                                            );
                                        }

                                        // Add new head to members
                                        if (headId) {
                                            const alreadyMember = nextMembers.some(
                                                (memberId) =>
                                                    String(memberId) === String(headId)
                                            );

                                            if (!alreadyMember) {
                                                nextMembers.push(String(headId));
                                            }
                                        }

                                        return {
                                            ...prev,
                                            headOf: headId,
                                            members: nextMembers,
                                            moduleAccess:
                                                getEffectiveModuleAccess(selectedEmployee),
                                        };
                                    });
                                }}
                                mode="department-head"
                                placeholder="Select Head of Department"
                            />
                            {/* Module Access */}
                            {form.headOf && (
                                <div className="mt-4 border border-violet-100 rounded-xl p-3 bg-violet-50/30">
                                    <ModuleAccessPicker value={form.moduleAccess} onChange={(next) => setForm((prev) => ({ ...prev, moduleAccess: next, }))} />
                                </div>
                            )}
                        </div>
                        {/* ================================================= */}
                        {/* Parent Department */}
                        {/* ================================================= */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1"> Parent Department </label>
                            <DepartmentSelect
                                value={form.parentDepartment}
                                onChange={(departmentId) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        parentDepartment: departmentId,
                                    }))
                                }
                                mode="parent"
                                excludeId={isEdit ? department?._id : null}
                                placeholder="Select Parent Department"
                            />
                        </div>
                    </div>
                    {/* ================================================= */}
                    {/* Description */}
                    {/* ================================================= */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1"> Description </label>
                        <textarea name="description" value={form.description} onChange={handleChange} rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" placeholder="Department description" />
                    </div>
                    {/* ================================================= */}
                    {/* Department Members */}
                    {/* ================================================= */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700">   Department Members </label>
                            <span className="text-xs text-gray-400"> {form.members.length}{" "} selected </span>
                        </div>
                        <div className="border border-gray-200 rounded-lg">
                            {/* Search */}
                            <div className="relative p-2 border-b border-gray-100">
                                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search employees" className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border-0 focus:outline-none focus:ring-0" />
                            </div>
                            {/* Employee List */}
                            <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                                {filteredEmployees.length === 0 ? (<p className="text-xs text-gray-400 px-3 py-3"> No available employees.</p>)
                                    : (filteredEmployees.map((employee) => {
                                        const employeeId = String(employee._id);
                                        const isHead = String(form.headOf) === employeeId;
                                        const checked = form.members.some((id) => String(id) === employeeId);
                                        return (
                                            <label key={employee._id} className={`flex items-center gap-2.5 px-3 py-2 text-sm ${isHead ? "bg-violet-50" : "hover:bg-gray-50"} cursor-pointer`}>
                                                <input type="checkbox" checked={checked} disabled={isHead} onChange={() => toggleMember(employee._id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-200" />
                                                <span className="text-gray-700">{employee.name}{employee.employeeId ? ` (${employee.employeeId})` : ""}</span>
                                                {isHead && (<span className="text-xs text-violet-600 font-medium ml-auto">Head</span>)}
                                            </label>
                                        );
                                    })
                                    )}
                            </div>
                        </div>
                    </div>
                    {/* ================================================= */}
                    {/* Actions */}
                    {/* ================================================= */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"> Cancel </button>
                        <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                            {saving ? (isEdit ? "Updating..." : "Creating...") : (isEdit ? "Update Department" : "Create Department")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
export default CreateDepartmentForm;