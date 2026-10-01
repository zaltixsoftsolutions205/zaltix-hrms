import React, { useState, useEffect, useMemo, useRef, useCallback, } from "react";
import api from "../../utils/api";
/* ============================================================
   GLOBAL FILTERS
   ------------------------------------------------------------
   Reusable page-level filtering UI.

   Relationship filters:
   Department
   Project
   Employee
   Manager
   Team Lead

   Normal filters:
   Search
   Status
   Priority

   The relationship filters cooperate using AND logic.
   Assignmentselects.jsx is completely separate.
   ============================================================ */
/* ============================================================
   CONSTANTS
   ============================================================ */
const STATE_OPTIONS = [
  {
    value: "active",
    label: "Active",
  },
  {
    value: "inactive",
    label: "Inactive",
  },
];
const WEEK_OPTIONS = Array.from(
  { length: 5 },
  (_, index) => ({
    id: String(index + 1),
    name: `Week ${index + 1}`,
  })
);

const STATUS_OPTIONS = [
  {
    value: "not-started",
    label: "Not Started",
  },
  {
    value: "in-progress",
    label: "In Progress",
  },
  {
    value: "review",
    label: "Review",
  },
  {
    value: "completed",
    label: "Completed",
  },
  {
    value: "cancelled",
    label: "Cancelled",
  },
];

const PRIORITY_OPTIONS = [
  "low",
  "medium",
  "high",
  "critical",
];
const CURRENT_YEAR = new Date().getFullYear();

const YEAR_OPTIONS = Array.from(
  { length: 6 },
  (_, index) => {
    const year = CURRENT_YEAR - index;

    return {
      id: String(year),
      name: String(year),
    };
  }
);

const MONTH_OPTIONS = [
  { id: "1", name: "January" },
  { id: "2", name: "February" },
  { id: "3", name: "March" },
  { id: "4", name: "April" },
  { id: "5", name: "May" },
  { id: "6", name: "June" },
  { id: "7", name: "July" },
  { id: "8", name: "August" },
  { id: "9", name: "September" },
  { id: "10", name: "October" },
  { id: "11", name: "November" },
  { id: "12", name: "December" },
];

const SORT_OPTIONS = [
  {
    value: "newest",
    label: "Newest",
  },
  {
    value: "oldest",
    label: "Oldest",
  },
  {
    value: "name",
    label: "Department Name",
  },
];

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'sales', label: 'Sales' },
  { value: 'field_sales', label: 'Field Sales' },
  { value: 'hr', label: 'HR' },
  { value: 'technical_associate', label: 'Technical Associate' },
  { value: 'bda', label: 'BDA' },
  { value: 'manager', label: 'Manager' },
  { value: 'team-lead', label: 'Team Lead' },
  { value: 'admin', label: 'Admin' },
];

const TYPE_OPTIONS = [
  { value: 'fresher', label: 'Fresher' },
  { value: 'experienced', label: 'Experienced' },
];

/* ============================================================
   HELPERS
   ============================================================ */

const normalizeRole = (role) =>
  (role || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

const isManagerRole = (employee) =>
  normalizeRole(employee?.role) === "manager";

const isTeamLeadRole = (employee) =>
  normalizeRole(employee?.role) === "team-lead";

const titleCase = (value = "") =>
  value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getId = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value._id) {
    return value._id;
  }

  return null;
};

const getDepartmentId = (entity) =>
  getId(entity?.department);

const getManagerId = (project) =>
  getId(project?.manager);

const getHeadOfId = (department) =>
  getId(department?.headOf);

const getTeamMemberIds = (project) =>
  (Array.isArray(project?.teamMembers)
    ? project.teamMembers
    : []
  )
    .map(getId)
    .filter(Boolean);


/* ============================================================
   ICONS
   ============================================================ */

const SearchIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg
    className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""
      }`}
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25 4.5a.75.75 0 01-1.08-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

const FilterIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>
);

const XIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </svg>
);

const CheckIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m5 12 4 4L19 6" />
  </svg>
);

const RefreshIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 11a8.1 8.1 0 0 0-15.5-2" />
    <path d="M4 4v5h5" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2" />
    <path d="M20 20v-5h-5" />
  </svg>
);

const UsersIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const BriefcaseIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </svg>
);

const BuildingIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" />
    <path d="M2 21h20" />
    <path d="M8 7h2" />
    <path d="M14 7h2" />
    <path d="M8 11h2" />
    <path d="M14 11h2" />
    <path d="M8 15h2" />
    <path d="M14 15h2" />
  </svg>
);

const UserIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="7" r="4" />
    <path d="M5 21a7 7 0 0 1 14 0" />
  </svg>
);


/* ============================================================
   RELATIONSHIP CONSTRAINT LOGIC
   ============================================================ */

function getConstraintsFromSingleFilter(key, id, datasets) {
  const {
    departments,
    projects,
    employees,
  } = datasets;

  const empty = {
    departmentIds: null,
    projectIds: null,
    employeeIds: null,
    managerIds: null,
    teamLeadIds: null,
  };

  if (!id) return empty;

  /* ---------------- Department ---------------- */

  if (key === "department") {
    const employeeIds = new Set(
      employees
        .filter((e) => getDepartmentId(e) === id)
        .map((e) => e._id)
    );

    const dept = departments.find(
      (d) => d._id === id
    );

    const headOfId = dept
      ? getHeadOfId(dept)
      : null;

    return {
      departmentIds: new Set([id]),

      projectIds: new Set(
        projects
          .filter((p) => getDepartmentId(p) === id)
          .map((p) => p._id)
      ),

      employeeIds,

      managerIds: headOfId
        ? new Set([headOfId])
        : new Set(),

      teamLeadIds: new Set(
        [...employeeIds].filter((eid) => {
          const employee = employees.find(
            (emp) => emp._id === eid
          );

          return (
            employee &&
            isTeamLeadRole(employee)
          );
        })
      ),
    };
  }

  /* ---------------- Project ---------------- */

  if (key === "project") {
    const project = projects.find(
      (p) => p._id === id
    );

    if (!project) return empty;

    const deptId =
      getDepartmentId(project);

    const memberIds =
      getTeamMemberIds(project);

    const managerId =
      getManagerId(project);

    return {
      departmentIds: deptId
        ? new Set([deptId])
        : new Set(),

      projectIds: new Set([id]),

      employeeIds: new Set(memberIds),

      managerIds: managerId
        ? new Set([managerId])
        : new Set(),

      teamLeadIds: new Set(
        memberIds.filter((mid) => {
          const employee = employees.find(
            (emp) => emp._id === mid
          );

          return (
            employee &&
            isTeamLeadRole(employee)
          );
        })
      ),
    };
  }

  /* ---------------- Employee ---------------- */

  if (key === "employee") {
    const employee = employees.find(
      (e) => e._id === id
    );

    if (!employee) return empty;

    const deptId =
      getDepartmentId(employee);

    const relatedProjects =
      projects.filter((p) =>
        getTeamMemberIds(p).includes(id)
      );

    const managerIds = new Set();

    const dept = departments.find(
      (d) => d._id === deptId
    );

    if (
      dept &&
      getHeadOfId(dept)
    ) {
      managerIds.add(
        getHeadOfId(dept)
      );
    }

    relatedProjects.forEach((project) => {
      const managerId =
        getManagerId(project);

      if (managerId) {
        managerIds.add(managerId);
      }
    });

    const teamLeadIds = new Set();

    relatedProjects.forEach((project) => {
      getTeamMemberIds(project).forEach(
        (memberId) => {
          const member =
            employees.find(
              (emp) =>
                emp._id === memberId
            );

          if (
            member &&
            isTeamLeadRole(member)
          ) {
            teamLeadIds.add(memberId);
          }
        }
      );
    });

    return {
      departmentIds: deptId
        ? new Set([deptId])
        : new Set(),

      projectIds: new Set(
        relatedProjects.map(
          (p) => p._id
        )
      ),

      employeeIds: new Set([id]),

      managerIds,

      teamLeadIds,
    };
  }

  /* ---------------- Manager ---------------- */

  if (key === "manager") {
    const departmentIds = new Set(
      departments
        .filter(
          (d) =>
            getHeadOfId(d) === id
        )
        .map((d) => d._id)
    );

    const projectsByManager =
      projects.filter(
        (p) =>
          getManagerId(p) === id
      );

    const projectsByDept =
      projects.filter((p) =>
        departmentIds.has(
          getDepartmentId(p)
        )
      );

    const projectIds = new Set(
      [
        ...projectsByManager,
        ...projectsByDept,
      ].map((p) => p._id)
    );

    const employeeIds = new Set(
      employees
        .filter((e) =>
          departmentIds.has(
            getDepartmentId(e)
          )
        )
        .map((e) => e._id)
    );

    projectIds.forEach((projectId) => {
      const project =
        projects.find(
          (p) =>
            p._id === projectId
        );

      if (project) {
        getTeamMemberIds(project).forEach(
          (memberId) =>
            employeeIds.add(memberId)
        );
      }
    });

    const teamLeadIds = new Set(
      [...employeeIds].filter(
        (employeeId) => {
          const employee =
            employees.find(
              (emp) =>
                emp._id === employeeId
            );

          return (
            employee &&
            isTeamLeadRole(employee)
          );
        }
      )
    );

    return {
      departmentIds,
      projectIds,
      employeeIds,
      managerIds: new Set([id]),
      teamLeadIds,
    };
  }

  /* ---------------- Team Lead ---------------- */

  if (key === "teamLead") {
    const relatedProjects =
      projects.filter((p) =>
        getTeamMemberIds(p).includes(id)
      );

    const departmentIds =
      new Set(
        relatedProjects
          .map((p) =>
            getDepartmentId(p)
          )
          .filter(Boolean)
      );

    const employeeIds = new Set();

    relatedProjects.forEach(
      (project) => {
        getTeamMemberIds(project).forEach(
          (memberId) =>
            employeeIds.add(memberId)
        );
      }
    );

    const managerIds =
      new Set(
        relatedProjects
          .map((p) =>
            getManagerId(p)
          )
          .filter(Boolean)
      );

    return {
      departmentIds,

      projectIds: new Set(
        relatedProjects.map(
          (p) => p._id
        )
      ),

      employeeIds,

      managerIds,

      teamLeadIds: new Set([id]),
    };
  }

  return empty;
}


const FIELD_FOR_KEY = {
  department: "departmentIds",
  project: "projectIds",
  employee: "employeeIds",
  manager: "managerIds",
  teamLead: "teamLeadIds",
};

const ALL_KEYS = [
  "department",
  "project",
  "employee",
  "manager",
  "teamLead",
];


function getAllowedIds(
  targetKey,
  filters,
  datasets
) {
  const otherActiveKeys =
    ALL_KEYS.filter(
      (key) =>
        key !== targetKey &&
        filters[key]
    );

  if (
    otherActiveKeys.length === 0
  ) {
    return null;
  }

  const field =
    FIELD_FOR_KEY[targetKey];

  const sets =
    otherActiveKeys
      .map(
        (key) =>
          getConstraintsFromSingleFilter(
            key,
            filters[key],
            datasets
          )[field]
      )
      .filter(
        (set) =>
          set !== null &&
          set !== undefined
      );

  if (sets.length === 0) {
    return null;
  }

  return sets.reduce(
    (acc, set) =>
      new Set(
        [...acc].filter((id) =>
          set.has(id)
        )
      )
  );
}


/* ============================================================
   FILTER ICON
   ============================================================ */

const FILTER_ICONS = {
  department: BuildingIcon,
  project: BriefcaseIcon,
  employee: UsersIcon,
  manager: UserIcon,
  teamLead: UsersIcon,
};


/* ============================================================
   SEARCH FILTER
   ============================================================ */

function SearchFilter({
  value,
  onChange,
  placeholder = "Search...",
}) {
  return (
    <div className="group relative w-full min-w-0 lg:flex-1 lg:min-w-[220px]">
      <SearchIcon
        className="
          absolute
          left-3.5
          top-1/2
          h-4
          w-4
          -translate-y-1/2
          text-gray-400
          transition-colors
          group-focus-within:text-violet-500
        "
      />

      <input
        type="text"
        value={value || ""}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="
          h-10
          w-full
          rounded-xl
          border
          border-gray-200
          bg-gray-50
          pl-10
          pr-9
          text-sm
          font-medium
          text-gray-700
          outline-none
          transition-all
          placeholder:text-gray-400
          hover:border-gray-300
          hover:bg-white
          focus:border-violet-300
          focus:bg-white
          focus:ring-4
          focus:ring-violet-50
        "
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="
            absolute
            right-2.5
            top-1/2
            flex
            h-6
            w-6
            -translate-y-1/2
            items-center
            justify-center
            rounded-lg
            text-gray-400
            transition
            hover:bg-gray-200
            hover:text-gray-600
          "
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}


/* ============================================================
   SEARCHABLE RELATIONSHIP DROPDOWN
   ============================================================ */

function FilterDropdown({
  filterKey,
  label,
  allLabel,
  options,
  value,
  onChange,
  loading,
}) {
  const [open, setOpen] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const containerRef =
    useRef(null);

  const searchInputRef =
    useRef(null);

  const Icon =
    FILTER_ICONS[filterKey] ||
    FilterIcon;

  useEffect(() => {
    const handleClickOutside = (
      event
    ) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          event.target
        )
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");

      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [open]);

  const filteredOptions =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      if (!query) {
        return options;
      }

      return options.filter(
        (option) =>
          option.name
            .toLowerCase()
            .includes(query)
      );
    }, [options, search]);

  const selectedOption =
    options.find(
      (option) =>
        option.id === value
    );

  const active =
    Boolean(value);

  const handleSelect = (id) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="
        relative
        w-full
        min-w-0
        sm:w-[210px]
        lg:w-[200px]
        xl:w-[210px]
      "
    >
      {/* FILTER BUTTON */}

      <button
        type="button"
        onClick={() =>
          setOpen(
            (previous) =>
              !previous
          )
        }
        className={`
          flex
          h-10
          w-full
          items-center
          gap-2
          rounded-xl
          border
          px-3
          text-left
          text-sm
          font-medium
          outline-none
          transition-all
          ${active
            ? `
                border-violet-200
                bg-violet-50
                text-violet-700
                shadow-sm
              `
            : `
                border-gray-200
                bg-gray-50
                text-gray-600
                hover:border-gray-300
                hover:bg-white
              `
          }
          focus:ring-4
          focus:ring-violet-50
        `}
      >
        <Icon
          className={`
            h-4
            w-4
            shrink-0
            ${active
              ? "text-violet-500"
              : "text-gray-400"
            }
          `}
        />

        <span className="min-w-0 flex-1 truncate">
          {selectedOption
            ? selectedOption.name
            : allLabel}
        </span>

        {active && (
          <span
            className="
              flex
              h-5
              w-5
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-violet-100
              text-violet-600
            "
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
          >
            <XIcon className="h-3 w-3" />
          </span>
        )}

        <ChevronIcon open={open} />
      </button>


      {/* DROPDOWN */}

      {open && (
        <div
          className="
            absolute
            left-0
            top-[calc(100%+6px)]
            z-50
            w-full
            min-w-[230px]
            overflow-hidden
            rounded-2xl
            border
            border-gray-200
            bg-white
            shadow-xl
            shadow-gray-200/60
          "
        >
          {/* HEADER */}

          <div
            className="
              border-b
              border-gray-100
              bg-gray-50/70
              p-2.5
            "
          >
            <div className="relative">
              <SearchIcon
                className="
                  absolute
                  left-3
                  top-1/2
                  h-3.5
                  w-3.5
                  -translate-y-1/2
                  text-gray-400
                "
              />

              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder={`Search ${label.toLowerCase()}...`}
                className="
                  h-9
                  w-full
                  rounded-xl
                  border
                  border-gray-200
                  bg-white
                  pl-9
                  pr-3
                  text-xs
                  font-medium
                  text-gray-700
                  outline-none
                  placeholder:text-gray-400
                  focus:border-violet-300
                  focus:ring-2
                  focus:ring-violet-50
                "
              />
            </div>
          </div>


          {/* RESULT COUNT */}

          <div
            className="
              flex
              items-center
              justify-between
              border-b
              border-gray-100
              px-3
              py-2
            "
          >
            <span
              className="
                text-[11px]
                font-semibold
                uppercase
                tracking-wide
                text-gray-400
              "
            >
              {label}
            </span>

            <span
              className="
                rounded-full
                bg-gray-100
                px-2
                py-0.5
                text-[10px]
                font-semibold
                text-gray-500
              "
            >
              {loading
                ? "..."
                : filteredOptions.length}
            </span>
          </div>


          {/* OPTIONS */}

          <div
            className="
              max-h-64
              overflow-y-auto
              p-1.5
            "
          >
            {/* ALL */}

            <button
              type="button"
              onClick={() =>
                handleSelect("")
              }
              className={`
                flex
                w-full
                items-center
                gap-2.5
                rounded-xl
                px-3
                py-2.5
                text-left
                text-xs
                font-medium
                transition
                ${!value
                  ? "bg-violet-50 text-violet-700"
                  : "text-gray-600 hover:bg-gray-50"
                }
              `}
            >
              <span
                className={`
                  flex
                  h-7
                  w-7
                  shrink-0
                  items-center
                  justify-center
                  rounded-lg
                  ${!value
                    ? "bg-violet-100 text-violet-600"
                    : "bg-gray-100 text-gray-400"
                  }
                `}
              >
                <FilterIcon className="h-3.5 w-3.5" />
              </span>

              <span className="flex-1">
                {allLabel}
              </span>

              {!value && (
                <CheckIcon className="h-4 w-4 text-violet-600" />
              )}
            </button>


            {/* LOADING */}

            {loading && (
              <div className="space-y-1 p-1">
                {[1, 2, 3, 4].map(
                  (item) => (
                    <div
                      key={item}
                      className="
                        h-10
                        animate-pulse
                        rounded-xl
                        bg-gray-100
                      "
                    />
                  )
                )}
              </div>
            )}


            {/* EMPTY */}

            {!loading &&
              filteredOptions.length ===
              0 && (
                <div
                  className="
                    flex
                    flex-col
                    items-center
                    justify-center
                    px-4
                    py-8
                    text-center
                  "
                >
                  <div
                    className="
                      mb-2
                      flex
                      h-9
                      w-9
                      items-center
                      justify-center
                      rounded-xl
                      bg-gray-100
                      text-gray-400
                    "
                  >
                    <SearchIcon className="h-4 w-4" />
                  </div>

                  <p className="text-xs font-semibold text-gray-600">
                    No results found
                  </p>

                  <p className="mt-1 text-[11px] text-gray-400">
                    Try another search
                  </p>
                </div>
              )}


            {/* OPTIONS */}

            {!loading &&
              filteredOptions.map(
                (option) => {
                  const selected =
                    option.id === value;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        handleSelect(
                          option.id
                        )
                      }
                      className={`
                        flex
                        w-full
                        items-center
                        gap-2.5
                        rounded-xl
                        px-3
                        py-2.5
                        text-left
                        text-xs
                        transition
                        ${selected
                          ? "bg-violet-50 text-violet-700"
                          : "text-gray-600 hover:bg-gray-50"
                        }
                      `}
                    >
                      <span
                        className={`
                          flex
                          h-7
                          w-7
                          shrink-0
                          items-center
                          justify-center
                          rounded-lg
                          ${selected
                            ? "bg-violet-100 text-violet-600"
                            : "bg-gray-100 text-gray-400"
                          }
                        `}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>

                      <span className="min-w-0 flex-1 truncate font-medium">
                        {option.name}
                      </span>

                      {selected && (
                        <CheckIcon
                          className="
                            h-4
                            w-4
                            shrink-0
                            text-violet-600
                          "
                        />
                      )}
                    </button>
                  );
                }
              )}
          </div>
        </div>
      )}
    </div>
  );
}


/* ============================================================
   SIMPLE FILTER
   ------------------------------------------------------------
   Status / Priority
   ============================================================ */

function SimpleFilterDropdown({
  filterKey,
  label,
  allLabel,
  options,
  value,
  onChange,
}) {
  const [open, setOpen] = useState(false);

  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          event.target
        )
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  const active = Boolean(value);
  const getOptionValue = (option) => {
    if (
      typeof option === "object" &&
      option !== null
    ) {
      return option.value ?? option.id;
    }

    return option;
  };

  const getOptionLabel = (option) => {
    if (
      typeof option === "object" &&
      option !== null
    ) {
      return option.label ?? option.name;
    }

    return titleCase(String(option));
  };

  const selectedOption = options.find(
    (option) =>
      getOptionValue(option) === value
  );

  const selectedLabel = value
    ? getOptionLabel(
      selectedOption || value
    )
    : allLabel;
  const getIndicator = () => {
    if (!value) {
      return (
        <span className="h-2 w-2 rounded-full bg-gray-300" />
      );
    }

    if (filterKey === "sort") {
      return (
        <span className="h-2 w-2 rounded-full bg-violet-500" />
      );
    }

    if (filterKey === "priority") {
      return (
        <span
          className={`
            h-2
            w-2
            rounded-full
            ${value === "critical"
              ? "bg-red-500"
              : value === "high"
                ? "bg-orange-500"
                : value === "medium"
                  ? "bg-yellow-500"
                  : "bg-green-500"
            }
          `}
        />
      );
    }

    return (
      <span
        className={`
          h-2
          w-2
          rounded-full
          ${value === "completed"
            ? "bg-emerald-500"
            : value === "in-progress"
              ? "bg-blue-500"
              : value === "review"
                ? "bg-violet-500"
                : value === "cancelled"
                  ? "bg-red-500"
                  : "bg-gray-400"
          }
        `}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className="
        relative
        w-full
        min-w-0
        sm:w-[180px]
        lg:w-[170px]
        xl:w-[180px]
      "
    >
      <button
        type="button"
        onClick={() =>
          setOpen(
            (previous) => !previous
          )
        }
        className={`
          flex
          h-10
          w-full
          items-center
          gap-2
          rounded-xl
          border
          px-3
          text-left
          text-sm
          font-medium
          transition-all
          ${active
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-white"
          }
          focus:outline-none
          focus:ring-4
          focus:ring-violet-50
        `}
      >
        {getIndicator()}

        <span className="min-w-0 flex-1 truncate">
          {selectedLabel}
        </span>

        {active && (
          <span
            className="
              flex
              h-5
              w-5
              items-center
              justify-center
              rounded-full
              bg-violet-100
              text-violet-600
            "
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
          >
            <XIcon className="h-3 w-3" />
          </span>
        )}

        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          className="
            absolute
            left-0
            top-[calc(100%+6px)]
            z-50
            w-full
            min-w-[180px]
            overflow-hidden
            rounded-2xl
            border
            border-gray-200
            bg-white
            p-1.5
            shadow-xl
            shadow-gray-200/60
          "
        >
          {/* ALL */}

          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`
              flex
              w-full
              items-center
              gap-2.5
              rounded-xl
              px-3
              py-2.5
              text-left
              text-xs
              font-medium
              ${!value
                ? "bg-violet-50 text-violet-700"
                : "text-gray-600 hover:bg-gray-50"
              }
            `}
          >
            <span className="h-2 w-2 rounded-full bg-gray-300" />

            <span className="flex-1">
              {allLabel}
            </span>

            {!value && (
              <CheckIcon className="h-4 w-4 text-violet-600" />
            )}
          </button>

          {/* OPTIONS */}

          {options.map((option) => {
            const optionValue =
              getOptionValue(option);

            const optionLabel =
              getOptionLabel(option);

            const selected =
              optionValue === value;

            return (
              <button
                key={optionValue}
                type="button"
                onClick={() => {
                  onChange(optionValue);
                  setOpen(false);
                }}
                className={`
                  flex
                  w-full
                  items-center
                  gap-2.5
                  rounded-xl
                  px-3
                  py-2.5
                  text-left
                  text-xs
                  font-medium
                  transition
                  ${selected
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-600 hover:bg-gray-50"
                  }
                `}
              >
                <span
                  className={`
                    h-2
                    w-2
                    rounded-full
                    ${filterKey === "sort"
                      ? "bg-violet-400"
                      : filterKey === "priority"
                        ? optionValue === "critical"
                          ? "bg-red-500"
                          : optionValue === "high"
                            ? "bg-orange-500"
                            : optionValue === "medium"
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        : optionValue === "completed"
                          ? "bg-emerald-500"
                          : optionValue === "in-progress"
                            ? "bg-blue-500"
                            : optionValue === "review"
                              ? "bg-violet-500"
                              : optionValue === "cancelled"
                                ? "bg-red-500"
                                : "bg-gray-400"
                    }
                  `}
                />

                <span className="flex-1">
                  {optionLabel}
                </span>

                {selected && (
                  <CheckIcon className="h-4 w-4 text-violet-600" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ============================================================
   ACTIVE FILTER CHIP
   ============================================================ */

function ActiveFilterChip({
  label,
  value,
  onClear,
}) {
  return (
    <div
      className="
        inline-flex
        max-w-full
        items-center
        gap-1.5
        rounded-lg
        border
        border-violet-100
        bg-violet-50
        px-2.5
        py-1.5
        text-[11px]
        font-medium
        text-violet-700
      "
    >
      <span className="text-violet-400">
        {label}:
      </span>

      <span className="max-w-[150px] truncate font-semibold">
        {value}
      </span>

      <button
        type="button"
        onClick={onClear}
        className="
          ml-0.5
          flex
          h-4
          w-4
          shrink-0
          items-center
          justify-center
          rounded
          text-violet-400
          transition
          hover:bg-violet-100
          hover:text-violet-700
        "
      >
        <XIcon className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}


/* ============================================================
   MAIN COMPONENT
   ============================================================ */

function GlobalFilters({
  filters,
  setFilters,
  enabledFilters = [],
}) {
  const [departments, setDepartments] =
    useState([]);

  const [projects, setProjects] =
    useState([]);

  const [employees, setEmployees] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  /* ----------------------------------------------------------
     LOAD FILTER DATA
     ---------------------------------------------------------- */

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          deptRes,
          projectRes,
          employeeRes,
        ] = await Promise.all([
          api.get(
            "/departments?page=1&limit=1000"
          ),
          api.get(
            "/projects?page=1&limit=1000"
          ),
          api.get(
            "/employees?page=1&limit=1000"
          ),
        ]);

        if (!isMounted) return;

        const extractList = (
          response,
          key
        ) => {
          const body =
            response?.data;

          if (Array.isArray(body)) {
            return body;
          }

          if (
            Array.isArray(
              body?.[key]
            )
          ) {
            return body[key];
          }

          if (
            Array.isArray(
              body?.data
            )
          ) {
            return body.data;
          }

          return [];
        };

        setDepartments(
          extractList(
            deptRes,
            "departments"
          )
        );

        setProjects(
          extractList(
            projectRes,
            "projects"
          )
        );

        setEmployees(
          extractList(
            employeeRes,
            "employees"
          )
        );
      } catch (err) {
        console.error(
          "GlobalFilters load error:",
          err
        );

        if (isMounted) {
          setError(
            "Failed to load filter data."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);


  /* ----------------------------------------------------------
     DERIVED DATA
     ---------------------------------------------------------- */

  const managers = useMemo(
    () =>
      employees.filter(
        isManagerRole
      ),
    [employees]
  );

  const teamLeads = useMemo(
    () =>
      employees.filter(
        isTeamLeadRole
      ),
    [employees]
  );

  const datasets = useMemo(
    () => ({
      departments,
      projects,
      employees,
    }),
    [
      departments,
      projects,
      employees,
    ]
  );


  /* ----------------------------------------------------------
     UPDATE FILTER
     ---------------------------------------------------------- */

  const updateFilter = useCallback(
    (key, selectedValue) => {
      setFilters((previous) => {
        const next = { ...previous, [key]: selectedValue, };

        // Month and Week are mutually exclusive
        if (key === "month" && selectedValue) {
          next.week = "";
        }

        if (key === "week" && selectedValue) {
          next.month = "";
        }

        return next;
      });
    },
    [setFilters]
  );


  /* ----------------------------------------------------------
     BUILD RELATIONSHIP OPTIONS
     ---------------------------------------------------------- */

  const buildOptions = (
    key,
    masterList
  ) => {
    const allowedIds =
      getAllowedIds(
        key,
        filters,
        datasets
      );

    const scoped =
      allowedIds === null
        ? masterList
        : masterList.filter(
          (item) =>
            allowedIds.has(
              item._id
            )
        );

    return scoped.map(
      (item) => ({
        id: item._id,
        name:
          item.name ||
          item.fullName ||
          item.username ||
          "Unnamed",
      })
    );
  };

  const departmentOptions = useMemo(() => buildOptions("department", departments), [filters, datasets, departments,]);

  const projectOptions =
    useMemo(() => buildOptions("project", projects), [filters, datasets, projects,]);

  const employeeOptions =
    useMemo(() => buildOptions("employee", employees), [filters, datasets, employees,]);

  const managerOptions =
    useMemo(() => buildOptions("manager", managers), [filters, datasets, managers,]);

  const teamLeadOptions =
    useMemo(
      () =>
        buildOptions(
          "teamLead",
          teamLeads
        ),
      [
        filters,
        datasets,
        teamLeads,
      ]
    );
  /* ----------------------------------------------------------
     CONFIG
     ---------------------------------------------------------- */

  const FILTER_CONFIG = {
    year: {
      label: "Year",
      allLabel: "All Years",
      options: YEAR_OPTIONS,
      type: "simple",
    },

    month: {
      label: "Month",
      allLabel: "All Months",
      options: MONTH_OPTIONS,
      type: "simple",
    },

    week: {
      label: "Week",
      allLabel: "All Weeks",
      options: WEEK_OPTIONS,
      type: "simple",
    },
    department: {
      label: "Department",
      allLabel: "All Departments",
      options: departmentOptions,
      type: "searchable",
    },

    project: {
      label: "Project",
      allLabel: "All Projects",
      options: projectOptions,
      type: "searchable",
    },

    employee: {
      label: "Employee",
      allLabel: "All Employees",
      options: employeeOptions,
      type: "searchable",
    },

    manager: {
      label: "Manager",
      allLabel: "All Managers",
      options: managerOptions,
      type: "searchable",
    },

    teamLead: {
      label: "Team Lead",
      allLabel: "All Team Leads",
      options: teamLeadOptions,
      type: "searchable",
    },

    state: {
      label: "State",
      allLabel: "All States",
      options: STATE_OPTIONS,
      type: "simple",
    },

    status: {
      label: "Status",
      allLabel: "All Statuses",
      options: STATUS_OPTIONS,
      type: "simple",
    },

    priority: {
      label: "Priority",
      allLabel: "All Priorities",
      options: PRIORITY_OPTIONS,
      type: "simple",
    },
    sort: {
      label: "Sort by",
      allLabel: "Default",
      options: SORT_OPTIONS,
      type: "simple",
    },
    role: {
      label: "Role",
      allLabel: "All Roles",
      options: ROLE_OPTIONS.map((item) => ({
        id: item.value,
        name: item.label,
      })),
      type: "simple",
    },
    type: {
      label: "Type",
      allLabel: "All Types",
      options: TYPE_OPTIONS.map((item) => ({ id: item.value, name: item.label, })),
      type: "simple",
    },
  };

  /* ----------------------------------------------------------
     ACTIVE FILTERS
     ---------------------------------------------------------- */
  const activeFilters = useMemo(() => {
    const result = [];
    // Search
    if (filters.search) {
      result.push({ key: "search", label: "Search", value: filters.search, });
    }
    enabledFilters.forEach((key) => {
      if (key === "search" || !filters[key]) {
        return;
      }
      const config = FILTER_CONFIG[key];
      if (!config) return;
      let displayValue = filters[key];
      // Simple filters
      if (config.type === "simple") {
        const selectedOption = config.options.find((option) => {
          // Supports both:
          // "active"
          // and:
          // { value: "newest", label: "Newest" }
          return typeof option === "object" ? option.value === filters[key] : option === filters[key];
        });
        displayValue = typeof selectedOption === "object" ? selectedOption.label : selectedOption ? titleCase(selectedOption) : titleCase(filters[key]);
      }

      // Searchable relationship filters
      else {
        const option = config.options.find((item) => item.id === filters[key]);
        displayValue = option?.name || filters[key];
      }
      result.push({ key, label: config.label, value: displayValue, });
    });
    return result;
  }, [filters, enabledFilters, FILTER_CONFIG]);
  const activeFilterCount = activeFilters.length;




  /* ----------------------------------------------------------
     CLEAR ALL
     ---------------------------------------------------------- */

  const clearAllFilters =
    useCallback(() => {
      setFilters(
        (previous) => {
          const next = { ...previous, };
          Object.keys(next).forEach(
            (key) => {
              if (key === "dueDate") {
                return;
              }
              next[key] = "";
            }
          );
          return next;
        }
      );
    }, [setFilters]);
  /* ----------------------------------------------------------
     ERROR
     ---------------------------------------------------------- */

  if (error) {
    return (
      <div
        className="
          flex
          items-center
          justify-between
          gap-3
          rounded-xl
          border
          border-red-100
          bg-red-50
          px-4
          py-3
        "
      >
        <div className="flex items-center gap-2">
          <span
            className="
              h-2
              w-2
              rounded-full
              bg-red-500
            "
          />

          <span
            className="
              text-xs
              font-medium
              text-red-600
            "
          >
            {error}
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            window.location.reload()
          }
          className="
            flex
            items-center
            gap-1.5
            rounded-lg
            bg-white
            px-2.5
            py-1.5
            text-xs
            font-semibold
            text-red-600
            shadow-sm
            hover:bg-red-50
          "
        >
          <RefreshIcon className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div
      className="
        w-full
        rounded-2xl
        border
        border-gray-200
        bg-white
        shadow-sm
      "
    >
      {/* ======================================================
          TOOLBAR HEADER
          ====================================================== */}

      <div
        className="
          flex
          flex-col
          gap-3
          p-3
          sm:p-4
          lg:flex-row
          lg:items-center
        "
      >
        {/* Search */}

        {enabledFilters.includes(
          "search"
        ) && (
            <SearchFilter
              value={filters.search}
              onChange={(value) =>
                updateFilter(
                  "search",
                  value
                )
              }
              placeholder="Search..."
            />
          )}


        {/* Filters */}

        <div
          className="
            flex
            min-w-0
            flex-1
            flex-col
            gap-2
            sm:flex-row
            sm:flex-wrap
            lg:justify-end
            xl:flex-nowrap
          "
        >
          {enabledFilters.map(
            (key) => {
              if (
                key === "search"
              ) {
                return null;
              }

              const config =
                FILTER_CONFIG[key];

              if (!config) {
                return null;
              }

              if (
                config.type ===
                "simple"
              ) {
                return (
                  <SimpleFilterDropdown
                    key={key}
                    filterKey={key}
                    label={
                      config.label
                    }
                    allLabel={
                      config.allLabel
                    }
                    options={
                      config.options
                    }
                    value={
                      filters[key] ||
                      ""
                    }
                    onChange={(
                      value
                    ) =>
                      updateFilter(
                        key,
                        value
                      )
                    }
                  />
                );
              }

              return (
                <FilterDropdown
                  key={key}
                  filterKey={key}
                  label={
                    config.label
                  }
                  allLabel={
                    config.allLabel
                  }
                  options={
                    config.options
                  }
                  value={
                    filters[key] ||
                    ""
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      key,
                      value
                    )
                  }
                  loading={loading}
                />
              );
            }
          )}
        </div>


        {/* Clear all */}

        {activeFilterCount >
          0 && (
            <button
              type="button"
              onClick={
                clearAllFilters
              }
              className="
              flex
              h-10
              shrink-0
              items-center
              justify-center
              gap-1.5
              rounded-xl
              border
              border-gray-200
              bg-white
              px-3
              text-xs
              font-semibold
              text-gray-500
              transition
              hover:border-red-200
              hover:bg-red-50
              hover:text-red-600
            "
            >
              <XIcon className="h-3.5 w-3.5" />

              <span className="hidden sm:inline">
                Clear
              </span>

              <span
                className="
                flex
                h-5
                min-w-5
                items-center
                justify-center
                rounded-full
                bg-gray-100
                px-1
                text-[10px]
              "
              >
                {activeFilterCount}
              </span>
            </button>
          )}
      </div>


      {/* ======================================================
          ACTIVE FILTER SUMMARY
          ====================================================== */}

      {activeFilterCount >
        0 && (
          <div
            className="
            flex
            flex-wrap
            items-center
            gap-2
            border-t
            border-gray-100
            bg-gray-50/60
            px-3
            py-2.5
            sm:px-4
          "
          >
            <div
              className="
              flex
              items-center
              gap-1.5
              pr-1
              text-[11px]
              font-semibold
              uppercase
              tracking-wide
              text-gray-400
            "
            >
              <FilterIcon className="h-3.5 w-3.5" />

              Active
            </div>

            {activeFilters.map(
              (filter) => (
                <ActiveFilterChip
                  key={
                    filter.key
                  }
                  label={
                    filter.label
                  }
                  value={
                    filter.value
                  }
                  onClear={() =>
                    updateFilter(
                      filter.key,
                      ""
                    )
                  }
                />
              )
            )}
          </div>
        )}
    </div>
  );
}

export default GlobalFilters;