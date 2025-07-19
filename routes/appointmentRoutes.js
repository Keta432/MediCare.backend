const express = require('express');
const router = express.Router();
const {
  bookAppointment,
  getDoctorAvailability,
  getAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  getAppointmentCount,
  getAvailableSlots,
  getDashboardStats,
  getPatientAppointments,
  updateTreatmentOutcome,
  updateFollowUpAppointment,
  getFollowUpAppointments,
  getAppointmentGrowthMetrics,
  checkInPatient
} = require('../controllers/appointmentController');
const { protect, doctorOnly, adminOnly, doctorStaffOnly } = require('../middleware/authMiddleware');

// Public routes
router.post('/', bookAppointment);
router.get('/doctor-availability', getDoctorAvailability);

// Protected routes
router.get('/available-slots', protect, getAvailableSlots);
router.get('/count', protect, getAppointmentCount);
router.get('/dashboard', protect, getDashboardStats);
router.get('/follow-ups', protect, getFollowUpAppointments);
router.get('/growth', protect, getAppointmentGrowthMetrics);
router.get('/patient/:patientId', protect, getPatientAppointments);
router.get('/', protect, getAppointments);
router.get('/:id', protect, getAppointmentById);
router.put('/:id/status', protect, updateAppointmentStatus);
router.put('/:id/follow-up', protect, updateFollowUpAppointment);
router.put('/:id/treatment-outcome', protect, updateTreatmentOutcome);
router.patch('/:id/check-in', protect, checkInPatient);

module.exports = router; 