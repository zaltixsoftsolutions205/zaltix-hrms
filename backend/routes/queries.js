const express     = require('express');
const router      = express.Router();
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const ctrl        = require('../controllers/queryController');

// Gated by the per-employee "query_management" module (admin bypasses,
// sales gets it via role default). Writes require edit access.
const canView = moduleAccess('query_management', 'view');
const canEdit = moduleAccess('query_management', 'edit');

/**
 * @swagger
 * /api/queries:
 *   get:
 *     summary: Get queries
 *     tags:
 *       - Queries
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/',       protect, canView, ctrl.getQueries);
/**
 * @swagger
 * /api/queries:
 *   post:
 *     summary: Create query
 *     tags:
 *       - Queries
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
router.post('/',      protect, canEdit, ctrl.createQuery);
/**
 * @swagger
 * /api/queries/{id}:
 *   put:
 *     summary: Update query
 *     tags:
 *       - Queries
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *       404:
 *         description: Not found
 */
router.put('/:id',    protect, canEdit, ctrl.updateQuery);
/**
 * @swagger
 * /api/queries/{id}:
 *   delete:
 *     summary: Delete query
 *     tags:
 *       - Queries
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
router.delete('/:id', protect, canEdit, ctrl.deleteQuery);

module.exports = router;
