const asyncHandler = require('express-async-handler');
const path = require('path');
const fs = require('fs');
const { generateImageUrl } = require('../utils/imageUrl');
const { ensureUploadsDir } = require('../utils/fileHelper');

// @desc    Upload files (primarily images)
// @route   POST /api/files/upload
// @access  Private
const handleFileUpload = asyncHandler(async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No files uploaded' 
      });
    }

    // With Cloudinary, req.files already contains URLs in the path property
    const urls = req.files.map(file => file.path);

    res.status(200).json({
      success: true,
      message: `${req.files.length} files uploaded successfully`,
      files: req.files.map(file => ({
        filename: file.filename || path.basename(file.path),
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        url: file.path // For Cloudinary, the path is the URL
      })),
      urls
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'File upload failed',
      code: error.code || 'SERVER_ERROR'
    });
  }
});

// @desc    Get uploaded file
// @route   GET /api/files/:filename
// @access  Public
const getFile = asyncHandler(async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // For Cloudinary files, redirect to the Cloudinary URL
    if (filename.includes('cloudinary')) {
      return res.redirect(filename);
    }
    
    // Legacy file handling for local files
    const filePath = path.join(ensureUploadsDir(), filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error retrieving file:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving file',
      error: error.message
    });
  }
});

module.exports = {
  handleFileUpload,
  getFile
}; 