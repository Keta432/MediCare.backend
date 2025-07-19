const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'success'],
    default: 'info'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  relatedTo: {
    type: String,
    enum: ['appointment', 'task', 'inventory', 'general'],
    default: 'general'
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedTo'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Notification', notificationSchema);