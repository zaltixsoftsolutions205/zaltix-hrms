const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/quotationController');

router.use(protect);
router.use(roleCheck('sales', 'hr', 'admin'));

/**
 * @swagger
 * /api/quotations:
 *   get:
 *     summary: Get quotations
 *     tags:
 *       - Quotations
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/',          ctrl.getQuotations);
/**
 * @swagger
 * /api/quotations/{id}:
 *   get:
 *     summary: Get quotation
 *     tags:
 *       - Quotations
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
router.get('/:id',       ctrl.getQuotation);
/**
 * @swagger
 * /api/quotations:
 *   post:
 *     summary: Create quotation
 *     tags:
 *       - Quotations
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
router.post('/',         ctrl.createQuotation);
/**
 * @swagger
 * /api/quotations/{id}/status:
 *   put:
 *     summary: Update status
 *     tags:
 *       - Quotations
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
 * /api/quotations/{id}/convert-to-po:
 *   post:
 *     summary: Convert to po
 *     tags:
 *       - Quotations
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
router.post('/:id/convert-to-po', ctrl.convertToPO);
/**
 * @swagger
 * /api/quotations/{id}/pdf:
 *   get:
 *     summary: Download pdf
 *     tags:
 *       - Quotations
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
router.get('/:id/pdf',   ctrl.downloadPDF);
/**
 * @swagger
 * /api/quotations/{id}:
 *   delete:
 *     summary: Delete quotation
 *     tags:
 *       - Quotations
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
router.delete('/:id',    ctrl.deleteQuotation);

module.exports = router;
