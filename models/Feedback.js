const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Allow anonymous feedback
  },
  type: {
    type: String,
    enum: ['suggestion', 'bug', 'feature', 'other'],
    default: 'suggestion'
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  screenshot: {
    type: String, // URL to the uploaded image
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'resolved', 'closed'],
    default: 'pending'
  },
  userInfo: {
    name: String,
    email: String,
    role: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema); 