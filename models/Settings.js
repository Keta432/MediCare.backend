const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  hospitalName: {
    type: String,
    required: true,
    default: 'My Hospital'
  },
  email: {
    type: String,
    required: true,
    default: 'admin@hospital.com'
  },
  phone: {
    type: String,
    required: true,
    default: '+1234567890'
  },
  emailNotifications: {
    type: Boolean,
    default: true
  },
  smsNotifications: {
    type: Boolean,
    default: false
  },
  timezone: {
    type: String,
    default: 'UTC-5'
  },
  dateFormat: {
    type: String,
    default: 'MM/DD/YYYY'
  },
  language: {
    type: String,
    default: 'English'
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Settings', settingsSchema); 