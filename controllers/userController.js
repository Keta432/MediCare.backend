const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Activity = require('../models/Activity');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Verify token
// @route   GET /api/users/verify
// @access  Private
const verifyToken = async (req, res) => {
    try {
        res.json({
            user: {
                _id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                gender: req.user.gender,
                role: req.user.role,
                hospital: req.user.hospital
            }
        });
    } catch (error) {
        res.status(401).json({ message: 'Token is invalid' });
    }
};

// @desc    Register new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
    try {
        const { name, email, gender, password } = req.body;

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Validate required fields
        if (!name || !email || !gender || !password) {
            return res.status(400).json({ message: 'Please fill all required fields' });
        }

        // Validate gender
        if (!['male', 'female', 'other'].includes(gender)) {
            return res.status(400).json({ message: 'Invalid gender specified' });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            gender,
            password
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                gender: user.gender,
                role: user.role,
                token: generateToken(user._id)
            });
        }
    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            res.status(400).json({ message: messages.join(', ') });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // Find user by email
        const user = await User.findOne({ email });
        console.log('Login attempt for email:', email);
        
        if (!user) {
            console.log('User not found:', email);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Check if user is active
        if (user.status !== 'active') {
            console.log('Inactive user attempted login:', email);
            return res.status(401).json({ message: 'Account is not active. Please contact support.' });
        }

        // Check password
        const isMatch = await user.matchPassword(password);
        console.log('Password match result:', isMatch);

        if (isMatch) {
            // Log activity for staff and doctor logins
            if (user.role === 'staff' || user.role === 'doctor') {
                await Activity.create({
                    user: user._id,
                    hospitalId: user.hospital,
                    actorId: user._id,
                    action: `${user.role}_login`,
                    subject: 'user',
                    subjectId: user._id,
                    type: `${user.role}_login`,
                    description: `${user.role === 'staff' ? 'Staff' : 'Doctor'} logged in: ${user.name}`,
                    status: 'success'
                });
            }

            const token = generateToken(user._id);
            console.log('Login successful for:', email);

            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                gender: user.gender,
                role: user.role,
                hospital: user.hospital,
                token
            });
        } else {
            console.log('Invalid password for user:', email);
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(400).json({ message: error.message || 'Error logging in' });
    }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
  try {
    const { search, sort = "recent", limit = 10 } = req.query;
    let query = {};
    
    // Add search functionality
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { role: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Determine sort order
    let sortOption = {};
    if (sort === "recent") {
      sortOption = { createdAt: -1 };
    } else if (sort === "name") {
      sortOption = { name: 1 };
    } else if (sort === "role") {
      sortOption = { role: 1 };
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort(sortOption)
      .limit(Number(limit));
      
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    console.log('Update user request:', {
      userId: req.params.id,
      body: req.body
    });

    const user = await User.findById(req.params.id);

    if (user) {
      // Check if role is being updated to doctor and specialization is required
      if (req.body.role === 'doctor' && !req.body.specialization) {
        return res.status(400).json({ message: 'Specialization is required for doctors' });
      }

      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.role = req.body.role || user.role;
      user.hospital = req.body.hospital || user.hospital;
      user.contact = req.body.contact || user.contact;
      user.status = req.body.status || user.status;
      user.specialization = req.body.specialization || user.specialization;
      
      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();
      console.log('Updated user:', {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        hospital: updatedUser.hospital,
        contact: updatedUser.contact,
        status: updatedUser.status,
        specialization: updatedUser.specialization
      });

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        hospital: updatedUser.hospital,
        contact: updatedUser.contact,
        status: updatedUser.status,
        specialization: updatedUser.specialization
      });
    } else {
      console.log('User not found:', req.params.id);
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Update error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      res.status(400).json({ message: messages.join(', ') });
    } else {
      res.status(400).json({ message: error.message });
    }
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      await user.deleteOne();
      res.json({ message: 'User removed' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile: user.profile,
        hospital: user.hospital
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      if (req.body.password) {
        user.password = req.body.password;
      }
      if (req.body.profile) {
        user.profile = { ...user.profile, ...req.body.profile };
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        profile: updatedUser.profile,
        token: generateToken(updatedUser._id)
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Change user password
// @route   PUT /api/users/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide current and new password' });
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get admin dashboard activities
// @route   GET /api/users/activities
// @access  Private/Admin
const getAdminActivities = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Get recent activities across all hospitals
    const activities = await Activity.find({})
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('actorId', 'name role')
      .populate('patientId', 'name')
      .populate('hospitalId', 'name');
    
    // Format activities for easier frontend display
    const formattedActivities = activities.map(activity => ({
      _id: activity._id,
      actor: activity.actorId?.name || activity.actorName || 'System',
      actorRole: activity.actorId?.role || activity.actorRole || 'system',
      actorEmail: activity.actorId?.email || activity.actorEmail || 'system@example.com',
      patient: activity.patientId?.name || 'N/A',
      action: activity.action,
      description: activity.description,
      hospital: activity.hospitalId?.name || 'N/A',
      status: activity.status,
      time: activity.createdAt,
      metadata: activity.metadata
    }));
    
    res.json(formattedActivities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get growth metrics for admin dashboard
// @route   GET /api/users/growth
// @access  Private/Admin
const getGrowthMetrics = async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    // Get users registered in the last 30 days
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    // Get users registered in the previous 30 days
    const previousUsers = await User.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
    });
    
    // Calculate user growth percentage
    const userGrowth = previousUsers === 0 
      ? 100 
      : Math.round(((recentUsers - previousUsers) / previousUsers) * 100);
    
    // Get counts by role for current period
    const doctorsCount = await User.countDocuments({
      role: 'doctor',
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    const previousDoctorsCount = await User.countDocuments({
      role: 'doctor',
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
    });
    
    // Calculate doctor growth percentage
    const doctorGrowth = previousDoctorsCount === 0 
      ? 100 
      : Math.round(((doctorsCount - previousDoctorsCount) / previousDoctorsCount) * 100);
    
    // Return growth metrics
    res.json({
      userGrowth,
      doctorGrowth,
      recentUsers,
      previousUsers,
      doctorsCount,
      previousDoctorsCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get admin notifications (recent messages)
// @route   GET /api/users/notifications
// @access  Private/Admin
const getAdminNotifications = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const userId = req.user._id;
    
    // Find all conversations for the admin
    const conversations = await Conversation.find({
      participants: userId
    }).sort({ updatedAt: -1 });
    
    const conversationIds = conversations.map(c => c._id);
    
    // Get the latest message from each conversation
    const messages = await Message.find({
      conversation: { $in: conversationIds },
      receiver: userId
    })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('sender', 'name role')
      .populate('conversation');
    
    // Format notifications
    const notifications = messages.map(message => {
      return {
        _id: message._id,
        sender: message.sender.name,
        senderRole: message.sender.role,
        content: message.content.substring(0, 50) + (message.content.length > 50 ? '...' : ''),
        time: message.createdAt,
        read: message.read,
        conversationId: message.conversation._id
      };
    });
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Set password for onboarded user
// @route   POST /api/users/onboard-setup
// @access  Public
const setOnboardingPassword = async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;

        // Validate fields
        if (!email || !password || !confirmPassword) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // Validate password match
        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }

        // Find user by email
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found. Please check your email address.' });
        }

        // Check if user was onboarded via CSV
        if (!user.isOnboarded) {
            return res.status(400).json({ 
                message: 'This email is not associated with hospital onboarding. Please use the regular signup form.' 
            });
        }

        // Check if user has already set password
        if (user.hasSetPassword) {
            return res.status(400).json({ 
                message: 'You have already set your password. Please use the login form.'
            });
        }

        // Update user's password and hasSetPassword flag
        user.password = password;
        user.hasSetPassword = true;
        await user.save();

        // Return success with user info and token
        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            gender: user.gender,
            role: user.role,
            token: generateToken(user._id),
            message: 'Password set successfully. You can now log in.'
        });
    } catch (error) {
        console.error('Error setting password:', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};

// @desc    Check if email is eligible for onboarding setup
// @route   POST /api/users/check-onboarding
// @access  Public
const checkOnboardingEligibility = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Please provide an email address' });
        }

        // Find user by email
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ 
                eligible: false, 
                message: 'Email not found. Please check your email address.' 
            });
        }

        // Check if user was onboarded via CSV
        if (!user.isOnboarded) {
            return res.status(200).json({ 
                eligible: false, 
                message: 'This email is not associated with hospital onboarding.' 
            });
        }

        // Check if user has already set password
        if (user.hasSetPassword) {
            return res.status(200).json({ 
                eligible: false, 
                message: 'You have already set your password. Please use the login form.' 
            });
        }

        // User is eligible for onboarding setup
        res.status(200).json({ 
            eligible: true, 
            message: 'You can set your password for this account.',
            name: user.name,
            role: user.role
        });
    } catch (error) {
        console.error('Error checking onboarding eligibility:', error);
        res.status(500).json({ 
            eligible: false,
            message: 'Server error. Please try again later.' 
        });
    }
};

// Alias for getAllUsers to match the route naming
const getUsers = getAllUsers;

// Export all the controller functions for use in routes
module.exports = {
  registerUser,
  loginUser,
  verifyToken,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  getAdminActivities,
  getGrowthMetrics,
  getAdminNotifications,
  setOnboardingPassword,
  checkOnboardingEligibility
}; 