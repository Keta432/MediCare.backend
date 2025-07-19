const fs = require('fs');
const path = require('path');
const { cloudinary } = require('../config/cloudinary');

/**
 * Ensures the uploads directory exists (legacy support)
 * @returns {string} Path to the uploads directory
 */
const ensureUploadsDir = () => {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory dynamically');
  }
  return uploadsDir;
};

/**
 * Safely writes a file to the uploads directory
 * @param {Object} file - File object with buffer data
 * @param {string} filename - Name to save the file as
 * @returns {Promise<string>} Path to the saved file
 */
const saveFileSafely = async (file, filename) => {
  const uploadsDir = ensureUploadsDir();
  const filePath = path.join(uploadsDir, filename);
  
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, file.buffer, (err) => {
      if (err) {
        console.error('Error saving file:', err);
        reject(err);
      } else {
        resolve(filePath);
      }
    });
  });
};

/**
 * Safely deletes a file from Cloudinary
 * @param {string} cloudinaryUrl - Cloudinary URL of the image to delete
 * @returns {Promise<boolean>} Success status
 */
const deleteFileSafely = async (cloudinaryUrl) => {
  try {
    // Extract public_id from Cloudinary URL
    if (!cloudinaryUrl || typeof cloudinaryUrl !== 'string') {
      return true; // No URL to delete, consider successful
    }
    
    // Check if it's a Cloudinary URL
    if (cloudinaryUrl.includes('cloudinary.com')) {
      // Extract the public_id from the URL
      // Example URL: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/clinic-reports/abc123def456.jpg
      const urlParts = cloudinaryUrl.split('/');
      const filenameWithExtension = urlParts[urlParts.length - 1];
      const filename = filenameWithExtension.split('.')[0];
      
      // Construct public_id with folder (clinic-reports/filename)
      const folderName = urlParts[urlParts.length - 2];
      const public_id = `${folderName}/${filename}`;
      
      const result = await cloudinary.uploader.destroy(public_id);
      return result.result === 'ok';
    } 
    
    // For legacy local file storage
    else if (cloudinaryUrl.includes('/uploads/')) {
      const filePath = cloudinaryUrl.split('/uploads/')[1];
      if (filePath) {
        const localFilePath = path.join(ensureUploadsDir(), filePath);
        
        return new Promise((resolve) => {
          fs.access(localFilePath, fs.constants.F_OK, (err) => {
            if (err) {
              // File doesn't exist, consider the deletion successful
              resolve(true);
              return;
            }
            
            // File exists, try to delete it
            fs.unlink(localFilePath, (err) => {
              if (err) {
                console.error(`Error deleting file ${localFilePath}:`, err);
                resolve(false);
              } else {
                resolve(true);
              }
            });
          });
        });
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    return false;
  }
};

module.exports = {
  ensureUploadsDir,
  saveFileSafely,
  deleteFileSafely
}; 