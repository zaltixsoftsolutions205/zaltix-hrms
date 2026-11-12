const express = require("express");

const {
  getWorkspaceOverview,
} = require("../controllers/workspaceController");
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/workspace/overview:
 *   get:
 *     summary: Get workspace overview
 *     tags:
 *       - Workspace
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get(
  "/overview",protect,
  getWorkspaceOverview
);

module.exports = router;