import { useState, useEffect, useMemo, useRef } from "react"; import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import EmptyState from '../../components/UI/EmptyState';
import CreateDepartmentForm from '../Department/Createdepartmentform';
import GlobalFilters from '../../components/UI/Globalfilters';

const SI = ({ d, d2, d3, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}{d3 && <path d={d3} />}
  </svg>
);

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
const KpiCard = ({ icon, value, label, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{ y: -3, scale: 1.01 }}
    className="glass-card p-4 rounded-2xl relative overflow-hidden"
  >
    <div className="flex items-start justify-between">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-violet-500/30">
        <SI d={icon} size={18} color="text-white" />
      </div>
    </div>
    <p className="text-2xl font-bold text-violet-900 mt-3 leading-none">{value}</p>
    <p className="text-xs text-violet-400 mt-1.5">{label}</p>
  </motion.div>
);

const AdminDepartments = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  // const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(null);


  // Search & filter UI state. `search`/`status` are also sent to the API
  // (getDepartments supports them server-side); we still filter client-side
  // too so typing feels instant against whatever page is already loaded.
  const [filters, setFilters] = useState({
    search: "",
    state: "",
    manager: "",
    project: "",
    employee: "",
    sort: "newest",
  });

  const fileInputRef = useRef(null);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    const extension = file.name
      .split(".")
      .pop()
      .toLowerCase();

    if (!["xlsx", "xls"].includes(extension)) {
      toast.error("Please select an Excel file.");
      e.target.value = "";
      return;
    }

    try {
      setImporting(true);

      const formData = new FormData();

      formData.append("file", file);

      const response = await api.post(
        "/departments/import",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const summary =
        response.data?.summary;

      if (summary) {
        if (summary.failed > 0) {
          toast.error(
            `Imported ${summary.created} department(s). ${summary.failed} failed.`
          );
        } else {
          toast.success(
            `${summary.created} department(s) imported successfully.`
          );
        }
      } else {
        toast.success(
          "Departments imported successfully."
        );
      }

      await fetchDepartments();
      // await fetchEmployees();

      if (
        response.data?.errors?.length
      ) {
        console.error(
          "Department import errors:",
          response.data.errors
        );
      }

    } catch (err) {
      console.error(
        "Department import failed:",
        err
      );

      toast.error(
        err.response?.data?.message ||
        "Department import failed."
      );
    } finally {
      setImporting(false);

      // Allows selecting the same file again.
      e.target.value = "";
    }
  };
  const handleExport = async () => {
    try {
      setExporting(true);

      const response = await api.get(
        "/departments/export",
        {
          responseType: "blob",
        }
      );

      const blob = new Blob(
        [response.data],
        {
          type:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
      );

      const url =
        window.URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;
      link.download = "departments.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Departments exported successfully.");
    } catch (err) {
      console.error(
        "Department export failed:",
        err
      );

      toast.error(
        err.response?.data?.message ||
        "Department export failed."
      );
    } finally {
      setExporting(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const params = {
        page: 1,
        limit: 100,
      };

      // Search
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }

      // State → Backend Department.status
      if (filters.state) {
        params.status = filters.state;
      }

      // Manager
      if (filters.manager) {
        params.manager = filters.manager;
      }

      // Project
      if (filters.project) {
        params.project = filters.project;
      }

      // Employee
      if (filters.employee) {
        params.employee = filters.employee;
      }

      const res = await api.get("/departments", {
        params,
      });

      if (res.data.success) {
        setDepartments(res.data.departments || []);
      }
    } catch (err) {
      console.error(
        "Failed to fetch departments:",
        err
      );

      toast.error(
        err.response?.data?.message ||
        "Failed to load departments"
      );
    }
  };

  // const fetchEmployees = async () => {
  //   try {
  //     const res = await api.get('/employees');
  //     setEmployees(res.data || []);
  //   } catch (err) {
  //     console.error('Failed to fetch employees:', err);
  //   }
  // };

  useEffect(() => {
    fetchDepartments();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.state, filters.manager, filters.project, filters.employee,]);

  // useEffect(() => {
  //   fetchEmployees();
  // }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this department?')) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Deleted!');
      fetchDepartments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const openCreate = () => {
    setEditMode(false);
    setSelected(null);
    setShowModal(true);
  };
  const openEdit = (dept) => {
    setSelected(dept);
    setEditMode(true);
    setShowModal(true);
  };

  // -------------------------------------------------------------------------
  // Derived data — filtered/sorted list. No fabricated stats: everything
  // below is computed only from fields getDepartments() actually returns
  // (name, code, status, headOf, parentDepartment, description, createdAt).
  // -------------------------------------------------------------------------
  const kpis = useMemo(() => {
    const active = departments.filter((d) => d.status === 'active').length;
    const inactive = departments.length - active;
    const withHead = departments.filter((d) => d.headOf).length;
    return {
      departments: departments.length,
      active,
      inactive,
      withHead,
      // employees: employees.length,
    };
  }, [departments]);

  const visibleDepartments = useMemo(() => {
    const list = [...departments];

    switch (filters.sort) {
      case "oldest":
        list.sort(
          (a, b) =>
            new Date(a.createdAt || 0) -
            new Date(b.createdAt || 0)
        );
        break;

      case "name":
        list.sort((a, b) =>
          (a.name || "").localeCompare(
            b.name || ""
          )
        );
        break;

      case "newest":
      default:
        list.sort(
          (a, b) =>
            new Date(b.createdAt || 0) -
            new Date(a.createdAt || 0)
        );
        break;
    }

    return list;
  }, [departments, filters.sort]);

  return (
    <div className="w-full max-w-none space-y-6 animate-fade-in">
      {/* 1. Page Header ------------------------------------------------- */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Departments</h2>
          <p className="page-subtitle">{departments.length} departments</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport}/>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn-secondary">
            {importing ? "Importing..." : "Import Excel"}
          </button>
          <button type="button" onClick={handleExport} disabled={exporting} className="btn-secondary"> {exporting ? "Exporting..." : "Export Excel"} </button>
          <button onClick={openCreate} className="btn-primary"> + Create Department </button>
        </div>
      </div>

      {/* 2. KPI Cards — only fields real getDepartments() data actually supports */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard delay={0.0} icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          value={kpis.departments} label="Departments" />
        <KpiCard delay={0.03} icon="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
          value={kpis.active} label="Active" />
        <KpiCard delay={0.06} icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          value={kpis.inactive} label="Inactive" />
        <KpiCard delay={0.09} icon="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"
          value={kpis.withHead} label="With Head Assigned" />
        {/* <KpiCard delay={0.12} icon="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4"
          value={kpis.employees} label="Employees" /> */}
      </div>

      {/*
        NOTE: The "Analytics Overview" section (Department Performance,
        Task Status, Project Distribution, Employee Distribution, Monthly
        Productivity, Top Performing Departments) that used to live here has
        been removed. It was rendering hashString()-seeded placeholder
        numbers, not real data — getDepartments() doesn't return per-
        department employee/project/task counts, only GET /departments/:id
        does (see DepartmentDetails.jsx, which already shows the real
        version of these same charts for a single department).
        To bring this back at the list level honestly, the backend needs a
        new aggregate endpoint (e.g. GET /departments/analytics/overview)
        that computes these across all departments the same way
        getDepartment()'s topPerformingDepartments block does. That's a
        separate change from "wire this page to getDepartments()".
      */}

      {/* 3. Search & Filters ---------------------------------------------- */}
      <GlobalFilters
        filters={filters}
        setFilters={setFilters}
        enabledFilters={[
          "search",
          "state",
          "manager",
          "project",
          "employee",
          "sort",
        ]}
      />

      {/* 4. Department Cards ------------------------------------------------ */}
      {departments.length === 0 ? (
        <EmptyState icon={<SI d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" size={40} color="text-violet-400" />} title="No departments" message="Create your first department."
          action={{ label: 'Create', onClick: openCreate }} />
      ) : visibleDepartments.length === 0 ? (
        <EmptyState icon={<SI d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" size={40} color="text-violet-400" />} title="No matches" message="Try a different search or filter." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleDepartments.map(dept => (
            <motion.div key={dept._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -3 }}
              className="glass-card p-4 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-500/30">
                    <SI d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" size={20} color="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-violet-900 text-lg leading-tight">{dept.name}</h3>
                    <span className="text-[11px] text-violet-400 font-medium tracking-wide">{dept.code || "N/A"}</span>
                  </div>
                </div>
                <span className={`badge-purple ${dept.status !== 'active' ? 'opacity-60' : ''}`}>
                  {dept.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>

              {dept.description && <p className="text-sm text-violet-500 mb-3 line-clamp-2">{dept.description}</p>}

              <div className="space-y-1.5 mb-4 text-sm">
                <p className="text-violet-500">Head: <span className="font-medium text-violet-900">{dept.headOf?.name || 'Not assigned'}</span></p>
                <p className="text-violet-500">Parent: <span className="font-medium text-violet-900">{dept.parentDepartment?.name || 'None'}</span></p>
              </div>

              <div className="mt-auto flex gap-2">
                <button onClick={() => navigate(`/admin/departments/${dept._id}`)} className="btn-secondary btn-sm flex-1 text-xs" title="View Department">View</button>
                <button onClick={() => openEdit(dept)} className="btn-ghost btn-sm text-xs" title="Edit Department">Edit</button>
                <button onClick={() => handleDelete(dept._id)} className="btn-ghost btn-sm text-xs text-gray-900 hover:text-gray-900 hover:bg-gray-100" title="Delete Department">Delete</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <CreateDepartmentForm
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setSelected(null);
          setEditMode(false);
        }}
        department={editMode ? selected : null}
        onCreated={() => {
          setShowModal(false);
          setSelected(null);
          setEditMode(false);
          fetchDepartments();
          // fetchEmployees();
        }}
      />

    </div>
  );
};

export default AdminDepartments;