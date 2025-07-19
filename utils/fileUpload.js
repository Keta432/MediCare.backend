const { cloudinary } = require('../config/cloudinary');

/**
 * Legacy adapter for older code that expects to use uploadFile
 * Now simply returns the Cloudinary URL from req.file
 * @param {Object} req - The request object
 * @returns {String} The Cloudinary URL
 */
const uploadFile = async (req) => {
  try {
    // If we have a file from Cloudinary multer middleware, return its path
    if (req.file) {
      return req.file.path;
    }
    
    // For backward compatibility
    if (req.files && req.files.length > 0) {
      return req.files[0].path;
    }
    
    return null;
  } catch (error) {
    console.error('Error in file upload:', error);
    throw new Error('File upload failed');
  }
};

/**
 * Upload a file directly to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer
 * @param {String} folder - The folder in Cloudinary to store the file
 * @returns {Promise<String>} The Cloudinary URL
 */
const uploadBufferToCloudinary = async (fileBuffer, options = {}) => {
  try {
    // Set default options
    const uploadOptions = {
      folder: options.folder || 'clinic-files',
      resource_type: 'auto',
      ...options
    };
    
    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      ).end(fileBuffer);
    });
    
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error('Cloudinary upload failed');
  }
};

module.exports = {
  uploadFile,
  uploadBufferToCloudinary
}; 