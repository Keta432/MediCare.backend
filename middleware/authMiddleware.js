const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Not authorized');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

const staffOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'staff') {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized as staff');
  }
});

const adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized as an admin');
  }
});

const doctorOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'doctor') {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized as a doctor');
  }
});

const authorize = (roles) => {
  return (req, res, next) => {
    // Convert roles to array if it's not already
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    if (!roleArray.includes(req.user.role)) {
      res.status(403);
      throw new Error(`Role ${req.user.role} is not authorized to access this route`);
    }
    next();
  };
};

const staffOrAdmin = asyncHandler(async (req, res, next) => {
  if (req.user && (req.user.role === 'staff' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized. Requires staff or admin role');
  }
});

const staffOrDoctor = asyncHandler(async (req, res, next) => {
  if (req.user && (req.user.role === 'staff' || req.user.role === 'doctor')) {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized. Requires staff or doctor role');
  }
});

module.exports = {
  protect,
  staffOnly,
  adminOnly,
  doctorOnly,
  authorize,
  staffOrAdmin,
  staffOrDoctor
}; 