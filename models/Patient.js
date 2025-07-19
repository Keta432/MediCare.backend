const mongoose = require('mongoose');

const patientSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date,
    required: false
  },
  age: {
    type: Number,
    required: false
  },
  gender: {
    type: String,
    required: false,
    enum: ['male', 'female', 'other', 'not_specified'],
    default: 'not_specified'
  },
  phone: {
    type: String
  },
  bloodGroup: {
    type: String,
    required: false,
    default: 'Not Specified'
  },
  medicalHistory: [{
    condition: String,
    diagnosedDate: Date,
    medications: [String],
    notes: String
  }],
  appointments: [{
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor'
    },
    date: Date,
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled'
    }
  }],
  allergies: [String],
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: false
  },
  primaryDoctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  treatmentDays: {
    type: Number,
    default: 0
  },
  lastStatusChangeDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

patientSchema.index({ hospital: 1 });
patientSchema.index({ primaryDoctor: 1 });
patientSchema.index({ user: 1 });
patientSchema.index({ name: 1 });
patientSchema.index({ email: 1 });

module.exports = mongoose.model('Patient', patientSchema); 