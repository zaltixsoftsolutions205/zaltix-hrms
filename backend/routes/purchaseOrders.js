const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/purchaseOrderController');

router.use(protect);
router.use(roleCheck('sales', 'hr', 'admin'));

/**
 * @swagger
 * /api/purchase-orders:
 *   get:
 *     summary: Get purchase orders
 *     tags:
 *       - Purchase Orders
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/',           ctrl.getPurchaseOrders);
/**
 * @swagger
 * /api/purchase-orders/{id}:
 *   get:
 *     summary: Get purchase order
 *     tags:
 *       - Purchase Orders
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
router.get('/:id',        ctrl.getPurchaseOrder);
/**
 * @swagger
 * /api/purchase-orders:
 *   post:
 *     summary: Create purchase order
 *     tags:
 *       - Purchase Orders
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
router.post('/',          ctrl.createPurchaseOrder);
/**
 * @swagger
 * /api/purchase-orders/{id}/status:
 *   put:
 *     summary: Update status
 *     tags:
 *       - Purchase Orders
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
router.put('/:id/status', ctrl.updateStatus);
/**
 * @swagger
 * /api/purchase-orders/{id}:
 *   delete:
 *     summary: Delete purchase order
 *     tags:
 *       - Purchase Orders
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
router.delete('/:id',     ctrl.deletePurchaseOrder);

module.exports = router;
