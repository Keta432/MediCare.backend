const express = require('express');
const router = express.Router();
const { handleFileUpload, getFile } = require('../controllers/fileController');
const { protect } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

// Protected routes (require authentication)
router.post('/upload', protect, upload.array('files', 10), handleFileUpload);

// Public routes
router.get('/:filename', getFile);

module.exports = router; 