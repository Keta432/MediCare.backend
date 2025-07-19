const mongoose = require('mongoose');

const hospitalSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a hospital name'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Please add an address']
  },
  contact: {
    type: String,
    required: [true, 'Please add a contact number']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  specialties: [{
    type: String,
    trim: true
  }],
  description: {
    type: String,
    required: [true, 'Please add a description'],
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  image: {
    type: String,
    default: '/default-hospital.jpg'
  },
  logo: {
    type: String,
    default: '/default-logo.png'
  },
  patientCount: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const Hospital = mongoose.model('Hospital', hospitalSchema);
module.exports = Hospital; 