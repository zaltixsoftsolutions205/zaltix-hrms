/**
 * projectAccessService.js
 * ---------------------------------------------------------------------------
 * Who can do what on a workspace Project.
 *
 *   canManageProject  admin, or head of the owning department
 *                     -> create / delete / archive / change departments & lead
 *   canEditProject    canManageProject, or the project's team lead (manager)
 *                     -> edit details and team members
 *   getEffectiveProjectAccess -> { moduleTree, tasks, bugs, timeline }
 *     admin, team lead, head of any project department  -> all 'edit'
 *     project member                                     -> role-tree default of
 *                                                           their own department
 *                                                           (view if none), each
 *                                                           project sub-module set
 *                                                           in their module access
 *                                                           overrides it
 *     hr (not a member)                                  -> all 'view'
 *     anyone else                                        -> all 'none'
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Project = require('../models/Project');
const Department = require('../models/Department');
const { ACCESS_KEYS, getProjectAccess } = require('./departmentAccessService');

const idOf = (v) => (v ? String(v._id || v) : null);
const fill = (level) => Object.fromEntries(ACCESS_KEYS.map((k) => [k, level]));
const LEVEL_RANK = { none: 0, view: 1, edit: 2 };

const projectDepartmentIds = (project) => {
  const ids = [project.department, ...(project.departments || [])].map(idOf).filter(Boolean);
  return [...new Set(ids)];
};

const isLead = (user, project) => idOf(project.manager) === idOf(user._id);
const isMember = (user, project) => (project.teamMembers || []).some((m) => idOf(m) === idOf(user._id));

/** Does `user` belong to one of the project's departments? */
const isInProjectDepartments = (user, departmentIds) =>
  Boolean(user && user.department) && departmentIds.map(String).includes(idOf(user.department));

/** Ids of departments `user` heads. */
const headedDepartmentIds = async (user) => {
  if (!user) return [];
  const rows = await Department.find({ headOf: user._id }).select('_id').lean();
  return rows.map((d) => String(d._id));
};

async function canManageProject(user, project) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const owning = idOf(project.department);
  if (!owning) return false;
  return Boolean(await Department.exists({ _id: owning, headOf: user._id }));
}

async function canEditProject(user, project) {
  if (!user) return false;
  if (isLead(user, project)) return true;
  return canManageProject(user, project);
}

/** Can this user create a project owned by `departmentId`? */
async function canCreateProjectIn(user, departmentId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!departmentId || !mongoose.isValidObjectId(departmentId)) return false;
  return Boolean(await Department.exists({ _id: departmentId, headOf: user._id }));
}

/** Project sub-module key in User.moduleAccess -> access key used here. */
const SUBMODULE_KEYS = {
  project_module_tree: 'moduleTree',
  project_tasks: 'tasks',
  project_bugs: 'bugs',
  project_timeline: 'timeline',
};

/** The user's own sub-module settings ({ tasks: 'edit', ... }), only keys they set. */
const userOverrides = (user) => {
  const out = {};
  (user.moduleAccess || []).forEach((a) => {
    const key = SUBMODULE_KEYS[a.module];
    if (key) out[key] = a.permission === 'edit' ? 'edit' : 'view';
  });
  return out;
};

/**
 * Access of `user` to the parts of `project`:
 *   admin, project lead, head of a project department -> all 'edit'
 *   project member -> the role-tree default of their department, where every
 *                     sub-module the user has set in their own module access
 *                     wins (it can raise or lower the default)
 *   hr (not a member) -> all 'view'; anyone else -> all 'none'
 */
async function getEffectiveProjectAccess(user, project) {
  if (!user || !project) return fill('none');
  if (user.role === 'admin' || isLead(user, project)) return fill('edit');

  const deptIds = projectDepartmentIds(project);
  const headed = await headedDepartmentIds(user);
  if (headed.some((id) => deptIds.includes(id))) return fill('edit');

  if (!isMember(user, project)) return fill(user.role === 'hr' ? 'view' : 'none');

  // Role-tree default of the member's own department. Being on the team is
  // what grants access; the department only decides the default level, even
  // when that department is not linked to the project.
  // No department / missing department / empty role tree: look but don't change.
  let base = fill('view');
  const deptId = idOf(user.department);
  if (deptId && mongoose.isValidObjectId(deptId)) {
    const dept = await Department.findById(deptId).select('headOf roleTree').lean();
    if (dept && (dept.roleTree || []).length) base = getProjectAccess(user, dept);
  }
  const effective = { ...base, ...userOverrides(user) };
  if (user.role === 'hr') ACCESS_KEYS.forEach((k) => { if (effective[k] === 'none') effective[k] = 'view'; });
  return effective;
}

const hasLevel = (access, key, level) => LEVEL_RANK[access?.[key] || 'none'] >= LEVEL_RANK[level];
const hasAnyAccess = (access) => ACCESS_KEYS.some((k) => hasLevel(access, k, 'view'));

/**
 * Express middleware: loads req.project (by :projectId or :id) and
 * req.projectAccess. 404 if missing, 403 if the user has no access at all.
 */
async function loadProjectWithAccess(req, res, next) {
  try {
    const id = req.params.projectId || req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid project id.' });
    }
    const project = await Project.findById(id).select('name department departments manager teamMembers isActive');
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    const access = await getEffectiveProjectAccess(req.user, project);
    if (!hasAnyAccess(access)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this project.' });
    }
    req.project = project;
    req.projectAccess = access;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Middleware factory: require `level` ('view'|'edit') on one access key. */
const requireProjectAccess = (key, level) => (req, res, next) => {
  if (hasLevel(req.projectAccess, key, level)) return next();
  return res.status(403).json({ success: false, message: `You need ${level} access to ${key} on this project.` });
};

module.exports = {
  projectDepartmentIds,
  isInProjectDepartments,
  headedDepartmentIds,
  canManageProject,
  canEditProject,
  canCreateProjectIn,
  getEffectiveProjectAccess,
  loadProjectWithAccess,
  requireProjectAccess,
  hasLevel,
};
