const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  actorName: {
    type: String
  },
  actorEmail: {
    type: String
  },
  actorRole: {
    type: String,
    enum: ['staff', 'doctor', 'admin']
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },
  action: {
    type: String,
    enum: [
      'appointment_created',
      'appointment_confirmed',
      'appointment_cancelled',
      'appointment_completed',
      'appointment_updated',
      'appointment_not_appeared',
      'patient_checked_in',
      'patient_completed',
      'patient_registered',
      'prescription_added',
      'report_generated',
      'report_updated',
      'staff_login',
      'doctor_login',
      'update_treatment',
      'expense_added',
      'expense_updated',
      'expense_deleted'
    ],
    required: true
  },
  subject: {
    type: String,
    enum: ['appointment', 'patient', 'prescription', 'report', 'staff', 'doctor', 'user', 'expense'],
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  type: {
    type: String,
    enum: [
      'appointment_created',
      'appointment_confirmed',
      'appointment_cancelled',
      'appointment_completed',
      'appointment_updated',
      'appointment_not_appeared',
      'patient_checked_in',
      'patient_completed',
      'patient_registered',
      'prescription_added',
      'report_generated',
      'report_updated',
      'staff_login',
      'doctor_login',
      'expense_added',
      'expense_updated',
      'expense_deleted'
    ]
  },
  description: {
    type: String
  },
  details: {
    type: String
  },
  status: {
    type: String,
    enum: ['success', 'warning', 'error'],
    default: 'success'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  relatedActivities: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Activity'
  }]
}, {
  timestamps: true
});

// Create indexes for efficient querying
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ actorId: 1 });
activitySchema.index({ patientId: 1 });
activitySchema.index({ subject: 1, subjectId: 1 });
activitySchema.index({ hospitalId: 1, createdAt: -1 });
activitySchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);