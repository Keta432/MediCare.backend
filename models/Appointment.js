const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  date: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'not_appeared'],
    default: 'pending'
  },
  noShowReason: {
    type: String,
    default: ''
  },
  symptoms: String,
  notes: String,
  diagnosis: String,
  disease: String,
  treatmentOutcome: {
    type: String,
    enum: ['successful', 'partial', 'unsuccessful', 'ongoing'],
    default: 'ongoing'
  },
  treatmentEndDate: Date,
  
  // Follow-up related fields
  isFollowUp: {
    type: Boolean,
    default: false
  },
  needsTimeSlot: {
    type: Boolean,
    default: false
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  timeSlotConfirmed: {
    type: Boolean,
    default: false
  },
  originalAppointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  relatedReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  }
}, {
  timestamps: true
});

// Create indexes for efficient querying
appointmentSchema.index({ doctorId: 1, date: 1 });
appointmentSchema.index({ patientId: 1, status: 1 });
appointmentSchema.index({ disease: 1, treatmentOutcome: 1 });
appointmentSchema.index({ isFollowUp: 1, needsTimeSlot: 1 });
appointmentSchema.index({ date: 1, isFollowUp: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema); 