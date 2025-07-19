const express = require('express');
const router = express.Router();
const { protect, staffOnly } = require('../middleware/authMiddleware');
const {
  getTasks,
  getAppointments,
  getNotifications,
  getInventory,
  updateTaskStatus,
  markNotificationRead,
  updateInventoryItem,
  getDashboardStats,
  getDashboardActivities,
  getStaffHospital,
  getStaffProfile,
  updateStaffProfile,
  getStaffStats,
  getStaffNotifications,
  markNotificationAsRead,
  getStaffAnalytics,
  getPatientDemographics,
  getInventoryAnalytics
} = require('../controllers/staffController');

// Protect all routes and ensure staff only access
router.use(protect, staffOnly);

// Dashboard routes
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/activities', getDashboardActivities);

// Task routes
router.get('/tasks', getTasks);
router.patch('/tasks/:taskId/status', updateTaskStatus);

// Appointment routes
router.get('/appointments', getAppointments);

// Notification routes
router.get('/notifications', getNotifications);
router.patch('/notifications/:notificationId/read', markNotificationRead);

// Inventory routes
router.get('/inventory', getInventory);
router.patch('/inventory/:itemId', updateInventoryItem);

// Hospital routes
router.get('/hospital', getStaffHospital);

// Profile routes
router.get('/profile', getStaffProfile);
router.put('/profile', updateStaffProfile);

// Stats routes
router.get('/stats', getStaffStats);

// Staff-specific notifications routes
router.get('/staff-notifications', getStaffNotifications);
router.put('/staff-notifications/:id/read', markNotificationAsRead);

// Analytics routes
router.get('/analytics/success-rates', getStaffAnalytics);
router.get('/analytics/patient-demographics', getPatientDemographics);
router.get('/analytics/inventory', getInventoryAnalytics);

module.exports = router;