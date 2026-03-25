const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/holidayController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);

router.get('/', ctrl.getHolidays);                        // all roles — ?year=2026
router.get('/upcoming', ctrl.getUpcoming);                // all roles
router.post('/', roleCheck('hr'), ctrl.createHoliday);
router.delete('/:id', roleCheck('hr'), ctrl.deleteHoliday);

module.exports = router;
