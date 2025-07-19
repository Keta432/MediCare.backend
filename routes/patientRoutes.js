const express = require('express');
const router = express.Router();
const {
  createOrUpdatePatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  getPatientsByHospital,
  searchPatients,
  getPatientsByDoctor,
  getTotalPatientsCount
} = require('../controllers/patientController');
const { protect } = require('../middleware/authMiddleware');

// Public route for creating/updating patient during appointment booking
router.post('/', createOrUpdatePatient);

// Protected routes
router.get('/', protect, getPatients);
router.get('/count', protect, getTotalPatientsCount);
router.get('/search', protect, searchPatients);
router.get('/hospital/:hospitalId', protect, getPatientsByHospital);
router.get('/doctor/:doctorId', protect, getPatientsByDoctor);
router.get('/:id', protect, getPatientById);
router.put('/:id', protect, updatePatient);
router.delete('/:id', protect, deletePatient);

module.exports = router; 