/**
 * workItemService.js
 * ---------------------------------------------------------------------------
 * Shared rules for project module work items (Task with kind task|bug|milestone).
 *
 * Private items (Task.isPrivate) are visible only to:
 *   admin, the project's team lead, the head of any project department,
 *   the reporter, the creator and the assignees.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Project = require('../models/Project');
const Department = require('../models/Department');
const WorkflowStage = require('../models/WorkflowStage');
const Task = require('../models/Task');
const { projectDepartmentIds, headedDepartmentIds } = require('./projectAccessService');

const idOf = (v) => (v ? String(v._id || v) : null);

const KINDS = ['task', 'bug', 'milestone'];
/** Which projectAccess key governs a kind. */
const accessKeyFor = (kind) => (kind === 'bug' ? 'bugs' : 'tasks');

const DEFAULT_BUG_STAGES = [
  { name: 'Not started', color: '#94A3B8', isCompleted: false },
  { name: 'In progress', color: '#F59E0B', isCompleted: false },
  { name: 'Complete', color: '#10B981', isCompleted: true },
];

/** Admin, the project lead, or head of one of its departments. */
async function isProjectPrivileged(user, project) {
  if (!user || !project) return false;
  if (user.role === 'admin') return true;
  if (idOf(project.manager) === idOf(user._id)) return true;
  return Boolean(await Department.exists({ _id: { $in: projectDepartmentIds(project) }, headOf: user._id }));
}

/** Mongo clause hiding private items the user may not see (within one project). */
const privateClauseForProject = (user, privileged) => (privileged
  ? {}
  : {
    $or: [
      { isPrivate: { $ne: true } },
      { reporter: user._id },
      { createdBy: user._id },
      { 'assignees.user': user._id },
    ],
  });

/** Same rule across all projects (used by the legacy /api/tasks endpoints). */
async function privateClauseForUser(user) {
  if (!user || user.role === 'admin') return {};
  const headed = await headedDepartmentIds(user);
  const privilegedProjectIds = await Project.find({
    $or: [{ manager: user._id }, ...(headed.length ? [{ departments: { $in: headed } }] : [])],
  }).distinct('_id');
  return {
    $or: [
      { isPrivate: { $ne: true } },
      { reporter: user._id },
      { createdBy: user._id },
      { 'assignees.user': user._id },
      { project: { $in: privilegedProjectIds } },
    ],
  };
}

/** Can `user` see this (possibly private) task document? */
async function canSeeTask(user, task) {
  if (!task || !task.isPrivate) return true;
  if (!user) return false;
  const uid = idOf(user._id);
  if (user.role === 'admin') return true;
  if ([task.reporter, task.createdBy].some((v) => idOf(v) === uid)) return true;
  if ((task.assignees || []).some((a) => idOf(a.user) === uid)) return true;
  if (!task.project) return false;
  const project = task.project.manager !== undefined
    ? task.project
    : await Project.findById(idOf(task.project)).select('manager department departments').lean();
  return isProjectPrivileged(user, project);
}

/** People who can be assigned work in a project: the lead + members. */
const projectPeopleIds = (project) => [...new Set([idOf(project.manager), ...(project.teamMembers || []).map(idOf)].filter(Boolean))];

/**
 * The project's bug stages, creating the default three on first use.
 * Upserts by name, so concurrent first calls can't duplicate them.
 */
async function ensureBugStages(projectId, userId) {
  let stages = await WorkflowStage.find({ project: projectId, scope: 'bug', isActive: true }).sort({ order: 1, createdAt: 1 });
  if (stages.length) return stages;
  await Promise.all(DEFAULT_BUG_STAGES.map((s, i) => WorkflowStage.updateOne(
    { project: projectId, scope: 'bug', name: s.name },
    { $setOnInsert: { ...s, project: projectId, scope: 'bug', order: i, isSystem: true, isActive: true, createdBy: userId } },
    { upsert: true }
  )));
  stages = await WorkflowStage.find({ project: projectId, scope: 'bug', isActive: true }).sort({ order: 1, createdAt: 1 });
  return stages;
}

/** Task.status that matches a bug stage: done stage -> completed, first -> not-started. */
function statusForStage(stage, orderedStages) {
  if (!stage) return 'not-started';
  if (stage.isCompleted) return 'completed';
  return idOf(orderedStages[0]) === idOf(stage) ? 'not-started' : 'in-progress';
}

/** Re-derive Task.status (and completedDate) for every bug of a project. */
async function resyncBugStatuses(projectId) {
  const stages = await WorkflowStage.find({ project: projectId, scope: 'bug', isActive: true }).sort({ order: 1, createdAt: 1 });
  await Promise.all(stages.map((stage) => {
    const status = statusForStage(stage, stages);
    return Task.updateMany(
      { project: projectId, kind: 'bug', stage: stage._id, status: { $ne: status } },
      [{
        $set: {
          status,
          progress: status === 'completed' ? 100 : '$progress',
          completedDate: status === 'completed' ? { $ifNull: ['$completedDate', '$$NOW'] } : null,
        },
      }]
    );
  }));
}

/**
 * Project progress from its module work: done ÷ (tasks + milestones, not
 * cancelled). Only switches a project to automatic progress once it has at
 * least one module task; projects without module work keep manual progress.
 */
async function recalcProjectProgress(projectId) {
  if (!projectId) return null;
  const [row] = await Task.aggregate([
    {
      $match: {
        project: new mongoose.Types.ObjectId(String(projectId)),
        module: { $ne: null },
        isActive: { $ne: false },
        kind: { $in: ['task', 'milestone'] },
        status: { $ne: 'cancelled' },
      },
    },
    { $group: { _id: null, total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
  ]);
  if (!row || !row.total) {
    // No module tasks (left): give control back to the manual field.
    await Project.updateOne({ _id: projectId, progressAuto: true }, { $set: { progressAuto: false } });
    return null;
  }
  const progress = Math.round((row.done / row.total) * 100);
  await Project.updateOne({ _id: projectId }, { $set: { progress, progressAuto: true } });
  return progress;
}

module.exports = {
  recalcProjectProgress,
  KINDS,
  accessKeyFor,
  DEFAULT_BUG_STAGES,
  isProjectPrivileged,
  privateClauseForProject,
  privateClauseForUser,
  canSeeTask,
  projectPeopleIds,
  ensureBugStages,
  statusForStage,
  resyncBugStatuses,
};
