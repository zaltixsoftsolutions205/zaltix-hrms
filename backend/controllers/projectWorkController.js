/**
 * Project module work: work items (tasks / bugs / milestones), plans and
 * bug pipeline stages. Mounted at /api/projects/:projectId/work.
 * Every handler runs after loadProjectWithAccess + attachPrivilege, so
 * req.project, req.projectAccess and req.projectPrivileged are set.
 */
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Plan = require('../models/Plan');
const User = require('../models/User');
const ProjectModule = require('../models/ProjectModule');
const WorkflowStage = require('../models/WorkflowStage');
const { hasLevel, projectDepartmentIds } = require('../services/projectAccessService');
const fs = require('fs');
const path = require('path');
const WorkItemComment = require('../models/WorkItemComment');
const { notifyMany } = require('../services/notificationService');
const {
  KINDS, accessKeyFor, isProjectPrivileged, privateClauseForProject, projectPeopleIds,
  ensureBugStages, statusForStage, resyncBugStatuses, recalcProjectProgress,
} = require('../services/workItemService');

const idOf = (v) => (v ? String(v._id || v) : null);
const isId = (v) => mongoose.isValidObjectId(v);
const TASK_STATUSES = ['not-started', 'in-progress', 'review', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const fail = (res, label, error) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ success: false, message: error.message, ...(error.extra || {}) });
  }
  if (error && error.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: Object.values(error.errors).map((e) => e.message).join(' ') });
  }
  if (error && /must be after/.test(error.message || '')) {
    return res.status(400).json({ success: false, message: error.message });
  }
  console.error(`${label}:`, error);
  return res.status(500).json({ success: false, message: 'Server Error' });
};

const ITEM_POPULATE = [
  { path: 'assignees.user', select: 'name employeeId profilePicture' },
  { path: 'reporter', select: 'name employeeId' },
  { path: 'createdBy', select: 'name' },
  { path: 'module', select: 'name color' },
  { path: 'plan', select: 'name' },
  { path: 'stage', select: 'name color isCompleted order' },
];

const toItem = (t) => ({
  _id: t._id,
  taskCode: t.taskCode,
  kind: t.kind || 'task',
  title: t.title,
  description: t.description,
  priority: t.priority,
  status: t.status,
  progress: t.progress,
  startDate: t.startDate,
  deadline: t.deadline,
  completedDate: t.completedDate,
  estimatedHours: t.estimatedHours,
  isPrivate: Boolean(t.isPrivate),
  boardOrder: t.boardOrder || 0,
  attachments: t.attachments || [],
  module: t.module && t.module._id ? { _id: t.module._id, name: t.module.name, color: t.module.color } : t.module,
  plan: t.plan && t.plan._id ? { _id: t.plan._id, name: t.plan.name } : t.plan,
  stage: t.stage && t.stage._id ? { _id: t.stage._id, name: t.stage.name, color: t.stage.color, isCompleted: t.stage.isCompleted } : t.stage,
  assignees: (t.assignees || []).map((a) => a.user).filter(Boolean).map((u) => (u._id ? { _id: u._id, name: u.name, employeeId: u.employeeId, profilePicture: u.profilePicture } : { _id: u })),
  reporter: t.reporter && t.reporter._id ? { _id: t.reporter._id, name: t.reporter.name } : t.reporter,
  createdBy: t.createdBy && t.createdBy._id ? { _id: t.createdBy._id, name: t.createdBy.name } : t.createdBy,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

/* ---------------------------------------------------------------- */
/* middleware                                                        */
/* ---------------------------------------------------------------- */

exports.attachPrivilege = async (req, res, next) => {
  try {
    req.projectPrivileged = await isProjectPrivileged(req.user, req.project);
    next();
  } catch (err) {
    next(err);
  }
};

/* ---------------------------------------------------------------- */
/* helpers                                                           */
/* ---------------------------------------------------------------- */

const can = (req, kind, level) => hasLevel(req.projectAccess, accessKeyFor(kind), level);

const loadModule = async (project, moduleId) => {
  if (!isId(moduleId)) throw new HttpError(400, 'A valid module is required.');
  const mod = await ProjectModule.findOne({ _id: moduleId, project: project._id }).select('_id name');
  if (!mod) throw new HttpError(400, 'Module is not part of this project.');
  return mod;
};

const loadPlan = async (project, planId, moduleId) => {
  if (!planId) return null;
  if (!isId(planId)) throw new HttpError(400, 'Invalid plan.');
  const plan = await Plan.findOne({ _id: planId, project: project._id });
  if (!plan) throw new HttpError(400, 'Plan is not part of this project.');
  if (moduleId && idOf(plan.module) !== idOf(moduleId)) throw new HttpError(400, 'The plan belongs to a different module.');
  return plan;
};

/** Assignees must be the project lead or members. */
const validateAssignees = (project, assignees) => {
  const ids = [...new Set((Array.isArray(assignees) ? assignees : []).filter(Boolean).map(idOf))];
  const allowed = new Set(projectPeopleIds(project));
  const outside = ids.filter((id) => !allowed.has(id));
  if (outside.length) throw new HttpError(400, 'Assignees must be the project team lead or project members.');
  return ids;
};

/** Department stored on the task: first assignee's (if in the project), else the owning one. */
const pickDepartment = async (project, assigneeIds) => {
  const deptIds = projectDepartmentIds(project);
  if (assigneeIds.length) {
    const first = await User.findById(assigneeIds[0]).select('department').lean();
    if (first && first.department && deptIds.includes(idOf(first.department))) return first.department;
  }
  return project.department;
};

const parseDate = (v, label) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Invalid ${label}.`);
  return d;
};

const applyStatus = (task, status) => {
  if (!TASK_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');
  const wasCompleted = task.status === 'completed';
  task.status = status;
  if (status === 'completed') {
    task.completedDate = task.completedDate || new Date();
    task.progress = 100;
  } else {
    task.completedDate = null;
    // Re-opened: the 100% set on completion no longer applies.
    if (wasCompleted && task.progress === 100) task.progress = 0;
  }
};

const bugStage = async (req, stageId) => {
  const stages = await ensureBugStages(req.project._id, req.user._id);
  const stage = stageId ? stages.find((s) => idOf(s) === String(stageId)) : stages[0];
  if (!stage) throw new HttpError(400, 'Stage is not part of this project\'s bug pipeline.');
  return { stage, stages };
};

const findItem = async (req) => {
  const { itemId } = req.params;
  if (!isId(itemId)) throw new HttpError(400, 'Invalid item id.');
  const task = await Task.findOne({
    _id: itemId,
    project: req.project._id,
    module: { $ne: null },
    isActive: { $ne: false },
    ...privateClauseForProject(req.user, req.projectPrivileged),
  });
  if (!task) throw new HttpError(404, 'Item not found.');
  if (!can(req, task.kind, 'view')) throw new HttpError(403, 'You do not have access to this item.');
  return task;
};

/**
 * What the caller may change on an item:
 *   'full'   edit access on the kind, or the reporter of a bug
 *   'status' an assignee: status / stage / progress only
 *   null     nothing
 */
const editScope = (req, task) => {
  if (can(req, task.kind, 'edit')) return 'full';
  const uid = idOf(req.user._id);
  if (task.kind === 'bug' && idOf(task.reporter) === uid) return 'full';
  if ((task.assignees || []).some((a) => idOf(a.user) === uid)) return 'status';
  return null;
};

const populated = async (taskId) => toItem(await Task.findById(taskId).populate(ITEM_POPULATE));

/* ---------------- notifications (fire-and-forget) ---------------- */

const itemLink = (projectId, task) => (task.kind === 'bug'
  ? `/projects/${projectId}?tab=bug-sheet&module=${idOf(task.module)}`
  : `/projects/${projectId}/modules/${idOf(task.module)}`);

/** Notify people about an item; never the actor, never fails the request. */
const notifyPeople = (ids, actor, payload) => {
  const recipients = [...new Set(ids.filter(Boolean).map(idOf))].filter((id) => id !== idOf(actor));
  if (!recipients.length) return;
  Promise.resolve(notifyMany(recipients, { type: 'task', ...payload }))
    .catch((err) => console.error('Work item notification failed:', err.message));
};

const kindLabel = (kind) => ({ task: 'task', bug: 'bug', milestone: 'milestone' }[kind] || 'item');
const assigneeIdsOf = (task) => (task.assignees || []).map((a) => idOf(a.user));

/** Recalculate project progress without failing the request. */
const refreshProgress = (projectId) => {
  recalcProjectProgress(projectId).catch((err) => console.error('Project progress recalc failed:', err.message));
};

/**
 * After an item changed: tell newly added assignees, tell the creator /
 * reporter when it got completed, and refresh project progress.
 */
const afterChange = (req, task, before) => {
  const who = req.user.name || 'Someone';
  const link = itemLink(req.project._id, task);
  const added = assigneeIdsOf(task).filter((id) => !before.assignees.has(id));
  if (added.length) {
    notifyPeople(added, req.user._id, {
      title: `Assigned: ${task.title}`,
      message: `${who} assigned you a ${kindLabel(task.kind)} in ${req.project.name}.`,
      link,
    });
  }
  if (before.status !== 'completed' && task.status === 'completed') {
    notifyPeople([task.createdBy, task.reporter], req.user._id, {
      title: `Completed: ${task.title}`,
      message: `${who} completed a ${kindLabel(task.kind)} in ${req.project.name}.`,
      link,
    });
  }
  refreshProgress(req.project._id);
};

/* ---------------------------------------------------------------- */
/* work items                                                        */
/* ---------------------------------------------------------------- */

// GET /work/items?kind=task,milestone&module=&plan=&stage=&status=&assignee=&search=
exports.listItems = async (req, res) => {
  try {
    const requested = String(req.query.kind || KINDS.join(',')).split(',').map((k) => k.trim()).filter((k) => KINDS.includes(k));
    const kinds = requested.filter((k) => can(req, k, 'view'));
    if (!kinds.length) {
      return res.status(403).json({ success: false, message: 'You do not have access to these items.' });
    }
    const filter = {
      project: req.project._id,
      module: { $ne: null },
      isActive: { $ne: false },
      kind: { $in: kinds },
      ...privateClauseForProject(req.user, req.projectPrivileged),
    };
    const { module, plan, stage, status, assignee, search } = req.query;
    if (module && isId(module)) filter.module = module;
    if (plan === 'none') filter.plan = null;
    else if (plan && isId(plan)) filter.plan = plan;
    if (stage && isId(stage)) filter.stage = stage;
    if (status && TASK_STATUSES.includes(status)) filter.status = status;
    if (assignee && isId(assignee)) filter['assignees.user'] = assignee;
    if (search) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [...(filter.$and || []), { $or: [{ title: rx }, { taskCode: rx }] }];
    }
    const tasks = await Task.find(filter).populate(ITEM_POPULATE).sort({ boardOrder: 1, deadline: 1, createdAt: 1 }).limit(1000);
    return res.json({
      success: true,
      access: req.projectAccess,
      privileged: req.projectPrivileged,
      items: tasks.map(toItem),
    });
  } catch (error) {
    return fail(res, 'List Work Items', error);
  }
};

// POST /work/items
exports.createItem = async (req, res) => {
  try {
    const { kind = 'task', module, plan, title, description, assignees, priority, startDate, deadline, status, stage, isPrivate, estimatedHours } = req.body;
    if (!KINDS.includes(kind)) throw new HttpError(400, 'kind must be task, bug or milestone.');
    // Anyone who can see bugs can report one; tasks / milestones need edit.
    if (!can(req, kind, kind === 'bug' ? 'view' : 'edit')) {
      throw new HttpError(403, kind === 'bug' ? 'You cannot report bugs on this project.' : 'You need edit access to Tasks & Plans.');
    }
    if (!title || !String(title).trim()) throw new HttpError(400, 'Title is required.');

    const mod = await loadModule(req.project, module);
    const planDoc = kind === 'bug' ? null : await loadPlan(req.project, plan, mod._id);
    const assigneeIds = validateAssignees(req.project, assignees);
    if (priority !== undefined && !PRIORITIES.includes(priority)) throw new HttpError(400, 'Invalid priority.');

    let start = parseDate(startDate, 'start date');
    let due = parseDate(deadline, 'deadline');
    if (kind === 'milestone') {
      if (!due) throw new HttpError(400, 'A milestone needs a date.');
      start = due;
    }
    if (start && due && start > due) throw new HttpError(400, 'Deadline must be after the start date.');

    const task = new Task({
      title: String(title).trim(),
      description: description || '',
      taskType: 'project',
      kind,
      project: req.project._id,
      module: mod._id,
      plan: planDoc ? planDoc._id : null,
      department: await pickDepartment(req.project, assigneeIds),
      assignedBy: req.user._id,
      createdBy: req.user._id,
      reporter: kind === 'bug' ? req.user._id : null,
      assignees: assigneeIds.map((user) => ({ user })),
      priority: priority || 'medium',
      startDate: start || new Date(),
      deadline: due || null,
      isPrivate: Boolean(isPrivate),
      estimatedHours: Number(estimatedHours) > 0 ? Number(estimatedHours) : 0,
    });

    if (kind === 'bug') {
      const { stage: st, stages } = await bugStage(req, stage);
      task.stage = st._id;
      applyStatus(task, statusForStage(st, stages));
      const last = await Task.findOne({ project: req.project._id, kind: 'bug', stage: st._id }).sort({ boardOrder: -1 }).select('boardOrder');
      task.boardOrder = (last?.boardOrder || 0) + 1024;
    } else if (status) {
      applyStatus(task, status);
    }

    await task.save();

    const who = req.user.name || 'Someone';
    const link = itemLink(req.project._id, task);
    if (kind === 'bug') {
      notifyPeople([req.project.manager, ...assigneeIds], req.user._id, {
        title: `Bug reported: ${task.title}`,
        message: `${who} reported a bug in ${req.project.name}${assigneeIds.length ? ' and assigned it to you' : ''}.`,
        link,
      });
    } else {
      notifyPeople(assigneeIds, req.user._id, {
        title: `New ${kindLabel(kind)}: ${task.title}`,
        message: `${who} assigned you a ${kindLabel(kind)} in ${req.project.name}.`,
        link,
      });
    }
    refreshProgress(req.project._id);
    return res.status(201).json({ success: true, message: 'Created.', item: await populated(task._id) });
  } catch (error) {
    return fail(res, 'Create Work Item', error);
  }
};

// PUT /work/items/:itemId
exports.updateItem = async (req, res) => {
  try {
    const task = await findItem(req);
    const scope = editScope(req, task);
    if (!scope) throw new HttpError(403, 'You cannot change this item.');
    const before = { status: task.status, assignees: new Set(assigneeIdsOf(task)) };

    const body = req.body || {};
    const statusOnly = ['status', 'stage', 'progress'];
    if (scope === 'status') {
      const extra = Object.keys(body).filter((k) => !statusOnly.includes(k) && body[k] !== undefined);
      if (extra.length) throw new HttpError(403, 'As an assignee you can only change the status / stage and progress.');
    }

    if (body.title !== undefined) {
      if (!String(body.title).trim()) throw new HttpError(400, 'Title is required.');
      task.title = String(body.title).trim();
    }
    if (body.description !== undefined) task.description = body.description || '';
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) throw new HttpError(400, 'Invalid priority.');
      task.priority = body.priority;
    }
    if (body.isPrivate !== undefined) task.isPrivate = Boolean(body.isPrivate);
    if (body.estimatedHours !== undefined) task.estimatedHours = Math.max(0, Number(body.estimatedHours) || 0);
    if (body.assignees !== undefined) {
      const ids = validateAssignees(req.project, body.assignees);
      task.assignees = ids.map((user) => ({ user }));
    }
    if (body.module !== undefined && idOf(body.module) !== idOf(task.module)) {
      const mod = await loadModule(req.project, body.module);
      task.module = mod._id;
      if (task.plan && body.plan === undefined) task.plan = null; // plan belonged to the old module
    }
    if (body.plan !== undefined && task.kind !== 'bug') {
      const planDoc = await loadPlan(req.project, body.plan, task.module);
      task.plan = planDoc ? planDoc._id : null;
    }

    const start = parseDate(body.startDate, 'start date');
    const due = parseDate(body.deadline, 'deadline');
    if (task.kind === 'milestone') {
      if (due === null) throw new HttpError(400, 'A milestone needs a date.');
      if (due) { task.deadline = due; task.startDate = due; }
    } else {
      if (start !== undefined) task.startDate = start || task.startDate;
      if (due !== undefined) task.deadline = due;
    }
    if (task.startDate && task.deadline && task.startDate > task.deadline) {
      throw new HttpError(400, 'Deadline must be after the start date.');
    }

    if (task.kind === 'bug') {
      if (body.stage !== undefined) {
        const { stage, stages } = await bugStage(req, body.stage);
        task.stage = stage._id;
        applyStatus(task, statusForStage(stage, stages));
      }
    } else if (body.status !== undefined) {
      applyStatus(task, body.status);
    }
    if (body.progress !== undefined) {
      const p = Number(body.progress);
      if (!Number.isFinite(p) || p < 0 || p > 100) throw new HttpError(400, 'Progress must be between 0 and 100.');
      task.progress = Math.round(p);
    }

    await task.save();
    afterChange(req, task, before);
    return res.json({ success: true, message: 'Saved.', item: await populated(task._id) });
  } catch (error) {
    return fail(res, 'Update Work Item', error);
  }
};

// PATCH /work/items/:itemId/move  { stage, order }  — kanban drag
exports.moveItem = async (req, res) => {
  try {
    const task = await findItem(req);
    if (task.kind !== 'bug') throw new HttpError(400, 'Only bugs live on the bug board.');
    if (!editScope(req, task)) throw new HttpError(403, 'You cannot move this bug.');
    const before = { status: task.status, assignees: new Set(assigneeIdsOf(task)) };
    const { stage, stages } = await bugStage(req, req.body.stage || task.stage);
    task.stage = stage._id;
    applyStatus(task, statusForStage(stage, stages));
    const order = Number(req.body.order);
    if (Number.isFinite(order)) task.boardOrder = order;
    await task.save();
    afterChange(req, task, before);
    return res.json({ success: true, item: await populated(task._id) });
  } catch (error) {
    return fail(res, 'Move Work Item', error);
  }
};

// DELETE /work/items/:itemId
exports.deleteItem = async (req, res) => {
  try {
    const task = await findItem(req);
    if (editScope(req, task) !== 'full') throw new HttpError(403, 'You cannot delete this item.');
    await Task.deleteOne({ _id: task._id });
    await WorkItemComment.deleteMany({ task: task._id });
    refreshProgress(req.project._id);
    return res.json({ success: true, message: 'Deleted.' });
  } catch (error) {
    return fail(res, 'Delete Work Item', error);
  }
};

/* ---------------------------------------------------------------- */
/* comments                                                          */
/* ---------------------------------------------------------------- */

const toComment = (c) => ({
  _id: c._id,
  body: c.body,
  author: c.author && c.author._id ? { _id: c.author._id, name: c.author.name } : c.author,
  createdAt: c.createdAt,
  editedAt: c.editedAt,
});

// GET /work/items/:itemId/comments
exports.listComments = async (req, res) => {
  try {
    const task = await findItem(req);
    const comments = await WorkItemComment.find({ task: task._id }).populate('author', 'name').sort({ createdAt: 1 }).limit(500);
    return res.json({ success: true, comments: comments.map(toComment) });
  } catch (error) {
    return fail(res, 'List Comments', error);
  }
};

// POST /work/items/:itemId/comments  { body }
exports.addComment = async (req, res) => {
  try {
    const task = await findItem(req); // anyone who can see the item may comment
    const body = String(req.body?.body || '').trim();
    if (!body) throw new HttpError(400, 'Write a comment first.');
    if (body.length > 4000) throw new HttpError(400, 'Comments can be at most 4000 characters.');
    const comment = await WorkItemComment.create({ task: task._id, project: req.project._id, author: req.user._id, body });
    await comment.populate('author', 'name');

    // Everyone involved: creator, reporter, assignees and earlier commenters.
    const earlier = await WorkItemComment.distinct('author', { task: task._id });
    notifyPeople([task.createdBy, task.reporter, ...assigneeIdsOf(task), ...earlier], req.user._id, {
      title: `New comment: ${task.title}`,
      message: `${req.user.name || 'Someone'}: ${body.length > 140 ? `${body.slice(0, 140)}…` : body}`,
      link: itemLink(req.project._id, task),
    });
    return res.status(201).json({ success: true, comment: toComment(comment) });
  } catch (error) {
    return fail(res, 'Add Comment', error);
  }
};

// DELETE /work/items/:itemId/comments/:commentId  (author, or full edit on the item)
exports.deleteComment = async (req, res) => {
  try {
    const task = await findItem(req);
    if (!isId(req.params.commentId)) throw new HttpError(400, 'Invalid comment id.');
    const comment = await WorkItemComment.findOne({ _id: req.params.commentId, task: task._id });
    if (!comment) throw new HttpError(404, 'Comment not found.');
    if (idOf(comment.author) !== idOf(req.user._id) && editScope(req, task) !== 'full') {
      throw new HttpError(403, 'You can only delete your own comments.');
    }
    await comment.deleteOne();
    return res.json({ success: true, message: 'Comment deleted.' });
  } catch (error) {
    return fail(res, 'Delete Comment', error);
  }
};

/* ---------------------------------------------------------------- */
/* attachments (Task.attachments, max 4, files under /uploads/tasks) */
/* ---------------------------------------------------------------- */

const MAX_ATTACHMENTS = 4;
const UPLOAD_ROOT = path.join(__dirname, '..');
const removeFile = (webPath) => {
  if (!String(webPath || '').startsWith('/uploads/tasks/')) return;
  fs.unlink(path.join(UPLOAD_ROOT, webPath), () => {});
};

// POST /work/items/:itemId/attachments  (multipart "attachments")
exports.addAttachments = async (req, res) => {
  const uploaded = (req.files || []).map((f) => `/uploads/tasks/${f.filename}`);
  try {
    const task = await findItem(req);
    if (!editScope(req, task)) throw new HttpError(403, 'You cannot add files to this item.');
    if (!uploaded.length) throw new HttpError(400, 'Choose at least one file.');
    const current = task.attachments || [];
    if (current.length + uploaded.length > MAX_ATTACHMENTS) {
      throw new HttpError(400, `An item can have at most ${MAX_ATTACHMENTS} files (it has ${current.length}).`);
    }
    task.attachments = [...current, ...uploaded];
    await task.save();
    return res.status(201).json({ success: true, attachments: task.attachments });
  } catch (error) {
    uploaded.forEach(removeFile); // don't keep files we refused
    return fail(res, 'Add Attachments', error);
  }
};

// DELETE /work/items/:itemId/attachments  { path }
exports.removeAttachment = async (req, res) => {
  try {
    const task = await findItem(req);
    if (!editScope(req, task)) throw new HttpError(403, 'You cannot remove files from this item.');
    const target = String(req.body?.path || req.query.path || '');
    if (!(task.attachments || []).includes(target)) throw new HttpError(404, 'File not found on this item.');
    task.attachments = task.attachments.filter((a) => a !== target);
    await task.save();
    removeFile(target);
    return res.json({ success: true, attachments: task.attachments });
  } catch (error) {
    return fail(res, 'Remove Attachment', error);
  }
};

/* ---------------------------------------------------------------- */
/* plans                                                             */
/* ---------------------------------------------------------------- */

const planProgress = async (projectId, planIds) => {
  if (!planIds.length) return new Map();
  const rows = await Task.aggregate([
    { $match: { project: new mongoose.Types.ObjectId(String(projectId)), plan: { $in: planIds.map((id) => new mongoose.Types.ObjectId(String(id))) }, isActive: { $ne: false }, kind: { $ne: 'bug' } } },
    {
      $group: {
        _id: '$plan',
        total: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, 1] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        progressSum: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, '$progress'] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

const toPlan = (p, stats) => {
  const s = stats || { total: 0, completed: 0, progressSum: 0 };
  return {
    _id: p._id,
    module: p.module,
    name: p.name,
    description: p.description,
    startDate: p.startDate,
    endDate: p.endDate,
    taskCount: s.total,
    completedCount: s.completed,
    // Share of the plan's tasks that are done (cancelled ones don't count).
    progress: s.total ? Math.round((s.completed / s.total) * 100) : 0,
    createdAt: p.createdAt,
  };
};

const requireTasks = (req, level) => {
  if (!hasLevel(req.projectAccess, 'tasks', level)) {
    throw new HttpError(403, level === 'edit' ? 'You need edit access to Tasks & Plans.' : 'You do not have access to Tasks & Plans.');
  }
};

/** Put exactly `taskIds` into the plan (others leave it). Tasks must be in the plan's module. */
const setPlanTasks = async (req, plan, taskIds) => {
  if (taskIds === undefined) return;
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).filter(isId).map(String))];
  const count = await Task.countDocuments({ _id: { $in: ids }, project: req.project._id, module: plan.module, kind: { $ne: 'bug' } });
  if (count !== ids.length) throw new HttpError(400, 'Only tasks and milestones of the same module can be added to a plan.');
  await Task.updateMany({ plan: plan._id, _id: { $nin: ids } }, { $set: { plan: null } });
  if (ids.length) await Task.updateMany({ _id: { $in: ids } }, { $set: { plan: plan._id } });
};

// GET /work/plans?module=
exports.listPlans = async (req, res) => {
  try {
    requireTasks(req, 'view');
    const filter = { project: req.project._id };
    if (req.query.module && isId(req.query.module)) filter.module = req.query.module;
    const plans = await Plan.find(filter).sort({ startDate: 1, createdAt: 1 });
    const stats = await planProgress(req.project._id, plans.map((p) => p._id));
    return res.json({ success: true, plans: plans.map((p) => toPlan(p, stats.get(String(p._id)))) });
  } catch (error) {
    return fail(res, 'List Plans', error);
  }
};

// POST /work/plans  { module, name, description, startDate, endDate, taskIds }
exports.createPlan = async (req, res) => {
  try {
    requireTasks(req, 'edit');
    const { module, name, description, startDate, endDate, taskIds } = req.body;
    if (!name || !String(name).trim()) throw new HttpError(400, 'Plan name is required.');
    const mod = await loadModule(req.project, module);
    const plan = await Plan.create({
      project: req.project._id,
      module: mod._id,
      name: String(name).trim(),
      description: description || '',
      startDate: parseDate(startDate, 'start date') || null,
      endDate: parseDate(endDate, 'end date') || null,
      createdBy: req.user._id,
    });
    await setPlanTasks(req, plan, taskIds);
    const stats = await planProgress(req.project._id, [plan._id]);
    return res.status(201).json({ success: true, message: 'Plan created.', plan: toPlan(plan, stats.get(String(plan._id))) });
  } catch (error) {
    return fail(res, 'Create Plan', error);
  }
};

// PUT /work/plans/:planId
exports.updatePlan = async (req, res) => {
  try {
    requireTasks(req, 'edit');
    const plan = await loadPlan(req.project, req.params.planId);
    if (!plan) throw new HttpError(404, 'Plan not found.');
    const { name, description, startDate, endDate, taskIds } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) throw new HttpError(400, 'Plan name is required.');
      plan.name = String(name).trim();
    }
    if (description !== undefined) plan.description = description || '';
    if (startDate !== undefined) plan.startDate = parseDate(startDate, 'start date');
    if (endDate !== undefined) plan.endDate = parseDate(endDate, 'end date');
    await plan.save();
    await setPlanTasks(req, plan, taskIds);
    const stats = await planProgress(req.project._id, [plan._id]);
    return res.json({ success: true, message: 'Plan saved.', plan: toPlan(plan, stats.get(String(plan._id))) });
  } catch (error) {
    return fail(res, 'Update Plan', error);
  }
};

// DELETE /work/plans/:planId  (its tasks stay, just leave the plan)
exports.deletePlan = async (req, res) => {
  try {
    requireTasks(req, 'edit');
    const plan = await loadPlan(req.project, req.params.planId);
    if (!plan) throw new HttpError(404, 'Plan not found.');
    await Task.updateMany({ plan: plan._id }, { $set: { plan: null } });
    await plan.deleteOne();
    return res.json({ success: true, message: 'Plan deleted. Its tasks were kept.' });
  } catch (error) {
    return fail(res, 'Delete Plan', error);
  }
};

/* ---------------------------------------------------------------- */
/* timeline (Gantt)                                                  */
/* ---------------------------------------------------------------- */

// GET /work/timeline — modules, plans, tasks and milestones (never bugs).
exports.getTimeline = async (req, res) => {
  try {
    if (!hasLevel(req.projectAccess, 'timeline', 'view')) {
      throw new HttpError(403, 'Your role does not have access to this project\'s timeline.');
    }
    const [modules, plans, tasks] = await Promise.all([
      ProjectModule.find({ project: req.project._id }).select('name color status').sort({ createdAt: 1 }).lean(),
      Plan.find({ project: req.project._id }).sort({ startDate: 1, createdAt: 1 }),
      Task.find({
        project: req.project._id,
        module: { $ne: null },
        isActive: { $ne: false },
        kind: { $in: ['task', 'milestone'] },
        ...privateClauseForProject(req.user, req.projectPrivileged),
      }).populate(ITEM_POPULATE).sort({ startDate: 1 }).limit(2000),
    ]);
    const stats = await planProgress(req.project._id, plans.map((p) => p._id));
    return res.json({
      success: true,
      access: req.projectAccess,
      project: { _id: req.project._id, name: req.project.name },
      modules: modules.map((m) => ({ _id: m._id, name: m.name, color: m.color, status: m.status })),
      plans: plans.map((p) => toPlan(p, stats.get(String(p._id)))),
      items: tasks.map(toItem),
    });
  } catch (error) {
    return fail(res, 'Get Timeline', error);
  }
};

/* ---------------------------------------------------------------- */
/* bug stages                                                        */
/* ---------------------------------------------------------------- */

const requireBugs = (req, level) => {
  if (!hasLevel(req.projectAccess, 'bugs', level)) {
    throw new HttpError(403, level === 'edit' ? 'You need edit access to the Bug Sheet.' : 'You do not have access to the Bug Sheet.');
  }
};

const toStage = (s, counts) => ({
  _id: s._id, name: s.name, color: s.color, order: s.order, isCompleted: Boolean(s.isCompleted), bugCount: counts?.get(String(s._id)) || 0,
});

const listStagesResponse = async (req) => {
  const stages = await ensureBugStages(req.project._id, req.user._id);
  const rows = await Task.aggregate([
    { $match: { project: new mongoose.Types.ObjectId(String(req.project._id)), kind: 'bug', isActive: { $ne: false } } },
    { $group: { _id: '$stage', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((r) => [String(r._id), r.count]));
  return { success: true, stages: stages.map((s) => toStage(s, counts)) };
};

// GET /work/bug-stages
exports.listBugStages = async (req, res) => {
  try {
    requireBugs(req, 'view');
    return res.json(await listStagesResponse(req));
  } catch (error) {
    return fail(res, 'List Bug Stages', error);
  }
};

const assertUniqueStageName = async (req, name, exceptId) => {
  const rx = new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const clash = await WorkflowStage.exists({ project: req.project._id, scope: 'bug', isActive: true, name: rx, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (clash) throw new HttpError(400, 'A stage with this name already exists.');
};

const validColor = (c) => /^#[0-9a-fA-F]{6}$/.test(String(c || ''));

// POST /work/bug-stages  { name, color, isCompleted }
exports.createBugStage = async (req, res) => {
  try {
    requireBugs(req, 'edit');
    const { name, color, isCompleted } = req.body;
    if (!name || !String(name).trim()) throw new HttpError(400, 'Stage name is required.');
    const stages = await ensureBugStages(req.project._id, req.user._id);
    await assertUniqueStageName(req, name);
    await WorkflowStage.create({
      project: req.project._id,
      scope: 'bug',
      name: String(name).trim(),
      color: validColor(color) ? color : '#6366F1',
      isCompleted: Boolean(isCompleted),
      order: (stages[stages.length - 1]?.order ?? -1) + 1,
      createdBy: req.user._id,
    });
    await resyncBugStatuses(req.project._id);
    return res.status(201).json(await listStagesResponse(req));
  } catch (error) {
    return fail(res, 'Create Bug Stage', error);
  }
};

const loadStage = async (req) => {
  if (!isId(req.params.stageId)) throw new HttpError(400, 'Invalid stage id.');
  const stage = await WorkflowStage.findOne({ _id: req.params.stageId, project: req.project._id, scope: 'bug', isActive: true });
  if (!stage) throw new HttpError(404, 'Stage not found.');
  return stage;
};

// PUT /work/bug-stages/reorder  { ids: [] }
exports.reorderBugStages = async (req, res) => {
  try {
    requireBugs(req, 'edit');
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(String);
    const stages = await ensureBugStages(req.project._id, req.user._id);
    const current = stages.map(idOf);
    if (ids.length !== current.length || !current.every((id) => ids.includes(id))) {
      throw new HttpError(400, 'Send every stage id exactly once.');
    }
    await WorkflowStage.bulkWrite(ids.map((id, order) => ({ updateOne: { filter: { _id: id }, update: { $set: { order } } } })));
    await resyncBugStatuses(req.project._id);
    return res.json(await listStagesResponse(req));
  } catch (error) {
    return fail(res, 'Reorder Bug Stages', error);
  }
};

// PUT /work/bug-stages/:stageId  { name, color, isCompleted }
exports.updateBugStage = async (req, res) => {
  try {
    requireBugs(req, 'edit');
    const stage = await loadStage(req);
    const { name, color, isCompleted } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) throw new HttpError(400, 'Stage name is required.');
      await assertUniqueStageName(req, name, stage._id);
      stage.name = String(name).trim();
    }
    if (color !== undefined && validColor(color)) stage.color = color;
    if (isCompleted !== undefined) stage.isCompleted = Boolean(isCompleted);
    stage.updatedBy = req.user._id;
    await stage.save();
    await resyncBugStatuses(req.project._id);
    return res.json(await listStagesResponse(req));
  } catch (error) {
    return fail(res, 'Update Bug Stage', error);
  }
};

// DELETE /work/bug-stages/:stageId?moveTo=<stageId>
exports.deleteBugStage = async (req, res) => {
  try {
    requireBugs(req, 'edit');
    const stage = await loadStage(req);
    const stages = await ensureBugStages(req.project._id, req.user._id);
    if (stages.length <= 1) throw new HttpError(400, 'The bug pipeline needs at least one stage.');
    const bugCount = await Task.countDocuments({ project: req.project._id, kind: 'bug', stage: stage._id });
    const moveTo = req.query.moveTo || req.body?.moveTo;
    if (bugCount) {
      const target = stages.find((s) => idOf(s) === String(moveTo) && idOf(s) !== idOf(stage));
      if (!target) {
        throw new HttpError(409, `${bugCount} bug(s) are in this stage. Choose a stage to move them to.`, { bugCount });
      }
      await Task.updateMany({ project: req.project._id, kind: 'bug', stage: stage._id }, { $set: { stage: target._id } });
    }
    await stage.deleteOne();
    await resyncBugStatuses(req.project._id);
    return res.json(await listStagesResponse(req));
  } catch (error) {
    return fail(res, 'Delete Bug Stage', error);
  }
};
