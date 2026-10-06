const Project = require('../models/Project');
const Department = require('../models/Department');
const User = require('../models/User');

const POPULATE = [
  { path: 'department', select: 'name' },
  { path: 'assignedEmployees', select: 'name employeeId' },
];

// Can this user manage projects (create/edit/assign)? Admin/HR always; a
// department head only for their own department's projects.
const canManageProject = async (user, project) => {
  if (['admin', 'hr'].includes(user.role)) return true;
  if (!user.department) return false;
  const dept = await Department.findById(user.department).select('headOf').lean();
  const isDeptHead = dept && String(dept.headOf) === String(user._id);
  if (!isDeptHead) return false;
  // A dept head may only manage projects scoped to their own department.
  if (!project) return true; // creating — department gets forced to their own below
  return project.department && String(project.department) === String(user.department);
};

// Anyone can list active projects (dropdown source for task entries).
exports.getProjects = async (req, res) => {
  try {
    const filter = {};
    if (!req.query.includeInactive) filter.isActive = true;
    if (req.query.departmentId) filter.department = req.query.departmentId;
    const projects = await Project.find(filter).populate(POPULATE).sort({ name: 1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin/HR can create a project for any (or no) department. A department head may
// only create one scoped to their own department.
exports.createProject = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    let department = req.body.department || null;
    const isAdminOrHr = ['admin', 'hr'].includes(req.user.role);

    if (!isAdminOrHr) {
      const allowed = await canManageProject(req.user, null);
      if (!allowed) {
        return res.status(403).json({ message: 'You do not have permission to create projects.' });
      }
      department = req.user.department; // dept heads can only create for their own department
    }

    const project = await Project.create({
      name,
      description: description || '',
      department,
      createdBy: req.user._id,
    });
    const populated = await Project.findById(project._id).populate(POPULATE);
    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A project with this name already exists for this department.' });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!(await canManageProject(req.user, project))) {
      return res.status(403).json({ message: 'You do not have permission to edit this project.' });
    }

    const { name, description, department } = req.body;
    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (department !== undefined && ['admin', 'hr'].includes(req.user.role)) project.department = department || null;
    await project.save();
    const populated = await Project.findById(project._id).populate(POPULATE);
    res.json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A project with this name already exists for this department.' });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.deactivateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!(await canManageProject(req.user, project))) {
      return res.status(403).json({ message: 'You do not have permission to deactivate this project.' });
    }
    project.isActive = false;
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employees a project-manager can pick from when assigning. Admin/HR see
// everyone; a department head sees only their own department (no hr_employees
// module access required — scoped the same way Team View is).
exports.getAssignableEmployees = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (!['admin', 'hr'].includes(req.user.role)) {
      const allowed = await canManageProject(req.user, null);
      if (!allowed) return res.status(403).json({ message: 'Not authorized.' });
      filter.department = req.user.department;
    }
    const employees = await User.find(filter).select('name employeeId').sort({ name: 1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Set the full "who's on this project" list. Informational only — does not
// restrict the task-entry dropdown for anyone.
exports.assignEmployees = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!(await canManageProject(req.user, project))) {
      return res.status(403).json({ message: 'You do not have permission to assign employees to this project.' });
    }

    const { employeeIds } = req.body;
    if (!Array.isArray(employeeIds)) {
      return res.status(400).json({ message: 'employeeIds must be an array.' });
    }
    project.assignedEmployees = employeeIds;
    await project.save();
    const populated = await Project.findById(project._id).populate(POPULATE);
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
