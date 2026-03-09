const Task = require('../models/Task');
const notificationService = require('../services/notificationService');
const User = require('../models/User');
const moment = require('moment');

// HR / Admin: Create task
exports.createTask = async (req, res) => {
  const { title, description, assignedTo, priority, deadline, duration } = req.body;
  try {
    const isSelf = assignedTo && assignedTo.toString() === req.user._id.toString();

    // If self-task with duration: check for existing active timed task
    if (isSelf && duration) {
      const now = new Date();
      const activeTimedTask = await Task.findOne({
        assignedTo: req.user._id,
        isSelfTask: true,
        status: 'in-progress',
        startedAt: { $ne: null },
        $expr: { $gt: [{ $add: ['$startedAt', { $multiply: ['$duration', 60000] }] }, now] },
      });
      if (activeTimedTask) {
        const endsAt = new Date(activeTimedTask.startedAt.getTime() + activeTimedTask.duration * 60000);
        const minsLeft = Math.ceil((endsAt - now) / 60000);
        return res.status(409).json({
          message: `You have an active task "${activeTimedTask.title}" with ${minsLeft} min${minsLeft !== 1 ? 's' : ''} remaining. Complete or stop it before starting a new timed task.`,
          activeTask: { _id: activeTimedTask._id, title: activeTimedTask.title, minsLeft },
        });
      }
    }

    const task = await Task.create({
      title, description, assignedTo, assignedBy: req.user._id, priority,
      deadline: new Date(deadline),
      duration: duration || null,
      isSelfTask: isSelf,
      status: isSelf && duration ? 'in-progress' : 'not-started',
      startedAt: isSelf && duration ? new Date() : null,
    });

    // Notify assignee (or admin themselves for self-tasks)
    const notifLink = isSelf ? '/admin/tasks' : '/tasks';
    const notifMsg = isSelf
      ? `New task started: "${title}"${duration ? ` — ${duration < 60 ? duration + ' min' : duration < 1440 ? (duration / 60) + ' hr' : Math.round(duration / 1440) + ' day'} timer started` : ''}`
      : `You have been assigned: "${title}" (Due: ${moment(deadline).format('DD MMM YYYY')})`;

    await notificationService.notify(assignedTo, {
      title: isSelf ? 'Task Timer Started' : 'New Task Assigned',
      message: notifMsg,
      type: 'task',
      link: notifLink,
    });

    const populated = await Task.findById(task._id).populate('assignedTo', 'name employeeId').populate('assignedBy', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: Get current active self-task (for focus-lock check)
exports.getActiveSelfTask = async (req, res) => {
  try {
    const now = new Date();
    const task = await Task.findOne({
      assignedTo: req.user._id,
      isSelfTask: true,
      status: 'in-progress',
      startedAt: { $ne: null },
      $expr: { $gt: [{ $add: ['$startedAt', { $multiply: ['$duration', 60000] }] }, now] },
    }).lean();
    if (!task) return res.json({ active: null });
    const endsAt = new Date(task.startedAt.getTime() + task.duration * 60000);
    res.json({ active: { ...task, endsAt, minsLeft: Math.ceil((endsAt - now) / 60000) } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee: Get own tasks
exports.getMyTasks = async (req, res) => {
  const { status } = req.query;
  try {
    let filter = { assignedTo: req.user._id };
    if (status) filter.status = status;
    const tasks = await Task.find(filter).populate('assignedBy', 'name').sort({ createdAt: -1 });

    const kpi = {
      total: await Task.countDocuments({ assignedTo: req.user._id }),
      completed: await Task.countDocuments({ assignedTo: req.user._id, status: 'completed' }),
      inProgress: await Task.countDocuments({ assignedTo: req.user._id, status: 'in-progress' }),
      notStarted: await Task.countDocuments({ assignedTo: req.user._id, status: 'not-started' }),
    };
    kpi.completionRate = kpi.total > 0 ? Math.round((kpi.completed / kpi.total) * 100) : 0;

    res.json({ tasks, kpi });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee: Update task status
exports.updateTaskStatus = async (req, res) => {
  const { status, remarks } = req.body;
  try {
    const task = await Task.findById(req.params.id).populate('assignedTo', 'name').populate('assignedBy', 'name _id role');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.assignedTo._id.toString() !== req.user._id.toString() && !['hr', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const prevStatus = task.status;
    task.status = status;
    if (remarks) task.remarks = remarks;
    if (status === 'completed') task.completedDate = new Date();
    if (status === 'in-progress' && !task.startedAt) task.startedAt = new Date();
    await task.save();

    // Notify the assigner (admin/HR) when an employee updates the task status
    const isEmployeeUpdate = !['hr', 'admin'].includes(req.user.role);
    if (isEmployeeUpdate && task.assignedBy && prevStatus !== status) {
      const statusLabel = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'completed': 'Completed' }[status] || status;
      const assignerRole = task.assignedBy.role;
      await notificationService.notify(task.assignedBy._id, {
        title: 'Task Status Updated',
        message: `${task.assignedTo.name} updated "${task.title}" → ${statusLabel}${remarks ? `: "${remarks}"` : ''}`,
        type: 'task',
        link: assignerRole === 'admin' ? '/admin/tasks' : '/hr/tasks',
      });
    }

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Get all tasks with employee filter (excludes admin/hr self-tasks)
exports.getAllTasks = async (req, res) => {
  const { employeeId, status } = req.query;
  try {
    let filter = { isSelfTask: { $ne: true } };
    if (employeeId) {
      filter.assignedTo = employeeId;
    } else {
      // Exclude tasks assigned to admin/hr users (their personal tasks)
      const managerIds = await User.find({ role: { $in: ['admin', 'hr'] } }, '_id').lean();
      filter.assignedTo = { $nin: managerIds.map(u => u._id) };
    }
    if (status) filter.status = status;
    const tasks = await Task.find(filter).populate('assignedTo', 'name employeeId department').populate('assignedBy', 'name').sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Get KPI overview per employee (excludes admin self-tasks)
exports.getKpiOverview = async (req, res) => {
  try {
    const employees = await User.find({ role: { $in: ['employee', 'sales'] }, isActive: true }).select('_id name employeeId department');
    const kpiData = await Promise.all(
      employees.map(async (emp) => {
        const base = { assignedTo: emp._id, isSelfTask: { $ne: true } };
        const total = await Task.countDocuments(base);
        const completed = await Task.countDocuments({ ...base, status: 'completed' });
        const inProgress = await Task.countDocuments({ ...base, status: 'in-progress' });
        const overdue = await Task.countDocuments({ ...base, deadline: { $lt: new Date() }, status: { $ne: 'completed' } });
        return { employee: emp, total, completed, inProgress, overdue, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0 };
      })
    );
    res.json(kpiData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin/HR or task owner: Delete a task
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const isOwner = task.assignedTo.toString() === req.user._id.toString();
    const isManager = ['hr', 'admin'].includes(req.user.role);
    if (!isOwner && !isManager) return res.status(403).json({ message: 'Access denied' });
    await task.deleteOne();
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Send reminder notification for a task
exports.sendTaskReminder = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate('assignedTo', 'name');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.status === 'completed') return res.status(400).json({ message: 'Task is already completed' });

    await notificationService.notify(task.assignedTo._id, {
      title: 'Task Reminder',
      message: `Reminder: "${task.title}" is due on ${moment(task.deadline).format('DD MMM YYYY')}. Please update your progress.`,
      type: 'task',
      link: '/tasks',
    });

    res.json({ message: `Reminder sent to ${task.assignedTo.name}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR: Update task (edit details)
exports.updateTask = async (req, res) => {
  const { title, description, priority, deadline, status } = req.body;
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (priority) task.priority = priority;
    if (deadline) task.deadline = new Date(deadline);
    if (status) task.status = status;
    await task.save();
    const populated = await Task.findById(task._id).populate('assignedTo', 'name employeeId').populate('assignedBy', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
