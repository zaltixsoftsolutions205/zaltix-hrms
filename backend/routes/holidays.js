const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/holidayController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

const holidaysEdit = moduleAccess('holidays', 'edit');

router.use(protect);

router.get('/', ctrl.getHolidays);                        // all roles — ?year=2026
router.get('/upcoming', ctrl.getUpcoming);                // all roles
router.post('/', holidaysEdit, ctrl.createHoliday);
router.delete('/:id', holidaysEdit, ctrl.deleteHoliday);

module.exports = router;
