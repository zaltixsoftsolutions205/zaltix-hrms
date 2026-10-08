import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';

import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';
import EmployeeTable from '../EmplopeeInfo/EmployeetTable';
import Interns from '../EmplopeeInfo/Interns';
import EmployeeAnalytics from '../EmplopeeInfo/Employeeanalytics';
import EmployeeForm from '../../components/UI/EmployeeForm';
import GlobalFilters from '../../components/UI/Globalfilters';

const Ico = ({ d, d2, className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d={d} />
    {d2 && <path d={d2} />}
  </svg>
);
const DOC_STATUS = {
  pending_upload: 'bg-gray-100 text-gray-600',
  uploaded: 'bg-violet-100 text-violet-700',
  approved: 'bg-violet-100 text-violet-700',
  rejected: 'bg-gray-100 text-gray-900'
};
const DOC_LABEL = {
  pending_upload: 'Pending Upload',
  uploaded: 'Uploaded',
  approved: 'Approved',
  rejected: 'Rejected'
};
const EMPLOYEE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'fresher', label: 'Fresher' },
  { value: 'experienced', label: 'Experienced' },
];


const EMPLOYEE_FORM = {
  employeeId: '',
  name: '',
  email: '',
  role: 'employee',
  customRole: '',

  departmentId: '',
  projectId: '',

  designation: '',
  phone: '',
  joiningDate: '',
  basicSalary: '',
  employeeType: '',
  moduleAccess: [],
};


const INTERN_FORM = {
  employeeId: '',
  name: '',
  email: '',

  departmentId: '',
  designation: '',
  phone: '',
  joiningDate: '',
  basicSalary: '',

  employeeType: 'intern',

  internCandidateType: 'fresher',

  internshipDurationMonths: 3,
  internshipEndDate: '',

  moduleAccess: [],
};


export default function HREmployees() {

  /* =========================================================
     DATA
  ========================================================= */

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);

  const [loading, setLoading] = useState(false);


  /* =========================================================
     EMPLOYEE FORM MODAL
  ========================================================= */

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [selectedEmp, setSelectedEmp] = useState(null);


  /* =========================================================
     DOCUMENT MODALS
  ========================================================= */

  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);


  /* =========================================================
     INTERN
  ========================================================= */

  const [showAddIntern, setshowAddIntern] = useState(false);

  const [internForm, setInternForm] = useState(INTERN_FORM);


  /* =========================================================
     TABS
  ========================================================= */

  const [activeTab, setActiveTab] = useState('Full-Time');

  const TABS = [
    {
      key: 'Full-Time',
      label: 'Full-Time'
    },
    {
      key: 'interns',
      label: 'Interns'
    },
    {
      key: 'analytics',
      label: '📊 Analytics'
    }
  ];


  /* =========================================================
     FILTERS
  ========================================================= */
  const [filters, setFilters] = useState({
    search: '',
    department: '',
    project: '',
    employee: '',
    role: '',
    type: '',
  });


  const navigate = useNavigate();


  /* =========================================================
     FETCH EMPLOYEES + DEPARTMENTS + PROJECTS
  ========================================================= */

  const fetchAll = async () => {

    const [employeeRes, departmentRes, projectRes] =
      await Promise.allSettled([
        api.get('/employees'),
        api.get('/departments'),
        api.get('/projects')
      ]);


    /* ---------------- Employees ---------------- */

    if (employeeRes.status === 'fulfilled') {

      setEmployees(
        employeeRes.value.data?.employees ||
        employeeRes.value.data ||
        []
      );

    } else {

      toast.error(
        employeeRes.reason?.response?.data?.message ||
        'Failed to load employees'
      );

    }


    /* ---------------- Departments ---------------- */

    if (departmentRes.status === 'fulfilled') {

      setDepartments(
        departmentRes.value.data?.departments ||
        departmentRes.value.data ||
        []
      );

    } else {

      toast.error(
        departmentRes.reason?.response?.data?.message ||
        'Failed to load departments'
      );

    }


    /* ---------------- Projects ---------------- */

    if (projectRes.status === 'fulfilled') {

      setProjects(
        projectRes.value.data?.projects ||
        projectRes.value.data ||
        []
      );

    } else {

      toast.error(
        projectRes.reason?.response?.data?.message ||
        'Failed to load projects'
      );

    }
  };


  useEffect(() => {
    fetchAll();
  }, []);


  /* =========================================================
     CREATE EMPLOYEE
     
     EmployeeForm sends the completed formData here.
  ========================================================= */

  const handleCreateEmployee = async (formData) => {
    setLoading(true);

    try {
      const payload = {
        ...formData,

        role:
          formData.role === "custom"
            ? formData.customRole?.trim()
            : formData.role,
      };

      delete payload.customRole;

      const res = await api.post("/employees", payload);

      toast.success(
        `Employee created! Temp password: ${res.data.tempPassword}`,
        {
          duration: 6000,
        }
      );

      setShowAddModal(false);

      await fetchAll();

    } catch (err) {
      toast.error(
        err.response?.data?.message ||
        "Failed to create employee"
      );
    } finally {
      setLoading(false);
    }
  };


  /* =========================================================
     UPDATE EMPLOYEE
     
     SAME EmployeeForm is used for editing.
  ========================================================= */

  const handleUpdateEmployee = async (
    employeeId,
    formData
  ) => {

    setLoading(true);

    try {

      const payload = {
        ...formData,

        role:
          formData.role === 'custom'
            ? formData.customRole?.trim()
            : formData.role,
      };


      delete payload.customRole;


      await api.put(
        `/employees/${employeeId}`,
        payload
      );


      toast.success(
        'Employee updated successfully'
      );


      setShowEditModal(false);
      setSelectedEmp(null);


      await fetchAll();

    } catch (err) {

      toast.error(
        err.response?.data?.message ||
        'Failed to update employee'
      );

    } finally {
      setLoading(false);
    }
  };


  /* =========================================================
     OPEN EDIT
  ========================================================= */

  const openEdit = (emp) => {

    setSelectedEmp(emp);

    setShowEditModal(true);
  };


  /* =========================================================
     DOCUMENT ACTIONS
  ========================================================= */

  const openDocs = (emp) => {

    setSelectedEmp(emp);

    setShowDocsModal(true);
  };


  const openAttach = (emp) => {

    setSelectedEmp(emp);

    setShowAttachModal(true);
  };


  /* =========================================================
     OFFER
  ========================================================= */

  const sendOffer = async (emp) => {

    try {

      await api.post(
        '/employees/send-offer',
        {
          employeeId: emp._id,
          salary: emp.basicSalary
        }
      );

      toast.success(
        'Offer letter sent!'
      );

    } catch (err) {

      toast.error(
        err.response?.data?.message ||
        'Failed'
      );

    }
  };


  /* =========================================================
     CREDENTIALS
  ========================================================= */

  const sendCreds = async (emp) => {

    try {

      await api.post(
        '/employees/send-credentials',
        {
          employeeId: emp._id
        }
      );

      toast.success(
        'Credentials sent!'
      );

    } catch (err) {

      toast.error(
        err.response?.data?.message ||
        'Failed'
      );

    }
  };


  /* =========================================================
     DELETE
  ========================================================= */

  const handleDelete = async (emp) => {

    if (
      !window.confirm(
        `Delete ${emp.name} (${emp.employeeId})? This permanently removes the employee and cannot be undone.`
      )
    ) {
      return;
    }


    try {

      await api.delete(
        `/employees/${emp._id}`
      );


      toast.success(
        `${emp.name} deleted.`
      );


      await fetchAll();

    } catch (err) {

      toast.error(
        err.response?.data?.message ||
        'Delete failed'
      );

    }
  };


  /* =========================================================
     ACTIVE / INACTIVE
  ========================================================= */

  const handleStatusChange = async (
    emp,
    nextActive
  ) => {

    if (
      emp.isActive === nextActive
    ) {
      return;
    }


    if (
      !nextActive &&
      !window.confirm(
        `Set ${emp.name} (${emp.employeeId}) to Inactive? They will no longer be able to log in.`
      )
    ) {
      return;
    }


    setEmployees((list) =>
      list.map((e) =>
        e._id === emp._id
          ? {
            ...e,
            isActive: nextActive
          }
          : e
      )
    );


    try {

      await api.patch(
        `/employees/${emp._id}/status`,
        {
          isActive: nextActive
        }
      );


      toast.success(
        `${emp.name} is now ${nextActive
          ? 'active'
          : 'inactive'
        }.`
      );


      await fetchAll();

    } catch (err) {

      toast.error(
        err.response?.data?.message ||
        'Failed to update status'
      );


      await fetchAll();

    }
  };


  /* =========================================================
     FILTER
  ========================================================= */

  /* =========================================================
   FILTER
========================================================= */

  const filtered = employees.filter((emp) => {

    const name = emp.name || '';
    const email = emp.email || '';
    const employeeId = emp.employeeId || '';

    const searchValue =
      (filters.search || '').toLowerCase();

    const matchesSearch =
      !searchValue ||
      name.toLowerCase().includes(searchValue) ||
      employeeId.toLowerCase().includes(searchValue) ||
      email.toLowerCase().includes(searchValue);

    const matchesRole =
      !filters.role ||
      emp.role === filters.role;

    const matchesDepartment =
      !filters.department ||
      emp.department?._id === filters.department;

    const matchesEmployee =
      !filters.employee ||
      emp._id === filters.employee;

    const matchesType =
      !filters.type ||
      emp.employeeType === filters.type ||
      emp.internCandidateType === filters.type;

    const matchesProject =
      !filters.project ||
      projects.some(
        (project) =>
          project._id === filters.project &&
          project.teamMembers?.some(
            (member) =>
              (member?._id || member) === emp._id
          )
      );

    return (
      matchesSearch &&
      matchesDepartment &&
      matchesProject &&
      matchesEmployee &&
      matchesRole &&
      matchesType
    );
  });


  const internData =
    filtered.filter(
      emp =>
        emp.employeeType === 'intern'
    );


  const employeeData =
    filtered.filter(
      emp =>
        emp.employeeType !== 'intern'
    );


  /* =========================================================
     ALERTS
  ========================================================= */

  const employeeAlerts = (() => {

    if (!employees.length) {
      return [];
    }


    const alerts = [];


    const docsAwaitingReview =
      employees.filter(
        e =>
          e.employeeType &&
          e.documentCompletion?.pending > 0
      );


    const noSalary =
      employees.filter(
        e =>
          !e.basicSalary ||
          e.basicSalary === 0
      );


    const noDept =
      employees.filter(
        e =>
          !e.department
      );


    const noDesignation =
      employees.filter(
        e =>
          !e.designation
      );


    if (docsAwaitingReview.length > 0) {

      alerts.push({
        level: 'warning',
        message:
          `${docsAwaitingReview.length} employee${docsAwaitingReview.length > 1
            ? 's have'
            : ' has'
          } documents uploaded and awaiting your review. Click "Review Docs" to approve.`
      });

    }


    if (noSalary.length > 0) {

      alerts.push({
        level: 'warning',
        message:
          `${noSalary.length} employee${noSalary.length > 1
            ? 's have'
            : ' has'
          } no salary set — payslip generation will be incomplete.`
      });

    }


    if (noDept.length > 0) {

      alerts.push({
        level: 'info',
        message:
          `${noDept.length} employee${noDept.length > 1
            ? 's are'
            : ' is'
          } not assigned to any department.`
      });

    }


    if (noDesignation.length > 0) {

      alerts.push({
        level: 'info',
        message:
          `${noDesignation.length} employee${noDesignation.length > 1
            ? 's have'
            : ' has'
          } no designation set. Update their profile for accurate records.`
      });

    }


    return alerts;

  })();


  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="w-full px-3 sm:px-4 space-y-4 animate-fade-in">
      <IntelligenceAlerts
        alerts={employeeAlerts}
      />


      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-violet-900">
            {activeTab === 'Full-Time' ? 'Employee Management' : activeTab === 'analytics' ? 'Employee Analytics' : 'Interns Management'}
          </h2>
          <p className="text-sm text-violet-500 mt-0.5">
            {
              activeTab === 'Full-Time' ? `${employees.length} Employee${employees.length === 1 ? '' : 's'}` : `${internData.length} Intern${internData.length === 1 ? '' : 's'}`
            }
          </p>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {TABS.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 rounded-lg transition-all ${activeTab === tab.key ? 'bg-white text-violet-700 shadow' : 'text-gray-500 hover:text-violet-600'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Add */}
          {activeTab !== 'analytics' && (

            <button
              onClick={() => {
                if (activeTab === 'Full-Time') {
                  setSelectedEmp(null);
                  setShowAddModal(true);
                } else {
                  setshowAddIntern(true);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              <Ico d="M12 4v16m8-8H4" className="w-4 h-4" />
              {activeTab === 'Full-Time' ? 'Add Employee' : 'Add Intern'}
            </button>

          )}

        </div>

      </div>


      {/* =====================================================
          FILTERS
      ===================================================== */}

      <GlobalFilters
        filters={filters}
        setFilters={setFilters}
        enabledFilters={[
          "search",
          "department",
          "project",
          "employee",
          "role",
          "type",
        ]}
      />


      {/* =====================================================
          EMPLOYEE TABLE
      ===================================================== */}

      {activeTab === 'Full-Time' && (

        <EmployeeTable
          filtered={filtered}
          departments={departments}
          projects={projects}
          selectedEmp={selectedEmp}
          loading={loading}

          navigate={navigate}

          handleCreate={handleCreateEmployee}
          handleUpdateEmployee={handleUpdateEmployee}

          handleDelete={handleDelete}
          handleStatusChange={handleStatusChange}
          sendOffer={sendOffer}
          sendCreds={sendCreds}
          openEdit={openEdit}
          openDocs={openDocs}
          openAttach={openAttach}
          fetchAll={fetchAll}

          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}

          showEditModal={showEditModal}
          setShowEditModal={setShowEditModal}

          showDocsModal={showDocsModal}
          setShowDocsModal={setShowDocsModal}

          showAttachModal={showAttachModal}
          setShowAttachModal={setShowAttachModal}

          DocumentReviewPanel={DocumentReviewPanel}
          AttachDocsPanel={AttachDocsPanel}
        />

      )}


      {/* =====================================================
          INTERNS
      ===================================================== */}

      {activeTab === 'interns' && (

        <Interns

          interns={internData}

          showAddIntern={
            showAddIntern
          }

          setshowAddIntern={
            setshowAddIntern
          }

          internForm={
            internForm
          }

          setInternForm={
            setInternForm
          }

          handleCreate={
            async (ev) => {

              ev.preventDefault();

              setLoading(true);

              try {

                const {
                  internshipDurationMonths,
                  internshipEndDate,
                  internCandidateType,
                  ...rest
                } = internForm;


                const payload = {
                  ...rest,

                  internship: {
                    startDate:
                      internForm.joiningDate ||
                      undefined,

                    endDate:
                      internshipEndDate ||
                      undefined,

                    durationMonths:
                      Number(
                        internshipDurationMonths
                      ) || undefined,

                    candidateType:
                      internCandidateType ||
                      'fresher',

                    status:
                      'active'
                  }
                };


                await api.post(
                  '/employees',
                  payload
                );


                toast.success(
                  'Intern created successfully'
                );


                setshowAddIntern(false);

                setInternForm(
                  INTERN_FORM
                );


                await fetchAll();

              } catch (err) {

                toast.error(
                  err.response?.data?.message ||
                  'Failed to create intern'
                );

              } finally {

                setLoading(false);

              }

            }
          }

          loading={loading}

          departments={departments}

          fetchAll={fetchAll}

        />

      )}


      {/* =====================================================
          ANALYTICS
      ===================================================== */}

      {activeTab === 'analytics' && (

        <EmployeeAnalytics
          employees={employees}
        />

      )}

    </div>
  );
}


/* ============================================================
   ATTACH DOCUMENT PANEL
============================================================ */

function AttachDocsPanel({
  emp,
  onDone
}) {

  const [files, setFiles] =
    useState({
      joiningLetter: null,
      idCard: null
    });

  const [loading, setLoading] =
    useState(false);

  const refs = {
    joiningLetter:
      useRef(null),

    idCard:
      useRef(null)
  };


  const handleSubmit = async () => {

    if (
      !files.joiningLetter &&
      !files.idCard
    ) {

      return toast.error(
        'Select at least one file to upload'
      );

    }


    setLoading(true);


    try {

      const fd =
        new FormData();


      if (files.joiningLetter) {

        fd.append(
          'joiningLetter',
          files.joiningLetter
        );

      }


      if (files.idCard) {

        fd.append(
          'idCard',
          files.idCard
        );

      }


      await api.post(
        `/employees/${emp._id}/attach-docs`,
        fd,
        {
          headers: {
            'Content-Type':
              'multipart/form-data'
          }
        }
      );


      toast.success(
        'Documents attached successfully!'
      );


      onDone();

    } catch (err) {

      toast.error(
        err.response?.data?.message ||
        'Upload failed'
      );

    } finally {

      setLoading(false);

    }
  };


  const rows = [
    {
      key: 'joiningLetter',
      label: 'Joining Letter',
      existing: emp.joiningLetter,
      accept: '.pdf,.jpg,.jpeg,.png'
    },

    {
      key: 'idCard',
      label: 'ID Card',
      existing: emp.idCard,
      accept: '.pdf,.jpg,.jpeg,.png'
    }
  ];


  return (
    <div className="space-y-4">

      <p className="text-xs text-violet-500">
        Upload joining letter and/or ID card.
        Once attached, the employee can download
        them when their profile is 100% complete.
      </p>


      {rows.map(
        ({
          key,
          label,
          existing,
          accept
        }) => (

          <div
            key={key}
            className="border border-violet-100 rounded-xl p-3 bg-violet-50/40"
          >

            <p className="text-sm font-semibold text-violet-900 mb-1">
              {label}
            </p>


            {existing && (

              <p className="text-[11px] text-violet-600 font-medium mb-2 flex items-center gap-1">

                ✓ Already attached —
                uploading will replace it

              </p>

            )}


            <div className="flex items-center gap-2 flex-wrap">

              <input
                type="file"
                accept={accept}
                className="hidden"
                ref={refs[key]}
                onChange={(e) =>
                  setFiles(
                    f => ({
                      ...f,
                      [key]:
                        e.target.files[0] ||
                        null
                    })
                  )
                }
              />


              <button
                onClick={() =>
                  refs[key].current?.click()
                }
                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold transition-colors"
              >
                {
                  files[key]
                    ? 'Change file'
                    : 'Choose file'
                }
              </button>


              {files[key] && (

                <span className="text-xs text-violet-600 font-medium truncate max-w-[180px]">
                  {files[key].name}
                </span>

              )}

            </div>

          </div>

        )
      )}


      <div className="flex gap-2 pt-1">

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
        >
          {loading
            ? 'Uploading…'
            : 'Save Documents'}
        </button>


        <button
          onClick={onDone}
          className="flex-1 py-2.5 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-sm font-semibold transition-colors"
        >
          Cancel
        </button>

      </div>

    </div>
  );
}


/* ============================================================
   DOCUMENT REVIEW PANEL
============================================================ */

function DocumentReviewPanel({
  emp
}) {

  const [data, setData] =
    useState(null);

  const [reviewing, setReviewing] =
    useState(null);

  const [rejectReason, setRejectReason] =
    useState('');

  const [showReject, setShowReject] =
    useState(null);


  const load = () =>
    api
      .get(
        `/documents/employee/${emp._id}`
      )
      .then(r =>
        setData(r.data)
      )
      .catch(() =>
        toast.error(
          'Failed to load documents'
        )
      );


  useEffect(() => {

    load();

  }, [emp._id]);


  const buildFileUrl = (
    filePath
  ) => {

    if (!filePath)
      return filePath;


    if (
      /^https?:\/\//i.test(
        filePath
      )
    ) {
      return filePath;
    }


    const normalized =
      filePath.startsWith('/')
        ? filePath
        : `/${filePath}`;


    try {

      const apiUrl =
        import.meta.env.VITE_API_URL;

      if (apiUrl) {

        const u =
          new URL(apiUrl);

        return `${u.origin}${normalized}`;

      }

    } catch (e) {
      // ignore
    }


    if (
      window.location.hostname ===
      'localhost' &&
      window.location.port &&
      window.location.port !==
      '5000'
    ) {

      return `${window.location.protocol}//${window.location.hostname}:5000${normalized}`;

    }


    return `${window.location.origin}${normalized}`;
  };


  const handleReview = async (
    docId,
    status
  ) => {

    setReviewing(docId);


    try {

      await api.patch(
        `/documents/${docId}/review`,
        {
          status,

          rejectionReason:
            status === 'rejected'
              ? rejectReason
              : ''
        }
      );


      toast.success(
        `Document ${status}!`
      );


      setShowReject(null);
      setRejectReason('');


      load();

    } catch (err) {

      toast.error(
        err.response?.data?.message ||
        'Failed'
      );

    } finally {

      setReviewing(null);

    }
  };


  if (!data) {

    return (
      <div className="text-center py-10 text-sm text-violet-400">
        Loading…
      </div>
    );

  }


  if (!data.employeeType) {

    return (
      <div className="text-center py-8 text-sm text-violet-400">
        No onboarding type set for this employee.
      </div>
    );

  }


  const approved =
    data.docs.filter(
      d =>
        d.status === 'approved'
    ).length;


  const total =
    data.docs.length;


  const pct =
    total > 0
      ? Math.round(
        (approved / total) * 100
      )
      : 0;


  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between gap-3 bg-violet-50 rounded-xl p-3">

        <div>

          <p className="text-xs font-bold text-violet-700 capitalize">
            {data.employeeType}
          </p>

          <p className="text-xs text-violet-500 mt-0.5">
            {approved} of {total}
            {' '}documents approved
          </p>

        </div>


        <div className="flex items-center gap-2 flex-shrink-0">

          <div className="w-24 bg-violet-200 rounded-full h-2">

            <div
              className="bg-violet-500 h-2 rounded-full transition-all"
              style={{
                width: `${pct}%`
              }}
            />

          </div>


          <span className="text-xs font-bold text-violet-600">
            {pct}%
          </span>

        </div>

      </div>


      <div className="space-y-2">

        {data.docs.map(
          (doc, i) => (

            <div
              key={
                doc._id || i
              }
              className="border border-violet-100 rounded-xl p-3 bg-white"
            >

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

                <div className="min-w-0">

                  <p className="text-sm font-semibold text-violet-900">
                    {doc.docType}
                  </p>


                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">

                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${DOC_STATUS[
                        doc.status
                      ] ||
                        'bg-gray-100 text-gray-600'
                        }`}
                    >
                      {
                        DOC_LABEL[
                        doc.status
                        ] ||
                        doc.status
                      }
                    </span>


                    {doc.uploadedAt && (

                      <span className="text-[11px] text-violet-400">
                        {new Date(
                          doc.uploadedAt
                        ).toLocaleDateString(
                          'en-IN'
                        )}
                      </span>

                    )}

                  </div>


                  {doc.status ===
                    'rejected' &&
                    doc.rejectionReason && (

                      <p className="text-xs text-gray-900 mt-1">
                        Reason:{' '}
                        {
                          doc.rejectionReason
                        }
                      </p>

                    )}

                </div>


                <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">

                  {doc.filePath && (

                    <a
                      href={buildFileUrl(
                        doc.filePath
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors"
                    >
                      View
                    </a>

                  )}


                  {doc._id &&
                    doc.status ===
                    'uploaded' && (

                      <>

                        <button
                          onClick={() =>
                            handleReview(
                              doc._id,
                              'approved'
                            )
                          }
                          disabled={
                            reviewing ===
                            doc._id
                          }
                          className="px-2.5 py-1 text-xs rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-semibold disabled:opacity-50"
                        >
                          {
                            reviewing ===
                              doc._id
                              ? '…'
                              : 'Approve'
                          }
                        </button>


                        {showReject ===
                          doc._id ? (

                          <div className="flex items-center gap-1">

                            <input
                              className="border border-violet-200 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-violet-300"
                              placeholder="Reason…"
                              value={
                                rejectReason
                              }
                              onChange={(e) =>
                                setRejectReason(
                                  e.target.value
                                )
                              }
                            />


                            <button
                              onClick={() =>
                                handleReview(
                                  doc._id,
                                  'rejected'
                                )
                              }
                              className="px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-200 font-semibold"
                            >
                              OK
                            </button>


                            <button
                              onClick={() => {
                                setShowReject(
                                  null
                                );

                                setRejectReason(
                                  ''
                                );
                              }}
                              className="text-violet-400 hover:text-violet-600 text-xs px-1"
                            >
                              ✕
                            </button>

                          </div>

                        ) : (

                          <button
                            onClick={() => {
                              setShowReject(
                                doc._id
                              );

                              setRejectReason(
                                ''
                              );
                            }}
                            className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-100 font-semibold"
                          >
                            Reject
                          </button>

                        )}

                      </>

                    )}


                  {doc._id &&
                    doc.status ===
                    'approved' && (

                      <button
                        onClick={() =>
                          handleReview(
                            doc._id,
                            'rejected'
                          )
                        }
                        disabled={
                          reviewing ===
                          doc._id
                        }
                        className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-100 font-semibold disabled:opacity-50"
                      >
                        Revoke
                      </button>

                    )}

                </div>

              </div>

            </div>

          )
        )}

      </div>

    </div>
  );
}