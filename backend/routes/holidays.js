const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/holidayController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

const holidaysEdit = moduleAccess('holidays', 'edit');

router.use(protect);

/**
 * @swagger
 * /api/holidays:
 *   get:
 *     summary: Get holidays
 *     tags:
 *       - Holidays
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', ctrl.getHolidays);                        // all roles — ?year=2026
/**
 * @swagger
 * /api/holidays/upcoming:
 *   get:
 *     summary: Get upcoming
 *     tags:
 *       - Holidays
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/upcoming', ctrl.getUpcoming);                // all roles
/**
 * @swagger
 * /api/holidays:
 *   post:
 *     summary: Create holiday
 *     tags:
 *       - Holidays
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.post('/', holidaysEdit, ctrl.createHoliday);
/**
 * @swagger
 * /api/holidays/{id}:
 *   delete:
 *     summary: Delete holiday
 *     tags:
 *       - Holidays
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Not found
 */
router.delete('/:id', holidaysEdit, ctrl.deleteHoliday);

module.exports = router;
