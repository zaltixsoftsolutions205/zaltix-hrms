const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  updateProject,
  deactivateProject,
  assignEmployees,
  getAssignableEmployees,
} = require('../controllers/timesheetProjectController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Everyone needs the list for the task-entry project dropdown.
router.get('/', getProjects);
router.get('/assignable-employees', getAssignableEmployees);

// Create/update is open to any authenticated user at the route level; the
// controller itself enforces admin/hr/dept-head since "is a dept head" isn't a
// static role string a route-level roleCheck can express.
router.post('/', createProject);
router.put('/:id', updateProject);
router.put('/:id/deactivate', deactivateProject);
router.put('/:id/assign', assignEmployees);

module.exports = router;
