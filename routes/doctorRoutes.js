const express = require('express');
const router = express.Router();
const {
  getDoctorStats,
  getTodayAppointments,
  getDoctorNotifications,
  markNotificationAsRead,
  getDoctorProfile,
  updateDoctorProfile,
  getDoctorAppointments,
  getDoctorPatients,
  getDoctorReports,
  getDoctorsByHospital,
  getUpcomingAppointments,
  getAllDoctors,
  getTreatmentSuccessRates,
  getDoctorAppointmentAnalytics,
  getDoctorPatientAnalytics,
  deleteDoctor
} = require('../controllers/doctorController');
const { protect, doctorOnly, adminOnly } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getAllDoctors);
router.get('/hospital/:hospitalId', getDoctorsByHospital);

// Admin routes
router.delete('/:id', protect, adminOnly, deleteDoctor);

// Alternative delete routes for backward compatibility
router.delete('/', protect, adminOnly, (req, res) => {
  if (req.body && req.body.doctorId) {
    req.params.id = req.body.doctorId;
    return deleteDoctor(req, res);
  }
  return res.status(400).json({ message: 'Doctor ID is required' });
});

router.post('/delete', protect, adminOnly, (req, res) => {
  if (req.body && req.body.doctorId) {
    req.params.id = req.body.doctorId;
    return deleteDoctor(req, res);
  }
  return res.status(400).json({ message: 'Doctor ID is required' });
});

// Protected routes (require authentication)
router.get('/stats', protect, doctorOnly, getDoctorStats);
router.get('/appointments/today', protect, doctorOnly, getTodayAppointments);
router.get('/notifications', protect, doctorOnly, getDoctorNotifications);
router.put('/notifications/:id', protect, doctorOnly, markNotificationAsRead);

router.get('/profile', protect, doctorOnly, getDoctorProfile);
router.put('/profile', protect, doctorOnly, updateDoctorProfile);
router.get('/appointments', protect, doctorOnly, getDoctorAppointments);
router.get('/patients', protect, doctorOnly, getDoctorPatients);
router.get('/reports', protect, doctorOnly, getDoctorReports);
router.get('/appointments/upcoming', protect, doctorOnly, getUpcomingAppointments);

router.get('/analytics/success-rates', protect, doctorOnly, getTreatmentSuccessRates);
router.get('/analytics/appointments', protect, doctorOnly, getDoctorAppointmentAnalytics);
router.get('/analytics/patients', protect, doctorOnly, getDoctorPatientAnalytics);

module.exports = router; 