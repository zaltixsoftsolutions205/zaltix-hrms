// src/utils/employeeAnalytics.js
//
// Pure calculation helpers for the Employee Analytics dashboard.
// Functions 1–8 and 10–11 take the raw `employees` array — the exact shape
// returned by GET /api/employees (department populated) — and return data
// shaped for direct consumption by EmployeeAnalytics.jsx / Recharts.
//
// Function 9 (performance) additionally takes a `scoresMap` built by the
// component from the EXISTING GET /automation/scores/:employeeId route
// (the same one TabContent.jsx already uses for a single employee's
// Performance tab) — no new backend route required.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

// Interns carry fresher/experienced on internship.candidateType.
// Everyone else carries it directly on employeeType (see employeeController
// createEmployee: docTrack = employeeType === 'intern' ? internship?.candidateType : employeeType).
function getCandidateType(emp) {
  if (emp.employeeType === 'intern') return emp.internship?.candidateType || null;
  return ['fresher', 'experienced'].includes(emp.employeeType) ? emp.employeeType : null;
}

function isIntern(emp) {
  return emp.employeeType === 'intern';
}

// Net salary = basicSalary + sum(allowances) - sum(deductions).
// allowances/deductions are arrays of { name, amount } on the User schema.
function netSalary(emp) {
  const base = Number(emp.basicSalary) || 0;
  const allowances = Array.isArray(emp.allowances)
    ? emp.allowances.reduce((sum, a) => sum + (Number(a?.amount) || 0), 0)
    : 0;
  const deductions = Array.isArray(emp.deductions)
    ? emp.deductions.reduce((sum, d) => sum + (Number(d?.amount) || 0), 0)
    : 0;
  return base + allowances - deductions;
}

/* ------------------------------------------------------------------ */
/* 1. Overview                                                         */
/* ------------------------------------------------------------------ */
export function getOverview(employees = []) {
  const total = employees.length;
  const active = employees.filter((e) => e.isActive).length;
  const inactive = total - active;
  const interns = employees.filter(isIntern).length;
  const freshers = employees.filter((e) => getCandidateType(e) === 'fresher').length;
  const experienced = employees.filter((e) => getCandidateType(e) === 'experienced').length;
  const departments = new Set(
    employees.filter((e) => e.department?._id).map((e) => e.department._id)
  ).size;

  const now = new Date();
  const joinedThisMonth = employees.filter((e) => {
    if (!e.joiningDate) return false;
    const d = new Date(e.joiningDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return { total, active, inactive, interns, freshers, experienced, departments, joinedThisMonth };
}

/* ------------------------------------------------------------------ */
/* 2. Employee Distribution — pie                                      */
/* ------------------------------------------------------------------ */
export function getEmployeeDistribution(employees = []) {
  let freshers = 0, experienced = 0, interns = 0, unspecified = 0;

  employees.forEach((e) => {
    if (isIntern(e)) interns++;
    else if (getCandidateType(e) === 'fresher') freshers++;
    else if (getCandidateType(e) === 'experienced') experienced++;
    else unspecified++;
  });

  return [
    { name: 'Freshers', value: freshers },
    { name: 'Experienced', value: experienced },
    { name: 'Interns', value: interns },
    { name: 'Unspecified', value: unspecified },
  ].filter((d) => d.value > 0);
}

/* ------------------------------------------------------------------ */
/* 3. Department Wise Employees — bar                                  */
/* ------------------------------------------------------------------ */
export function getDepartmentDistribution(employees = []) {
  const map = new Map();
  employees.forEach((e) => {
    const name = e.department?.name || 'Unassigned';
    map.set(name, (map.get(name) || 0) + 1);
  });
  return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* 4. Employee Joining Trend — area, last 12 months                    */
/* ------------------------------------------------------------------ */
export function getJoiningTrend(employees = []) {
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      name: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
      count: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  employees.forEach((e) => {
    if (!e.joiningDate) return;
    const d = new Date(e.joiningDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.count++;
  });
  return buckets.map(({ name, count }) => ({ name, count }));
}

/* ------------------------------------------------------------------ */
/* 5. Salary Analysis                                                   */
/* ------------------------------------------------------------------ */
export function getSalaryAnalysis(employees = []) {
  const withSalary = employees.filter((e) => Number(e.basicSalary) > 0);
  if (withSalary.length === 0) {
    return { highest: 0, lowest: 0, average: 0, totalPayroll: 0, count: 0 };
  }
  const salaries = withSalary.map(netSalary);
  const totalPayroll = salaries.reduce((s, v) => s + v, 0);
  return {
    highest: Math.max(...salaries),
    lowest: Math.min(...salaries),
    average: Math.round(totalPayroll / salaries.length),
    totalPayroll,
    count: withSalary.length,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Experience Analysis — pie                                        */
/* The User schema has no "years of experience" field, only            */
/* joiningDate — so this measures TENURE AT THIS COMPANY, not prior     */
/* work experience. Labelled clearly in the UI to avoid overclaiming.   */
/* ------------------------------------------------------------------ */
export function getExperienceAnalysis(employees = []) {
  const buckets = {
    '< 6 months': 0,
    '6 months – 1 year': 0,
    '1 – 2 years': 0,
    '2 – 5 years': 0,
    '5+ years': 0,
    Unknown: 0,
  };
  const now = new Date();
  employees.forEach((e) => {
    if (!e.joiningDate) {
      buckets.Unknown++;
      return;
    }
    const months = (now - new Date(e.joiningDate)) / (1000 * 60 * 60 * 24 * 30.44);
    if (months < 6) buckets['< 6 months']++;
    else if (months < 12) buckets['6 months – 1 year']++;
    else if (months < 24) buckets['1 – 2 years']++;
    else if (months < 60) buckets['2 – 5 years']++;
    else buckets['5+ years']++;
  });
  return Object.entries(buckets)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);
}

/* ------------------------------------------------------------------ */
/* 7. Status Analysis — pie                                            */
/* ------------------------------------------------------------------ */
export function getStatusAnalysis(employees = []) {
  const active = employees.filter((e) => e.isActive).length;
  const inactive = employees.length - active;
  return [
    { name: 'Active', value: active },
    { name: 'Inactive', value: inactive },
  ];
}

/* ------------------------------------------------------------------ */
/* 8. Missing Information Report                                       */
/* ------------------------------------------------------------------ */
const MISSING_CHECKS = [
  { key: 'designation', label: 'Designation', test: (e) => !e.designation },
  { key: 'department', label: 'Department', test: (e) => !e.department },
  { key: 'phone', label: 'Phone', test: (e) => !e.phone },
  { key: 'address', label: 'Address', test: (e) => !e.address },
  { key: 'joiningDate', label: 'Joining Date', test: (e) => !e.joiningDate },
  { key: 'salary', label: 'Salary', test: (e) => !e.basicSalary || Number(e.basicSalary) === 0 },
  { key: 'profilePicture', label: 'Profile Picture', test: (e) => !e.profilePicture },
  { key: 'joiningLetter', label: 'Joining Letter', test: (e) => !e.joiningLetter },
  { key: 'idCard', label: 'ID Card', test: (e) => !e.idCard },
  { key: 'bankDetails', label: 'Bank Details', test: (e) => !e.accountNumber || !e.ifscCode },
  { key: 'uanNumber', label: 'UAN', test: (e) => !e.uanNumber },
];

export function getMissingInformation(employees = []) {
  const rows = employees
    .map((e) => {
      const missing = MISSING_CHECKS.filter((c) => c.test(e)).map((c) => c.label);
      return {
        _id: e._id,
        employeeId: e.employeeId,
        name: e.name,
        department: e.department?.name || '—',
        missing,
        missingCount: missing.length,
      };
    })
    .filter((r) => r.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount);

  const totals = MISSING_CHECKS.map((c) => ({
    label: c.label,
    count: employees.filter(c.test).length,
  }));

  return { rows, totals, totalIncomplete: rows.length };
}

/* ------------------------------------------------------------------ */
/* 9. Performance Analysis                                             */
/* Built from a scoresMap: Map<employeeId, latestScoreObject>.         */
/* The component fetches that map by calling the EXISTING              */
/* GET /automation/scores/:employeeId route once per employee — the    */
/* same route TabContent.jsx already calls for a single employee.      */
/* This function does no fetching itself, it only crunches numbers.    */
/* ------------------------------------------------------------------ */
export function gradeForScore(score) {
  if (score >= 90) return { label: 'Excellent', tone: 'excellent' };
  if (score >= 75) return { label: 'Good', tone: 'good' };
  if (score >= 60) return { label: 'Average', tone: 'average' };
  return { label: 'Needs Improvement', tone: 'poor' };
}

export function getPerformanceAnalysis(employees = [], scoresMap = new Map()) {
  const rows = [];
  let scoreSum = 0;
  let tasksCompletedSum = 0;
  let tasksTotalSum = 0;
  let attendanceDaysSum = 0;
  let workingDaysSum = 0;

  employees.forEach((e) => {
    const latest = scoresMap.get(e._id);
    if (!latest) return;

    const score = Number(latest.totalScore) || 0;
    scoreSum += score;
    tasksCompletedSum += Number(latest.tasksCompleted) || 0;
    tasksTotalSum += Number(latest.tasksTotal) || 0;
    attendanceDaysSum += Number(latest.attendanceDays) || 0;
    workingDaysSum += Number(latest.workingDays) || 0;

    rows.push({
      _id: e._id,
      employeeId: e.employeeId,
      name: e.name,
      department: e.department?.name || '—',
      week: latest.week,
      score,
      grade: gradeForScore(score).label,
      gradeTone: gradeForScore(score).tone,
      tasksCompleted: Number(latest.tasksCompleted) || 0,
      tasksTotal: Number(latest.tasksTotal) || 0,
      attendanceDays: Number(latest.attendanceDays) || 0,
      workingDays: Number(latest.workingDays) || 0,
    });
  });

  rows.sort((a, b) => b.score - a.score);

  const totalWithScores = rows.length;
  const totalPending = employees.length - totalWithScores;
  const avgScore = totalWithScores > 0 ? Math.round(scoreSum / totalWithScores) : 0;
  const topPerformersCount = rows.filter((r) => r.score >= 90).length;
  const taskCompletionRate = tasksTotalSum > 0 ? Math.round((tasksCompletedSum / tasksTotalSum) * 100) : 0;
  const attendanceRate = workingDaysSum > 0 ? Math.round((attendanceDaysSum / workingDaysSum) * 100) : 0;

  const chartData = rows.map((r) => ({ name: r.name, employeeId: r.employeeId, score: r.score }));

  return {
    available: totalWithScores > 0,
    totalWithScores,
    totalPending,
    avgScore,
    topPerformersCount,
    taskCompletionRate,
    attendanceRate,
    tasksCompletedSum,
    tasksTotalSum,
    attendanceDaysSum,
    workingDaysSum,
    chartData,
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* 10. Role Distribution — horizontal bar                              */
/* ------------------------------------------------------------------ */
export function getRoleDistribution(employees = []) {
  const map = new Map();
  employees.forEach((e) => {
    const role = e.role || 'unspecified';
    map.set(role, (map.get(role) || 0) + 1);
  });
  return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* 11. Department Health — table                                       */
/* ------------------------------------------------------------------ */
export function getDepartmentHealth(employees = []) {
  const map = new Map();
  employees.forEach((e) => {
    const name = e.department?.name || 'Unassigned';
    if (!map.has(name)) {
      map.set(name, {
        department: name,
        employees: 0,
        active: 0,
        inactive: 0,
        interns: 0,
        salarySum: 0,
        salaryCount: 0,
      });
    }
    const row = map.get(name);
    row.employees++;
    if (e.isActive) row.active++;
    else row.inactive++;
    if (isIntern(e)) row.interns++;
    if (Number(e.basicSalary) > 0) {
      row.salarySum += netSalary(e);
      row.salaryCount++;
    }
  });

  return Array.from(map.values())
    .map((r) => ({
      department: r.department,
      employees: r.employees,
      active: r.active,
      inactive: r.inactive,
      interns: r.interns,
      avgSalary: r.salaryCount > 0 ? Math.round(r.salarySum / r.salaryCount) : 0,
    }))
    .sort((a, b) => b.employees - a.employees);
}