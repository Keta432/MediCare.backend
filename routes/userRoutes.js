const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  verifyToken,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  getAdminActivities,
  getGrowthMetrics,
  getAdminNotifications,
  checkOnboardingEligibility,
  setOnboardingPassword
} = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);  // for /api/users/register
router.post('/login', loginUser);        // for /api/users/login
router.post('/check-onboarding', checkOnboardingEligibility);
router.post('/onboard-setup', setOnboardingPassword);

// Protected routes
router.get('/verify', protect, verifyToken);  // for /api/users/verify
router.get('/profile', protect, getUserProfile);  // Get user's own profile
router.put('/update-profile', protect, updateUserProfile);  // Update user's own profile
router.put('/change-password', protect, changePassword);  // Change user's password

// Admin dashboard routes
router.get('/activities', protect, adminOnly, getAdminActivities);  // Get recent activities
router.get('/growth', protect, adminOnly, getGrowthMetrics);  // Get growth metrics
router.get('/notifications', protect, adminOnly, getAdminNotifications);  // Get notifications

// Admin routes
router.get('/', protect, adminOnly, getAllUsers);           // Get all users
router.get('/:id', protect, adminOnly, getUserById);       // Get user by ID
router.put('/:id', protect, adminOnly, updateUser);        // Update user
router.delete('/:id', protect, adminOnly, deleteUser);     // Delete user

module.exports = router;