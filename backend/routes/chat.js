const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getUsers,
  getGroupMessages,
  getDirectMessages,
  getUnreadCounts,
} = require('../controllers/chatController');

router.use(protect);

router.get('/users', getUsers);
router.get('/group/:group', getGroupMessages);
router.get('/direct/:userId', getDirectMessages);
router.get('/unread', getUnreadCounts);

module.exports = router;
