const express = require('express');
const router = express.Router();

const {
  createTask,
  getTasks,
  importTasks,
  getTask,
  getMyTasks,
  getProjectTasks,
  getTasksByDepartment,
  getCompletedTasks,
  getOverdueTasks,
  getTaskStatistics,
  getProjectKPI,
  updateTask,
  updateTaskStatus,
  assignTask,
  archiveTask,
  restoreTask,
  duplicateTask,
  bulkDeleteTasks,
  bulkAssignTasks,
  bulkUpdateStatus,
  bulkUpdatePriority,
  sendTaskReminder,
  deleteTask,
} = require('../controllers/taskController');
const {
  uploadTaskExcel,
  importTasksFromExcel,
} = require('../middleware/taskExcelImport');

const { protect } = require('../middleware/auth');
const { roleCheck, moduleAccess } = require('../middleware/roleCheck');

const hrTasksView = moduleAccess('hr_tasks', 'view');
const hrTasksEdit = moduleAccess('hr_tasks', 'edit');

router.use(protect);

//
// ==========================
// Dashboard / KPI
// ==========================
//

router.get('/kpi', hrTasksView, getProjectKPI);
router.get('/statistics', hrTasksView, getTaskStatistics);

//
// ==========================
// My Tasks
// ==========================
//

router.get('/my', getMyTasks);

//
// ==========================
// Task Filters
// ==========================
//

router.get('/completed', hrTasksView, getCompletedTasks);
router.get('/overdue', hrTasksView, getOverdueTasks);
router.get('/department/:departmentId', hrTasksView, getTasksByDepartment);
router.get('/project/:projectId', hrTasksView, getProjectTasks);

//
// ==========================
// Bulk Operations
// ==========================
//

router.post('/bulk/delete', hrTasksEdit, bulkDeleteTasks);
router.post('/bulk/assign', hrTasksEdit, bulkAssignTasks);
router.post('/bulk/status', hrTasksEdit, bulkUpdateStatus);
router.post('/bulk/priority', hrTasksEdit, bulkUpdatePriority);

//
// ==========================
// CRUD
// ==========================
//

router.get('/', hrTasksView, getTasks);
router.get('/:id', hrTasksView, getTask);

router.post('/import',hrTasksEdit, uploadTaskExcel,importTasksFromExcel, importTasks);
router.post('/', hrTasksEdit, createTask);
router.put('/:id', hrTasksEdit, updateTask);
router.delete('/:id', hrTasksEdit, deleteTask);

//
// ==========================
// Task Actions
// ==========================
//

router.put('/:id/status', updateTaskStatus);
router.put('/:id/assign', hrTasksEdit, assignTask);

router.put('/:id/archive', hrTasksEdit, archiveTask);
router.put('/:id/restore', hrTasksEdit, restoreTask);

router.post('/:id/duplicate', hrTasksEdit, duplicateTask);
router.post('/:id/reminder', hrTasksEdit, sendTaskReminder);

module.exports = router;