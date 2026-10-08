const express = require("express");

const {
  getWorkspaceOverview,
} = require("../controllers/workspaceController");
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get(
  "/overview",protect,
  getWorkspaceOverview
);

module.exports = router;