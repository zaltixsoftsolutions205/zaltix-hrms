const express = require('express');
const router = express.Router();
const { createTask, getMyTasks, updateTaskStatus, getAllTasks, getKpiOverview, updateTask, deleteTask, sendTaskReminder, getActiveSelfTask } = require('../controllers/taskController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);

router.post('/', roleCheck('hr', 'admin'), createTask);
router.get('/my', getMyTasks);
router.get('/active-self', roleCheck('admin'), getActiveSelfTask);
router.get('/kpi', roleCheck('hr', 'admin'), getKpiOverview);
router.get('/', roleCheck('hr', 'admin'), getAllTasks);
router.put('/:id/status', updateTaskStatus);
router.put('/:id', roleCheck('hr', 'admin'), updateTask);
router.post('/:id/reminder', roleCheck('hr', 'admin'), sendTaskReminder);

router.delete('/:id', deleteTask);

module.exports = router;
