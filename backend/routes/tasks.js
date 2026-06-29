const express = require('express');
const router = express.Router();
const { createTask, getMyTasks, updateTaskStatus, getAllTasks, getKpiOverview, updateTask, deleteTask, sendTaskReminder, getActiveSelfTask } = require('../controllers/taskController');
const { protect } = require('../middleware/auth');
const { roleCheck, moduleAccess } = require('../middleware/roleCheck');

const hrTasksView = moduleAccess('hr_tasks', 'view');
const hrTasksEdit = moduleAccess('hr_tasks', 'edit');

router.use(protect);

router.post('/', hrTasksEdit, createTask);
router.get('/my', getMyTasks);
router.get('/active-self', roleCheck('admin'), getActiveSelfTask);
router.get('/kpi', hrTasksView, getKpiOverview);
router.get('/', hrTasksView, getAllTasks);
router.put('/:id/status', updateTaskStatus);
router.put('/:id', hrTasksEdit, updateTask);
router.post('/:id/reminder', hrTasksEdit, sendTaskReminder);

router.delete('/:id', deleteTask);

module.exports = router;
