const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const uploadProfilePhoto_middleware = require('../middleware/uploadProfilePhoto');
const {
  getMyProfile,
  getProfileCompletion,
  uploadProfilePhoto,
  deleteProfilePhoto,
  updateOwnProfile,
} = require('../controllers/employeeController');
const { getMe, changePassword } = require('../controllers/authController');

// All routes require authentication
router.use(protect);

// Current user info (auth context)
/**
 * @swagger
 * /api/user/me:
 *   get:
 *     summary: Get me
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/me', getMe);

// Profile
/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get my profile
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/profile', getMyProfile);
/**
 * @swagger
 * /api/user/profile:
 *   put:
 *     summary: Update own profile
 *     tags:
 *       - User
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
router.put('/profile', updateOwnProfile);
/**
 * @swagger
 * /api/user/profile-completion:
 *   get:
 *     summary: Get profile completion
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/profile-completion', getProfileCompletion);

// Profile photo
/**
 * @swagger
 * /api/user/profile-photo:
 *   post:
 *     summary: Upload profile photo
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.post('/profile-photo', (req, res, next) => {
  uploadProfilePhoto_middleware.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, uploadProfilePhoto );
/**
 * @swagger
 * /api/user/profile-photo:
 *   delete:
 *     summary: Delete profile photo
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.delete('/profile-photo', deleteProfilePhoto);

// Password
/**
 * @swagger
 * /api/user/change-password:
 *   put:
 *     summary: Change password
 *     tags:
 *       - User
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
router.put('/change-password', changePassword);

module.exports = router;
