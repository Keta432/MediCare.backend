/**
 * Utility function to generate image URLs
 * Now handles Cloudinary URLs directly
 * 
 * @param {String} cloudinaryUrl - Cloudinary URL
 * @returns {String} - Complete URL to the image
 */
const generateImageUrl = (cloudinaryUrl) => {
  // If it's already a Cloudinary URL, just return it
  if (cloudinaryUrl && typeof cloudinaryUrl === 'string') {
    return cloudinaryUrl;
  }
  
  // Fallback for backward compatibility
  return '';
};

module.exports = { generateImageUrl }; 