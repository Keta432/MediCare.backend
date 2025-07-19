const Feedback = require('../models/Feedback');
const User = require('../models/User');

/**
 * Submit feedback
 * @route POST /api/feedback
 * @access Private
 */
const submitFeedback = async (req, res) => {
  try {
    const { type, subject, message, userId } = req.body;
    
    // Validate required fields
    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required'
      });
    }
    
    // Create feedback object
    const feedbackData = {
      type: type || 'suggestion',
      subject,
      message,
      status: 'pending'
    };

    // Handle user info
    if (req.user) {
      feedbackData.userId = req.user._id;
      feedbackData.userInfo = {
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      };
    } else if (userId && userId !== 'anonymous') {
      // If userId is provided but user is not authenticated, try to fetch user info
      try {
        const user = await User.findById(userId);
        if (user) {
          feedbackData.userId = user._id;
          feedbackData.userInfo = {
            name: user.name,
            email: user.email,
            role: user.role
          };
        }
      } catch (error) {
        console.log('Error fetching user:', error.message);
      }
    }

    // Handle file upload via Cloudinary
    if (req.file) {
      // With Cloudinary, we already have the URL in req.file.path
      feedbackData.screenshot = req.file.path;
    }
    
    // Save feedback
    const feedback = await Feedback.create(feedbackData);
    
    res.status(201).json({
      success: true,
      data: feedback,
      message: 'Feedback submitted successfully'
    });
    
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting feedback',
      error: error.message
    });
  }
};

/**
 * Get all feedback (for admins)
 * @route GET /api/feedback
 * @access Admin
 */
const getAllFeedback = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this resource'
      });
    }
    
    // Query parameters for filtering
    const { status, type, page = 1, limit = 10 } = req.query;
    const queryOptions = {};
    
    if (status) queryOptions.status = status;
    if (type) queryOptions.type = type;
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get feedback with pagination
    const feedback = await Feedback.find(queryOptions)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCount = await Feedback.countDocuments(queryOptions);
    
    res.status(200).json({
      success: true,
      count: feedback.length,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page),
      data: feedback
    });
    
  } catch (error) {
    console.error('Error getting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting feedback',
      error: error.message
    });
  }
};

/**
 * Update feedback status (for admins)
 * @route PUT /api/feedback/:id
 * @access Admin
 */
const updateFeedbackStatus = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this resource'
      });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!status || !['pending', 'in-progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    // Update feedback
    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );
    
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: feedback,
      message: 'Feedback status updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating feedback status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating feedback status',
      error: error.message
    });
  }
};

/**
 * Get user's own feedback
 * @route GET /api/feedback/my
 * @access Private
 */
const getUserFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: feedback.length,
      data: feedback
    });
    
  } catch (error) {
    console.error('Error getting user feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user feedback',
      error: error.message
    });
  }
};

module.exports = {
  submitFeedback,
  getAllFeedback,
  updateFeedbackStatus,
  getUserFeedback
}; 