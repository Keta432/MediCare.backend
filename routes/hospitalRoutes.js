const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getHospitals,
  getHospitalById,
  createHospital,
  updateHospital,
  deleteHospital,
  getHospitalPatientCount,
  getHospitalStats,
  uploadStaffFromCSV,
  getStaffByHospital
} = require('../controllers/hospitalController');
const multer = require('multer');

// Configure multer for CSV uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Public routes
router.get('/', getHospitals);

// Protected routes (admin only)
// Place specific routes before parameter routes
router.get('/patient-count', protect, adminOnly, getHospitalPatientCount);
router.get('/:id/stats', protect, getHospitalStats);
router.get('/:id/staff', protect, getStaffByHospital);

// Staff upload route
router.post('/staff-upload', protect, adminOnly, upload.single('file'), uploadStaffFromCSV);

router.post('/', protect, adminOnly, createHospital);
router.get('/:id', getHospitalById);
router.put('/:id', protect, adminOnly, updateHospital);
router.delete('/:id', protect, adminOnly, deleteHospital);

module.exports = router; 