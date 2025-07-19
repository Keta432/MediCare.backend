const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  submitFeedback,
  getAllFeedback,
  updateFeedbackStatus,
  getUserFeedback
} = require('../controllers/feedbackController');
const { upload } = require('../config/cloudinary');

// Submit feedback - can be used by authenticated users
router.post('/', protect, upload.single('screenshot'), submitFeedback);

// Get all feedback - admin only
router.get('/', protect, authorize('admin'), getAllFeedback);

// Update feedback status - admin only
router.put('/:id', protect, authorize('admin'), updateFeedbackStatus);

// Get user's own feedback
router.get('/my', protect, getUserFeedback);

module.exports = router; 